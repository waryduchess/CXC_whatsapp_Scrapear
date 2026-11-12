/**
 * mediaHandler.js
 * Orquestador principal: recibe media de WhatsApp, detecta el tipo,
 * convierte las imágenes a PDF y guarda el archivo final renombrado.
 */

const fs = require('fs');
const path = require('path');
const { imagenAPdf } = require('./services/pdfService');
const { generarNombreArchivo } = require('./utils/validators');

// Carpeta de salida — todo se guarda como PDF
const COMPROBANTES_DIR = path.join(__dirname, 'comprobantes');

if (!fs.existsSync(COMPROBANTES_DIR)) {
    fs.mkdirSync(COMPROBANTES_DIR, { recursive: true });
}

/**
 * Resuelve colisiones de nombres en el directorio de salida.
 * Si "Juan.pdf" ya existe, devuelve "Juan_2.pdf", etc.
 *
 * @param {string} directorio
 * @param {string} nombreArchivo
 * @returns {string} Nombre de archivo único
 */
function resolverNombreUnico(directorio, nombreArchivo) {
    let ruta = path.join(directorio, nombreArchivo);
    if (!fs.existsSync(ruta)) return nombreArchivo;

    const ext = path.extname(nombreArchivo);
    const base = path.basename(nombreArchivo, ext);
    let contador = 2;

    while (fs.existsSync(path.join(directorio, `${base}_${contador}${ext}`))) {
        contador++;
    }

    return `${base}_${contador}${ext}`;
}

/**
 * Convierte el media recibido al formato final (sin guardarlo).
 * - Imagen (cualquier image/*) → PDF.
 * - PDF → se conserva tal cual.
 *
 * @param {Object} media - Objeto de media de whatsapp-web.js (con .data y .mimetype)
 * @returns {Promise<{ bufferPdf: Buffer|null, rutaUsada: string }>}
 */
async function prepararComprobante(media) {
    const buffer = Buffer.from(media.data, 'base64');
    const mimetype = (media.mimetype || '').toLowerCase();

    // ── Ruta: PDF ──
    if (mimetype === 'application/pdf') {
        console.log('[mediaHandler] Tipo: PDF → se guarda tal cual');
        return { bufferPdf: buffer, rutaUsada: 'pdf' };
    }

    // ── Ruta: IMAGEN (cualquier image/*) ──
    if (mimetype.startsWith('image/')) {
        try {
            console.log(`[mediaHandler] Tipo: IMAGEN (${mimetype}) → convirtiendo a PDF`);
            const bufferPdf = await imagenAPdf(buffer, mimetype);
            return { bufferPdf, rutaUsada: 'imagen-pdf' };
        } catch (error) {
            console.error(`[mediaHandler] Error convirtiendo imagen a PDF (${mimetype}):`, error.message);
            return { bufferPdf: null, rutaUsada: 'ignorado' };
        }
    }

    // ── Tipo no soportado ──
    console.log(`[mediaHandler] Tipo no soportado: ${mimetype} → Ignorando`);
    return { bufferPdf: null, rutaUsada: 'ignorado' };
}

/**
 * Genera el nombre único y guarda el PDF en disco.
 *
 * @param {Object} preparado - Objeto retornado por prepararComprobante
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @returns {Promise<{ exito: boolean, nombreArchivo: string|null, ruta: string|null, rutaUsada: string }>}
 */
async function guardarComprobante(preparado, nombreCliente) {
    const { bufferPdf, rutaUsada } = preparado;

    if (rutaUsada === 'ignorado' || !bufferPdf) {
        return {
            exito: false,
            nombreArchivo: null,
            ruta: null,
            rutaUsada: rutaUsada || 'ignorado'
        };
    }

    const nombreBase = generarNombreArchivo(nombreCliente);
    const nombreArchivo = resolverNombreUnico(COMPROBANTES_DIR, nombreBase);
    const rutaArchivo = path.join(COMPROBANTES_DIR, nombreArchivo);

    try {
        fs.writeFileSync(rutaArchivo, bufferPdf);
        console.log(`[mediaHandler] Guardado: ${nombreArchivo} (ruta: ${rutaUsada})`);

        return {
            exito: true,
            nombreArchivo,
            ruta: rutaArchivo,
            rutaUsada
        };
    } catch (saveError) {
        console.error('[mediaHandler] Error al guardar archivo final:', saveError.message);
        return {
            exito: false,
            nombreArchivo: null,
            ruta: null,
            rutaUsada
        };
    }
}

/**
 * Procesa un archivo de media recibido por WhatsApp (prepara y guarda de inmediato).
 *
 * @param {Object} media - Objeto de media de whatsapp-web.js (con .data y .mimetype)
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @returns {Promise<{ exito: boolean, nombreArchivo: string|null, ruta: string|null, rutaUsada: string }>}
 */
async function procesarMedia(media, nombreCliente) {
    const preparado = await prepararComprobante(media);
    return await guardarComprobante(preparado, nombreCliente);
}

module.exports = {
    procesarMedia,
    prepararComprobante,
    guardarComprobante,
    COMPROBANTES_DIR
};
