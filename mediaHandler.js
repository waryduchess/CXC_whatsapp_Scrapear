/**
 * mediaHandler.js
 * Orquestador principal: recibe media de WhatsApp, detecta el tipo,
 * convierte las imágenes a PDF y guarda el archivo final renombrado.
 */

const fs = require('fs');
const path = require('path');
const { imagenAPdf } = require('./services/pdfService');
const { generarNombreComprobante, sanitizarNombreCarpeta } = require('./utils/validators');
const { rutaFecha, segmentosFecha } = require('./utils/fechas');

// Carpeta de salida — todo se guarda como PDF
const COMPROBANTES_DIR = path.join(__dirname, 'comprobantes');

if (!fs.existsSync(COMPROBANTES_DIR)) {
    fs.mkdirSync(COMPROBANTES_DIR, { recursive: true });
}

/**
 * Formatea una fecha como YYYY-MM-DD usando la zona horaria local.
 *
 * @param {Date} fecha
 * @returns {string}
 */
function formatearFechaLocal(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

/**
 * Guarda el buffer con un nombre único dentro del directorio.
 * Usa el flag 'wx' para no sobrescribir si dos mensajes llegan a la vez.
 *
 * @param {string} directorio
 * @param {string} nombreArchivo
 * @param {Buffer} buffer
 * @returns {{ nombreArchivo: string, ruta: string }}
 */
function guardarArchivoUnico(directorio, nombreArchivo, buffer) {
    const ext = path.extname(nombreArchivo);
    const base = path.basename(nombreArchivo, ext);
    let candidato = nombreArchivo;
    let contador = 2;

    while (true) {
        const ruta = path.join(directorio, candidato);
        try {
            fs.writeFileSync(ruta, buffer, { flag: 'wx' });
            return { nombreArchivo: candidato, ruta };
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
            candidato = `${base}_${contador}${ext}`;
            contador++;
        }
    }
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
 * Genera el nombre único, crea la carpeta diaria y guarda el PDF en disco.
 *
 * @param {Object} preparado - Objeto retornado por prepararComprobante
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @param {{ fechaRecepcion?: number|Date, grupo?: string, remitente?: string }} [opciones] - Fecha, grupo/chat y remitente
 * @returns {Promise<{ exito: boolean, nombreArchivo: string|null, ruta: string|null, rutaRelativa?: string, rutaUsada: string, fechaRecepcion: string, grupo: string|null, remitente: string|null }>}
 */
async function guardarComprobante(preparado, nombreCliente, opciones = {}) {
    const { bufferPdf, rutaUsada } = preparado;

    const fechaRecibida = opciones.fechaRecepcion
        ? new Date(opciones.fechaRecepcion)
        : new Date();
    const fechaRecepcion = Number.isNaN(fechaRecibida.getTime()) ? new Date() : fechaRecibida;
    const fechaRecepcionStr = formatearFechaLocal(fechaRecepcion);

    const grupo = typeof opciones.grupo === 'string' ? opciones.grupo.trim() : '';
    const remitente = typeof opciones.remitente === 'string' ? opciones.remitente.trim() : '';
    const carpetaGrupo = grupo ? sanitizarNombreCarpeta(grupo) : '';
    const grupoFinal = carpetaGrupo || null;

    if (rutaUsada === 'ignorado' || !bufferPdf) {
        return {
            exito: false,
            nombreArchivo: null,
            ruta: null,
            rutaUsada: rutaUsada || 'ignorado',
            fechaRecepcion: fechaRecepcionStr,
            grupo: grupoFinal,
            remitente: remitente || null
        };
    }

    const carpetaDia = path.join(COMPROBANTES_DIR, rutaFecha(fechaRecepcion));
    const carpetaDestino = carpetaGrupo ? path.join(carpetaDia, carpetaGrupo) : carpetaDia;

    try {
        fs.mkdirSync(carpetaDestino, { recursive: true });

        const nombreBase = generarNombreComprobante(nombreCliente, remitente);
        const { nombreArchivo, ruta: rutaArchivo } = guardarArchivoUnico(carpetaDestino, nombreBase, bufferPdf);
        const segmentos = segmentosFecha(fechaRecepcion);
        const rutaRelativa = [
            segmentos.anio,
            segmentos.mes,
            segmentos.dia,
            carpetaGrupo,
            nombreArchivo
        ].filter(Boolean).join('/');
        console.log(`[mediaHandler] Guardado: ${rutaRelativa} (ruta: ${rutaUsada})`);

        return {
            exito: true,
            nombreArchivo,
            ruta: rutaArchivo,
            rutaRelativa,
            rutaUsada,
            fechaRecepcion: fechaRecepcionStr,
            grupo: grupoFinal,
            remitente: remitente || null
        };
    } catch (saveError) {
        console.error('[mediaHandler] Error al guardar archivo final:', saveError.message);
        return {
            exito: false,
            nombreArchivo: null,
            ruta: null,
            rutaUsada,
            fechaRecepcion: fechaRecepcionStr,
            grupo: grupoFinal,
            remitente: remitente || null
        };
    }
}

/**
 * Procesa un archivo de media recibido por WhatsApp (prepara y guarda de inmediato).
 *
 * @param {Object} media - Objeto de media de whatsapp-web.js (con .data y .mimetype)
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @param {{ fechaRecepcion?: number|Date, grupo?: string, remitente?: string }} [opciones] - Fecha, grupo/chat y remitente
 * @returns {Promise<{ exito: boolean, nombreArchivo: string|null, ruta: string|null, rutaRelativa?: string, rutaUsada: string, fechaRecepcion: string, grupo: string|null, remitente: string|null }>}
 */
async function procesarMedia(media, nombreCliente, opciones = {}) {
    const preparado = await prepararComprobante(media);
    return await guardarComprobante(preparado, nombreCliente, opciones);
}

module.exports = {
    procesarMedia,
    prepararComprobante,
    guardarComprobante,
    COMPROBANTES_DIR
};
