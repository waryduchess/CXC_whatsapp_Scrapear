require('dotenv').config(); // 1. Cargar variables de entorno PRIMERO
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { procesarMedia } = require('./mediaHandler'); // 2. Importar el orquestador
const { colaPendientes } = require('./services/colaPendientes'); // 3. Gestor de mensajes pendientes

const client = new Client({
    authStrategy: new LocalAuth(),
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

// Callback cuando se guardan comprobantes por timeout (sin que llegara nombre posterior)
colaPendientes.setOnTimeoutGuardado((resultados, remitente) => {
    console.log(`\n[colaPendientes] Se guardaron ${resultados.length} comprobante(s) por tiempo agotado para ${remitente}:`);
    for (const res of resultados) {
        if (res.exito) {
            console.log(`  Archivo: ${res.nombreArchivo}`);
            console.dir(res.datos, { depth: null, colors: true });
        } else {
            console.warn(`  [!] Problemas en procesamiento → ${res.nombreArchivo}`);
        }
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

client.on('ready', () => {
    console.log('¡Cliente de WhatsApp listo y escuchando mensajes!');
});

client.on('message_create', async (msg) => {
    // 1. Ignorar estados de WhatsApp, listas de difusión y mensajes propios
    if (msg.fromMe || msg.isStatus || msg.from === 'status@broadcast' || msg.broadcast) return;

    // Log de visibilidad para diagnóstico
    console.log(`[WhatsApp Event] type=${msg.type}, from=${msg.from}, to=${msg.to}, hasMedia=${msg.hasMedia}, fromMe=${msg.fromMe}`);

    // 2. Ignorar explícitamente stickers, audios, notas de voz, videos, reacciones
    if (['sticker', 'ptt', 'audio', 'video', 'reaction'].includes(msg.type)) return;

    // Identificador único del remitente (compatible con chats individuales y grupos)
    const remitente = msg.author || msg.from;

    try {
        // ── CASO 1: Mensaje de TEXTO ──
        if (!msg.hasMedia && msg.body && msg.body.trim().length > 0) {
            const textoLimpio = msg.body.trim();

            if (colaPendientes.tienePendientes(remitente)) {
                console.log(`\n${'='.repeat(60)}`);
                console.log(`[+] Nombre recibido en mensaje de texto de: ${remitente}`);
                console.log(`    Nombre del cliente: "${textoLimpio}"`);
                console.log(`${'='.repeat(60)}`);

                const resultados = await colaPendientes.resolver(remitente, textoLimpio);

                if (resultados.length === 0) {
                    console.warn(`[index] El comprobante de ${remitente} se descartó (no había archivo válido para procesar).`);
                }

                for (const resultado of resultados) {
                    if (resultado.exito) {
                        console.log('Datos extraídos con éxito:');
                        console.dir(resultado.datos, { depth: null, colors: true });
                    } else if (resultado.rutaUsada !== 'ignorado') {
                        console.warn(`[!] Procesamiento con problemas → ${resultado.nombreArchivo}`);
                    }

                    // TODO: Enviar resultado.datos a API o base de datos PHP
                }
            } else {
                console.log(`[index] Mensaje de texto ignorado (sin comprobante pendiente) de ${remitente}: "${textoLimpio}"`);
            }
            return;
        }

        // Si no tiene media o es mensaje vacío, ignorar
        if (!msg.hasMedia) return;

        // Solo permitir mensajes de tipo imagen o documento (ignorar stickers, etc.)
        if (msg.type !== 'image' && msg.type !== 'document') return;

        // ── CASO 2: Mensaje con MULTIMEDIA (Solo JPG, PNG o PDF) ──
        // Registramos INMEDIATAMENTE en la cola de forma síncrona
        // Pasamos la promesa de descarga para evitar condiciones de carrera si el texto llega casi simultáneo
        const promesaMedia = msg.downloadMedia()
            .then(media => {
                if (!media || !media.mimetype) {
                    console.warn(`[index] Descarga sin contenido o mimetype para ${remitente} (type=${msg.type})`);
                    return null;
                }
                const mimetype = media.mimetype.toLowerCase();
                const MIMETYPES_VALIDOS = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
                if (!MIMETYPES_VALIDOS.includes(mimetype)) {
                    console.warn(`[index] Mimetype descartado para ${remitente}: ${mimetype}`);
                    return null;
                }
                return media;
            })
            .catch(err => {
                console.error(`[index] Error al descargar media de ${remitente}:`, err.message || err);
                return null;
            });

        console.log(`\n${'='.repeat(60)}`);
        console.log(`[+] Comprobante recibido de: ${remitente}`);
        console.log(`    Tipo mensaje: ${msg.type}`);
        console.log(`    (Registrado en cola; esperando o vinculando nombre del cliente)`);
        console.log(`${'='.repeat(60)}`);

        colaPendientes.registrar(remitente, promesaMedia);

        /*
        Pendientes por implementar:
        - Filtros: números de teléfono específicos, grupos específicos
        - Ignorar estados de WhatsApp
        - Sincronización con OneDrive
        - Categorización: conciliado vs. no conciliado
        */

    } catch (error) {
        console.error('Error al procesar el mensaje:', error.message);
    }
});

client.initialize()
    .catch((err) => {
        console.error('[WhatsApp] Error al inicializar el cliente:', err.message || err);
        console.error('[WhatsApp] Detalle:', err.stack || err);
        process.exit(1);
    });