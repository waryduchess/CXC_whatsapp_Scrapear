require('dotenv').config(); // 1. Cargar variables de entorno PRIMERO
const { instalarLogger } = require('./services/logger');
instalarLogger();
const fs = require('fs');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { procesarMedia } = require('./mediaHandler'); // 2. Importar el orquestador
const { filtroMensajes } = require('./services/filtroMensajes');
const { obtenerGruposBasicos, resolverNombreGrupo } = require('./services/filtroGrupos');
const { resolverCarpetaChat } = require('./services/carpetas');
const { confirmarMensaje } = require('./services/reacciones');
const { encolarAnalisis } = require('./services/colaIA');
const { estado, actualizarEstado, eventos } = require('./services/estado');
const { iniciarPanel } = require('./panel/server');
const { cargarConfig, configDesdeEntorno } = require('./services/configFiltros');

async function mensajeConIdentidadTelefonica(msg) {
    const chatId = msg.from;
    const identidad = msg.author || chatId;
    if (!identidad?.endsWith('@lid') || typeof msg.getContact !== 'function') {
        return msg;
    }

    try {
        const contacto = await msg.getContact();
        const id = contacto?.id?._serialized;
        const numero = contacto?.number;
        const identidadReal = id?.endsWith('@c.us') ? id : numero ? `${numero}@c.us` : null;

        if (!identidadReal) {
            console.warn(`[index] No se pudo resolver el número real de ${identidad}`);
            return msg;
        }

        return {
            ...msg,
            client: msg.client,
            ...(chatId.endsWith('@lid')
                ? { from: identidadReal }
                : { author: identidadReal })
        };
    } catch (error) {
        console.warn(`[index] No se pudo resolver el contacto ${identidad}:`, error.message || error);
        return msg;
    }
}

async function resolverNombreRemitente(msg, identidadFallback) {
    const id = msg.author || msg.from || identidadFallback || '';

    try {
        if (typeof msg.getContact === 'function') {
            const contacto = await msg.getContact();
            const nombre = String(contacto?.name || contacto?.pushname || '').trim();
            if (nombre) return nombre;
        }
    } catch (error) {
        console.warn(`[index] No se pudo resolver el remitente ${id}:`, error.message || error);
    }

    const numero = String(identidadFallback || id).split('@')[0];
    return numero || 'Sin nombre';
}

const configGuardada = cargarConfig();
const configInicial = configGuardada || configDesdeEntorno();
filtroMensajes.reemplazarConfiguracion(configInicial);
console.log(`[config] Filtros cargados desde ${configGuardada ? 'config/filtros.json' : '.env'}`);

function resolverEjecutableNavegador() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const candidatos = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    const encontrado = candidatos.find((ruta) => fs.existsSync(ruta));
    if (encontrado) {
        console.log(`[puppeteer] Usando navegador del sistema: ${encontrado}`);
    }
    return encontrado;
}

const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 120000,
    puppeteer: {
        headless: true,
        executablePath: resolverEjecutableNavegador(),
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

function obtenerGruposPanel() {
    const mapa = client.__gruposPorId;
    if (!mapa) return [];

    return [...mapa.entries()]
        .map(([id, chat]) => ({
            id,
            nombre: chat?.name || chat?.formattedTitle || ''
        }))
        .filter(grupo => /^\d+@g\.us$/.test(grupo.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

let qrSecuencia = 0;
let reiniciando = false;
let saliendo = false;
let watchdog = null;
let listenerNavegadorActivo = false;

async function cerrarCliente() {
    try {
        await Promise.race([
            Promise.resolve(client.destroy()).catch(() => {}),
            new Promise(resolve => setTimeout(resolve, 5000))
        ]);
    } catch (error) {
        console.warn('[proceso] No se pudo cerrar el cliente:', error.message || error);
    }
}

function cerrarServicio(motivo, codigo = 1) {
    if (saliendo || reiniciando) return;
    saliendo = true;
    actualizarEstado({
        fase: codigo === 0 ? 'reiniciando' : 'error',
        detalle: motivo,
        ultimoError: codigo === 0 ? null : motivo
    });
    console.error(`[proceso] ${motivo}. Cerrando para que PM2 reinicie...`);
    setTimeout(async () => {
        await cerrarCliente();
        process.exit(codigo);
    }, 1000);
}

function iniciarWatchdog() {
    const navegador = client.pupBrowser;
    if (navegador && !listenerNavegadorActivo) {
        listenerNavegadorActivo = true;
        navegador.on('disconnected', () => cerrarServicio('Chromium se desconectó'));
    }

    if (watchdog) return;

    watchdog = setInterval(() => {
        try {
            if (!client.pupBrowser || !client.pupBrowser.isConnected()) {
                cerrarServicio('Chromium no está conectado');
                return;
            }
            if (client.pupPage && client.pupPage.isClosed()) {
                cerrarServicio('La página de WhatsApp se cerró');
            }
        } catch (error) {
            cerrarServicio(`Error en watchdog: ${error.message || error}`);
        }
    }, 30000);

    console.log('[watchdog] Vigilancia de Chromium activa');
}

process.on('uncaughtException', (error) => {
    console.error('[proceso] Excepción no capturada:', error);
    cerrarServicio('Excepción no capturada');
});

process.on('unhandledRejection', (reason) => {
    console.error('[proceso] Promesa rechazada sin manejar:', reason);
    cerrarServicio('Promesa rechazada sin manejar');
});

process.on('SIGINT', () => {
    if (saliendo) return;
    saliendo = true;
    actualizarEstado({ fase: 'reiniciando', detalle: 'Deteniendo servicio...' });
    console.log('[proceso] Cerrando por SIGINT...');
    cerrarCliente().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
    if (saliendo) return;
    saliendo = true;
    actualizarEstado({ fase: 'reiniciando', detalle: 'Deteniendo servicio...' });
    console.log('[proceso] Cerrando por SIGTERM...');
    cerrarCliente().finally(() => process.exit(0));
});

process.on('message', (msg) => {
    if (msg === 'shutdown') {
        if (saliendo) return;
        saliendo = true;
        actualizarEstado({ fase: 'reiniciando', detalle: 'Deteniendo servicio...' });
        console.log('[proceso] Cerrando por señal de PM2...');
        cerrarCliente().finally(() => process.exit(0));
    }
});

client.on('change_state', (estadoCliente) => {
    console.log(`[WhatsApp] Estado del cliente: ${estadoCliente}`);
});

client.on('loading_screen', (percent, message) => {
    console.log(`[WhatsApp] Cargando: ${percent}% - ${message}`);
    if (estado.fase === 'listo' || estado.fase === 'autenticando') return;
    actualizarEstado({
        fase: 'iniciando',
        detalle: `Cargando WhatsApp: ${percent}% - ${message}`
    });
});

function aplicarEstadoListo(origen = 'ready') {
    const info = client.info || {};
    const numero = info.wid?.user || info.me?.user || info.wid?._serialized?.split('@')[0] || null;
    const nombre = info.pushname || info.me?.pushname || info.me?.name || null;

    actualizarEstado({
        fase: 'listo',
        detalle: 'Conectado y escuchando mensajes',
        qr: null,
        ultimoError: null,
        cuenta: {
            nombre,
            numero,
            plataforma: info.platform || null
        }
    });

    iniciarWatchdog();
    console.log(`[WhatsApp] Estado marcado como listo (${origen}).`);
}

client.on('authenticated', () => {
    qrSecuencia++;
    console.log('[WhatsApp] ¡Autenticado exitosamente!');
    actualizarEstado({
        fase: 'autenticando',
        detalle: 'Autenticado. Cargando chats...',
        qr: null,
        cuenta: null
    });

    // En algunas sesiones el evento ready no llega aunque la sesión ya funciona.
    // Si tras unos segundos hay sesión autenticada, se adjuntan los listeners y
    // se marca como conectada para no quedarse sordo a los mensajes.
    setTimeout(async () => {
        if (estado.fase === 'listo') return;
        if (!client.pupPage) return;

        try {
            await client.attachEventListeners();
            console.log('[WhatsApp] Listeners adjuntados manualmente.');
        } catch (error) {
            console.error('[WhatsApp] No se pudieron adjuntar los listeners:', error.message || error);
        }

        try {
            const chats = await obtenerGruposBasicos(client);
            client.__gruposPorId = new Map(
                chats
                    .map(chat => [
                        chat.id?._serialized || chat.id?.toString?.() || chat.id,
                        chat
                    ])
                    .filter(([id]) => typeof id === 'string' && id.endsWith('@g.us'))
            );
            console.log(`[filtroGrupos] Grupos cargados (respaldo): ${client.__gruposPorId.size}`);
        } catch (error) {
            console.warn('[filtroGrupos] No se pudo cargar la lista de grupos (respaldo):', error.message || error);
        }

        aplicarEstadoListo('respaldo tras autenticación');
    }, 10000);
});

client.on('auth_failure', (msg) => {
    qrSecuencia++;
    console.error('[WhatsApp] Falló la autenticación:', msg);
    actualizarEstado({
        fase: 'error',
        detalle: 'Falló la autenticación',
        ultimoError: String(msg),
        qr: null,
        cuenta: null
    });
    cerrarServicio('Falló la autenticación de WhatsApp');
});

client.on('disconnected', (reason) => {
    qrSecuencia++;
    console.warn('[WhatsApp] Cliente desconectado:', reason);
    if (reiniciando || saliendo) return;
    actualizarEstado({
        fase: 'desconectado',
        detalle: `Desconectado: ${reason}`,
        ultimoError: String(reason),
        qr: null,
        cuenta: null
    });
    cerrarServicio(`WhatsApp se desconectó: ${reason}`);
});

client.on('qr', async (qr) => {
    if (saliendo || reiniciando) return;
    const secuencia = ++qrSecuencia;

    qrcode.generate(qr, { small: true }, (codigo) => {
        process.stdout.write(`${codigo}\n`);
    });
    console.log('Escanea este código QR con tu aplicación de WhatsApp.');

    try {
        const dataUrl = await QRCode.toDataURL(qr, {
            margin: 1,
            width: 320,
            errorCorrectionLevel: 'M'
        });
        if (secuencia !== qrSecuencia || saliendo || reiniciando) return;
        actualizarEstado({
            fase: 'esperando_qr',
            detalle: 'Escanea el código QR con WhatsApp',
            qr: dataUrl,
            ultimoError: null,
            cuenta: null
        });
    } catch (error) {
        console.error('[WhatsApp] No se pudo generar la imagen del QR:', error.message || error);
        if (secuencia !== qrSecuencia || saliendo || reiniciando) return;
        actualizarEstado({
            fase: 'esperando_qr',
            detalle: 'Escanea el QR en la terminal',
            qr: null,
            cuenta: null
        });
    }
});

client.on('ready', async () => {
    qrSecuencia++;
    console.log('¡Cliente de WhatsApp listo y escuchando mensajes!');

    aplicarEstadoListo('evento ready');

    try {
        const chats = await obtenerGruposBasicos(client);
        client.__gruposPorId = new Map(
            chats
                .map(chat => [
                    chat.id?._serialized || chat.id?.toString?.() || chat.id,
                    chat
                ])
                .filter(([id]) => typeof id === 'string' && id.endsWith('@g.us'))
        );
        console.log(`[filtroGrupos] Grupos cargados para resolución por nombre: ${client.__gruposPorId.size}`);
    } catch (error) {
        console.warn('[filtroGrupos] No se pudo cargar la lista de grupos:', error.message || error);
    }
});

client.on('message_create', async (msg) => {
    // 1. Ignorar estados de WhatsApp, listas de difusión y mensajes propios
    if (msg.fromMe || msg.isStatus || msg.from === 'status@broadcast' || msg.broadcast) return;

    if (estado.fase !== 'listo') {
        aplicarEstadoListo('mensaje recibido');
    }

    const mensajeConContacto = await mensajeConIdentidadTelefonica(msg);
    const mensajeParaFiltro = await resolverNombreGrupo(mensajeConContacto);
    if (mensajeParaFiltro.groupId && mensajeParaFiltro.groupName) {
        filtroMensajes.registrarNombreGrupo(mensajeParaFiltro.groupId, mensajeParaFiltro.groupName);
    }
    const evaluacion = filtroMensajes.evaluarMensaje(mensajeParaFiltro);
    if (!evaluacion.permitido) {
        console.log(`[index] Mensaje descartado por filtro: ${evaluacion.razon}`);
        return;
    }

    // Log de visibilidad para diagnóstico
    console.log(`[WhatsApp Event] type=${msg.type}, from=${msg.from}, group=${mensajeParaFiltro.groupId || 'privado'}, to=${msg.to}, hasMedia=${msg.hasMedia}, fromMe=${msg.fromMe}`);

    // 2. Ignorar explícitamente stickers, audios, notas de voz, videos y reacciones
    if (['sticker', 'ptt', 'audio', 'video', 'reaction'].includes(msg.type)) return;

    // 3. Solo se almacenan imágenes y PDFs
    if (!msg.hasMedia) return;
    if (msg.type !== 'image' && msg.type !== 'document') return;

    const remitente = msg.author || msg.from;
    const nombreDesdeCaption = (msg.body || '').trim();

    try {
        const media = await msg.downloadMedia();
        if (!media || !media.mimetype) {
            console.warn(`[index] Descarga sin contenido o mimetype para ${remitente} (type=${msg.type})`);
            return;
        }

        const mimetype = media.mimetype.toLowerCase();
        const esImagen = mimetype.startsWith('image/');
        const esPdf = mimetype === 'application/pdf';
        if (!esImagen && !esPdf) {
            console.warn(`[index] Mimetype descartado para ${remitente}: ${mimetype}`);
            return;
        }

        const identidadRemitente = mensajeParaFiltro.author || mensajeParaFiltro.from || remitente;
        const nombreRemitente = await resolverNombreRemitente(msg, identidadRemitente);
        const carpetaChat = resolverCarpetaChat({
            groupId: mensajeParaFiltro.groupId,
            groupName: mensajeParaFiltro.groupName,
            remitente: nombreRemitente,
            from: mensajeParaFiltro.from || msg.from,
            gruposPorId: client.__gruposPorId
        });

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[+] Comprobante recibido de: ${nombreRemitente} (${identidadRemitente})`);
        console.log(`    Grupo/Chat: ${carpetaChat}`);
        console.log(`    Tipo: ${msg.type} (${mimetype})`);
        console.log(`    Nombre (caption): "${nombreDesdeCaption || '(vacío)'}"`);
        console.log(`${'='.repeat(60)}`);

        const fechaRecepcion = msg.timestamp ? new Date(msg.timestamp * 1000) : undefined;
        const resultado = await procesarMedia(media, nombreDesdeCaption || null, {
            fechaRecepcion,
            grupo: carpetaChat,
            remitente: nombreRemitente
        });

        if (resultado.exito) {
            const etiqueta = resultado.rutaRelativa || resultado.ruta;
            console.log(`[index] Archivo almacenado: ${etiqueta}`);
            eventos.emit('archivo', {
                fecha: resultado.fechaRecepcion,
                nombre: resultado.nombreArchivo,
                ruta: resultado.ruta,
                grupo: resultado.grupo,
                remitente: resultado.remitente
            });

            confirmarMensaje(msg, {
                grupo: resultado.grupo,
                remitente: resultado.remitente
            });

            try {
                encolarAnalisis({
                    rutaRelativa: resultado.rutaRelativa,
                    ruta: resultado.ruta,
                    mimetype,
                    buffer: esImagen ? Buffer.from(media.data, 'base64') : null
                });
            } catch (error) {
                console.warn('[ia] No se pudo encolar el análisis:', error.message || error);
            }
        } else if (resultado.rutaUsada !== 'ignorado') {
            console.warn(`[index] No se pudo almacenar el archivo de ${remitente}`);
        }
    } catch (error) {
        console.error(`[index] Error al procesar media de ${remitente}:`, error.message || error);
    }
});

iniciarPanel({
    obtenerGrupos: obtenerGruposPanel,
    onReiniciar: async () => {
        reiniciando = true;
        actualizarEstado({ fase: 'reiniciando', detalle: 'Reiniciando servicio...' });
        console.log('[panel] Reinicio solicitado desde el panel.');
        await cerrarCliente();
        process.exit(0);
    }
}).then(() => {
    actualizarEstado({ fase: 'iniciando', detalle: 'Iniciando WhatsApp...' });
    client.initialize()
        .then(() => {
            iniciarWatchdog();
            const pagina = client.pupPage;
            if (pagina) {
                pagina.on('pageerror', error => {
                    console.error('[WhatsApp][página] Error:', error.message || error);
                });
                pagina.on('console', mensaje => {
                    if (mensaje.type() === 'error') {
                        console.error('[WhatsApp][página]', mensaje.text());
                    }
                });
            }
        })
        .catch(async (err) => {
            console.error('[WhatsApp] Error al inicializar el cliente:', err.message || err);
            console.error('[WhatsApp] Detalle:', err.stack || err);
            actualizarEstado({
                fase: 'error',
                detalle: 'Error al inicializar WhatsApp',
                ultimoError: err.message || String(err)
            });
            await cerrarCliente();
            process.exit(1);
        });
}).catch((error) => {
    console.error('[panel] No se pudo iniciar el panel:', error.message || error);
    process.exit(1);
});