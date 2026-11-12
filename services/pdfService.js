/**
 * pdfService.js
 * Conversión de imágenes a PDF y normalización de formatos.
 */

const PDFDocument = require('pdfkit');
const sharp = require('sharp');

const MIMETYPES_PDFKIT = new Set(['image/jpeg', 'image/jpg', 'image/png']);

/**
 * Normaliza cualquier imagen a un formato que pdfkit pueda incrustar.
 * JPEG/PNG se usan tal cual; el resto (webp, gif, bmp, etc.) se convierten a PNG.
 *
 * @param {Buffer} bufferImagen - Buffer de la imagen original
 * @param {string} [mimetype='image/jpeg'] - Tipo MIME de la imagen
 * @returns {Promise<Buffer>} Buffer listo para incrustar
 */
async function normalizarImagen(bufferImagen, mimetype = 'image/jpeg') {
    const tipo = String(mimetype).toLowerCase();

    if (MIMETYPES_PDFKIT.has(tipo)) {
        return bufferImagen;
    }

    return sharp(bufferImagen).png().toBuffer();
}

/**
 * Envuelve una imagen dentro de un archivo PDF.
 * Se usa para que fotos y screenshots se almacenen en formato uniforme PDF.
 *
 * @param {Buffer} bufferImagen - Buffer de la imagen
 * @param {string} [mimetype='image/jpeg'] - Tipo MIME de la imagen
 * @returns {Promise<Buffer>} Buffer del PDF generado
 */
async function imagenAPdf(bufferImagen, mimetype = 'image/jpeg') {
    const bufferNormalizado = await normalizarImagen(bufferImagen, mimetype);

    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ autoFirstPage: false });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Obtener dimensiones de la imagen para ajustar la página
            const img = doc.openImage(bufferNormalizado);
            doc.addPage({ size: [img.width, img.height] });
            doc.image(img, 0, 0, { width: img.width, height: img.height });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    normalizarImagen,
    imagenAPdf
};
