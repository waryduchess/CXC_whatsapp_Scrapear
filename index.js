require('dotenv').config(); // 1. Cargar variables de entorno PRIMERO
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { procesarMedia } = require('./mediaHandler'); // 2. Importar el orquestador
const { filtroMensajes } = require('./services/filtroMensajes');
const { obtenerGruposBasicos, resolverNombreGrupo } = require('./services/filtroGrupos');

async function mensajeConIdentidadTelefonica(msg) {
    const chatId = msg.from;
    const identidad = msg.author || chatId;
    if (!identidad?.endsWith('@lid') || typeof msg.getContact !== 'function') {
        return msg;
    }

    try {
        const contacto = await msg.getContact();
        const id = contacto?.id?._serialized || contacto?.id?.$1;
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

function listaDesdeEnv(nombre) {
    return (process.env[nombre] || '')
        .split(',')
        .map(valor => valor.trim())
        .filter(Boolean);
}

const modoFiltro = process.env.FILTRO_MODO || 'todos';
const modosValidos = ['todos', 'whitelist', 'blacklist', 'solo_privados', 'solo_grupos'];
if (!modosValidos.includes(modoFiltro)) {
    throw new Error(`FILTRO_MODO inválido: "${modoFiltro}". Valores permitidos: ${modosValidos.join(', ')}`);
}

filtroMensajes.setModo(modoFiltro);
listaDesdeEnv('NUMEROS_PERMITIDOS').forEach(numero => filtroMensajes.agregarNumeroPermitido(numero));
listaDesdeEnv('NUMEROS_BLOQUEADOS').forEach(numero => filtroMensajes.agregarNumeroBloqueado(numero));
listaDesdeEnv('GRUPOS_PERMITIDOS').forEach(grupo => filtroMensajes.agregarGrupoPermitido(grupo));
listaDesdeEnv('GRUPOS_BLOQUEADOS').forEach(grupo => filtroMensajes.agregarGrupoBloqueado(grupo));

const client = new Client({
    authStrategy: new LocalAuth(),
    authTimeoutMs: 120000,
    puppeteer: {
        headless: true,
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

client.on('loading_screen', (percent, message) => {
    console.log(`[WhatsApp] Cargando: ${percent}% - ${message}`);
});

client.on('authenticated', () => {
    console.log('[WhatsApp] ¡Autenticado exitosamente!');
});

client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Falló la autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.warn('[WhatsApp] Cliente desconectado:', reason);
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Escanea este código QR con tu aplicación de WhatsApp.');
});

client.on('ready', async () => {
    console.log('¡Cliente de WhatsApp listo y escuchando mensajes!');
    try {
        const chats = await obtenerGruposBasicos(client);
        client.__gruposPorId = new Map(
            chats
                .map(chat => [
                    chat.id?._serialized || chat.id?.$1 || chat.id?.toString?.() || chat.id,
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

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[+] Comprobante recibido de: ${remitente}`);
        console.log(`    Tipo: ${msg.type} (${mimetype})`);
        console.log(`    Nombre (caption): "${nombreDesdeCaption || '(vacío)'}"`);
        console.log(`${'='.repeat(60)}`);

        const resultado = await procesarMedia(media, nombreDesdeCaption || null);

        if (resultado.exito) {
            console.log(`[index] Archivo almacenado: ${resultado.nombreArchivo}`);
        } else if (resultado.rutaUsada !== 'ignorado') {
            console.warn(`[index] No se pudo almacenar el archivo de ${remitente}`);
        }
    } catch (error) {
        console.error(`[index] Error al procesar media de ${remitente}:`, error.message || error);
    }
});

client.initialize()
    .catch(async (err) => {
        console.error('[WhatsApp] Error al inicializar el cliente:', err.message || err);
        console.error('[WhatsApp] Detalle:', err.stack || err);
        try {
            await client.destroy();
        } catch (errorCierre) {
            console.warn('[WhatsApp] No se pudo cerrar el cliente:', errorCierre.message || errorCierre);
        }
        process.exit(1);
    });
