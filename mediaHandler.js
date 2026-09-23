/**
 * mediaHandler.js
 * Orquestador principal: recibe media de WhatsApp, detecta tipo,
 * decide la ruta de procesamiento, extrae datos y guarda el archivo final.
 */

const fs = require('fs');
const path = require('path');
const { analizarImagen, analizarTexto } = require('./services/iaService');
const { extraerTexto, pdfAImagen, imagenAPdf } = require('./services/pdfService');
const { tieneTextoFinanciero, validarDatosExtraidos, generarNombreArchivo } = require('./utils/validators');

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
 * Realiza el análisis de IA y la conversión de formato del comprobante (sin guardarlo).
 * 
 * @param {Object} media - Objeto de media de whatsapp-web.js (con .data y .mimetype)
 * @returns {Promise<{ bufferPdf: Buffer|null, datos: Object|null, tipoError: string|null, rutaUsada: string }>}
 */
async function prepararComprobante(media) {
    const buffer = Buffer.from(media.data, 'base64');
    const mimetype = media.mimetype;

    let datos = null;
    let tipoError = null;
    let rutaUsada = '';
    let bufferPdf = null;

    try {
        // ── Ruta: IMAGEN (solo JPEG / PNG, nunca stickers webp) ──
        if (mimetype.startsWith('image/')) {
            if (mimetype === 'image/webp') {
                console.log(`[mediaHandler] Descartando formato no soportado (sticker/webp): ${mimetype}`);
                return {
                    bufferPdf: null,
                    datos: null,
                    tipoError: 'NO-SOPORTADO',
                    rutaUsada: 'ignorado'
                };
            }

            rutaUsada = 'imagen-vision';
            console.log(`[mediaHandler] Tipo: IMAGEN (${mimetype}) → Ruta: Groq visión`);

            datos = await analizarImagen(buffer);
            bufferPdf = await imagenAPdf(buffer, mimetype);

            return { bufferPdf, datos, tipoError: null, rutaUsada };
        }

        // ── Ruta: PDF ──
        if (mimetype === 'application/pdf') {
            console.log(`[mediaHandler] Tipo: PDF → Detectando contenido...`);

            // Paso 1: Intentar extraer texto
            const textoExtraido = await extraerTexto(buffer);

            // Paso 2: ¿Tiene datos financieros útiles?
            if (tieneTextoFinanciero(textoExtraido)) {
                rutaUsada = 'pdf-texto';
                console.log(`[mediaHandler] PDF con texto financiero → Ruta: Groq texto`);
                datos = await analizarTexto(textoExtraido);
            } else {
                rutaUsada = 'pdf-imagen';
                console.log(`[mediaHandler] PDF sin texto útil (imagen embebida) → Ruta: PDF→imagen→Groq visión`);

                // Convertir PDF a imagen y analizar con visión
                const bufferImagen = await pdfAImagen(buffer);
                datos = await analizarImagen(bufferImagen);
            }

            bufferPdf = buffer;
            return { bufferPdf, datos, tipoError: null, rutaUsada };
        }

        // ── Tipo no soportado ──
        console.log(`[mediaHandler] Tipo no soportado: ${mimetype} → Ignorando`);
        return {
            bufferPdf: null,
            datos: null,
            tipoError: 'NO-SOPORTADO',
            rutaUsada: 'ignorado'
        };

    } catch (error) {
        console.error(`[mediaHandler] Error en procesamiento (${rutaUsada}):`, error.message);

        if (error.message.includes('No se generó la imagen')) {
            tipoError = 'PDF-ILEGIBLE';
        } else if (error.status === 429 || error.statusCode === 429) {
            tipoError = 'IA-LIMITE';
        } else {
            tipoError = 'IA-FALLO';
        }

        try {
            bufferPdf = mimetype === 'application/pdf'
                ? buffer
                : await imagenAPdf(buffer, mimetype);
        } catch (convErr) {
            console.error('[mediaHandler] Error convirtiendo archivo con fallo a PDF:', convErr.message);
            bufferPdf = buffer;
        }

        return {
            bufferPdf,
            datos: null,
            tipoError,
            rutaUsada
        };
    }
}

/**
 * Valida los datos extraídos, genera el nombre único y guarda el PDF en disco.
 * 
 * @param {Object} preparado - Objeto retornado por prepararComprobante
 * @param {string|null} nombreCliente - Nombre del cliente asignado
 * @returns {Promise<{ exito: boolean, datos: Object|null, nombreArchivo: string|null, ruta: string|null, rutaUsada: string }>}
 */
async function guardarComprobante(preparado, nombreCliente) {
    const { bufferPdf, datos, tipoError: errorInicial, rutaUsada } = preparado;

    if (rutaUsada === 'ignorado' || !bufferPdf) {
        return {
            exito: false,
            datos: null,
            nombreArchivo: null,
            ruta: null,
            rutaUsada: rutaUsada || 'ignorado'
        };
    }

    let tipoError = errorInicial;

    // Si no hubo error de procesamiento previo, validar datos extraídos
    let validacion = { valido: false, errores: [] };
    if (!tipoError) {
        validacion = validarDatosExtraidos(datos);
        if (!validacion.valido) {
            console.warn(`[mediaHandler] Datos incompletos: ${validacion.errores.join(', ')}`);
            console.log('[mediaHandler] JSON extraído por la IA (para diagnóstico):');
            console.dir(datos, { depth: null, colors: true });
            tipoError = 'SIN-DATOS';
        }
    }

    const nombreBase = generarNombreArchivo(nombreCliente, tipoError);
    const nombreArchivo = resolverNombreUnico(COMPROBANTES_DIR, nombreBase);
    const rutaArchivo = path.join(COMPROBANTES_DIR, nombreArchivo);

    try {
        fs.writeFileSync(rutaArchivo, bufferPdf);
        console.log(`[mediaHandler] Guardado: ${nombreArchivo} (ruta: ${rutaUsada})`);

        return {
            exito: !tipoError,
            datos,
            nombreArchivo,
            ruta: rutaArchivo,
            rutaUsada
        };
    } catch (saveError) {
        console.error('[mediaHandler] Error al guardar archivo final:', saveError.message);
        return {
            exito: false,
            datos: null,
            nombreArchivo: null,
            ruta: null,
            rutaUsada
        };
    }
}

/**
 * Procesa un archivo de media recibido por WhatsApp completo (prepara y guarda de inmediato).
 * Mantiene compatibilidad directa.
 * 
 * @param {Object} media - Objeto de media de whatsapp-web.js (con .data y .mimetype)
 * @param {string|null} nombreCliente - Nombre del cliente (del caption del mensaje)
 * @returns {Promise<{ exito: boolean, datos: Object|null, nombreArchivo: string, ruta: string, rutaUsada: string }>}
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
