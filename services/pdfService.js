/**
 * pdfService.js
 * Conversión de imágenes a PDF y normalización de formatos.
 */

const PDFDocument = require('pdfkit');
const sharp = require('sharp');

const MAX_LADO_IMAGEN = 1800;
const CALIDAD_JPEG = 85;
const MARGEN_PAGINA = 18;
const TAMANO_PAGINA = ['A4', 'LETTER'].includes(String(process.env.PDF_PAGINA || '').toUpperCase())
    ? String(process.env.PDF_PAGINA).toUpperCase()
    : 'A4';

/**
 * Normaliza, orienta, redimensiona y comprime una imagen para incrustarla en el PDF.
 * JPEG/PNG conservan su formato; el resto se convierte a PNG.
 *
 * @param {Buffer} bufferImagen - Buffer de la imagen original
 * @param {string} [mimetype='image/jpeg'] - Tipo MIME de la imagen
 * @returns {Promise<Buffer>} Buffer listo para incrustar
 */
async function normalizarImagen(bufferImagen, mimetype = 'image/jpeg') {
    const tipo = String(mimetype).toLowerCase();
    const imagen = sharp(bufferImagen)
        .rotate()
        .resize({
            width: MAX_LADO_IMAGEN,
            height: MAX_LADO_IMAGEN,
            fit: 'inside',
            withoutEnlargement: true
        });

    if (tipo === 'image/jpeg' || tipo === 'image/jpg') {
        return imagen.jpeg({ quality: CALIDAD_JPEG, mozjpeg: true }).toBuffer();
    }

    return imagen.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
}

/**
 * Envuelve una imagen dentro de un PDF de una sola página.
 * La imagen se escala y centra conservando su proporción.
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

            const img = doc.openImage(bufferNormalizado);
            const horizontal = img.width > img.height;
            doc.addPage({
                size: TAMANO_PAGINA,
                layout: horizontal ? 'landscape' : 'portrait'
            });

            const ancho = doc.page.width - (MARGEN_PAGINA * 2);
            const alto = doc.page.height - (MARGEN_PAGINA * 2);
            doc.image(img, MARGEN_PAGINA, MARGEN_PAGINA, {
                fit: [ancho, alto],
                align: 'center',
                valign: 'center'
            });

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
