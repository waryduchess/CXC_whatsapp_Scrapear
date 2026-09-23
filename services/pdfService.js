/**
 * pdfService.js
 * Operaciones con PDFs: extracción de texto, conversión PDF→imagen, conversión imagen→PDF.
 */

const { PDFParse } = require('pdf-parse');
const { execFile } = require('child_process');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Extrae el texto de un PDF.
 * Si el PDF es una imagen embebida (ej: Mifel), retornará un string vacío o con muy poco contenido.
 * 
 * @param {Buffer} bufferPdf - Buffer del archivo PDF
 * @returns {Promise<string>} Texto extraído del PDF
 */
async function extraerTexto(bufferPdf) {
    try {
        const parser = new PDFParse({ data: bufferPdf });
        const resultado = await parser.getText();
        return resultado.text || '';
    } catch (error) {
        console.warn('[pdfService] Error al extraer texto del PDF:', error.message);
        return '';
    }
}

/**
 * Convierte la primera página de un PDF a una imagen JPEG usando pdftoppm del sistema.
 * 
 * @param {Buffer} bufferPdf - Buffer del archivo PDF
 * @returns {Promise<Buffer>} Buffer de la imagen JPEG resultante
 */
async function pdfAImagen(bufferPdf) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-conv-'));
    const tmpPdfPath = path.join(tmpDir, 'input.pdf');
    const outPrefix = path.join(tmpDir, 'page');

    try {
        fs.writeFileSync(tmpPdfPath, bufferPdf);

        await new Promise((resolve, reject) => {
            execFile(
                'pdftoppm',
                ['-jpeg', '-singlefile', '-f', '1', '-l', '1', '-scale-to', '2048', tmpPdfPath, outPrefix],
                (err) => {
                    if (err) return reject(err);
                    resolve();
                }
            );
        });

        const archivoGenerado = path.join(tmpDir, 'page.jpg');
        if (!fs.existsSync(archivoGenerado)) {
            throw new Error('No se generó la imagen del PDF con pdftoppm');
        }

        const bufferImagen = fs.readFileSync(archivoGenerado);
        return bufferImagen;

    } finally {
        try {
            const archivos = fs.readdirSync(tmpDir);
            archivos.forEach(f => fs.unlinkSync(path.join(tmpDir, f)));
            fs.rmdirSync(tmpDir);
        } catch (e) {
            console.warn('[pdfService] Error al limpiar archivos temporales:', e.message);
        }
    }
}

/**
 * Envuelve una imagen (JPEG/PNG) dentro de un archivo PDF.
 * Se usa para que fotos y screenshots se almacenen en formato uniforme PDF.
 * 
 * @param {Buffer} bufferImagen - Buffer de la imagen
 * @param {string} [mimetype='image/jpeg'] - Tipo MIME de la imagen
 * @returns {Promise<Buffer>} Buffer del PDF generado
 */
async function imagenAPdf(bufferImagen, mimetype = 'image/jpeg') {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ autoFirstPage: false });
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Obtener dimensiones de la imagen para ajustar la página
            const img = doc.openImage(bufferImagen);
            doc.addPage({ size: [img.width, img.height] });
            doc.image(img, 0, 0, { width: img.width, height: img.height });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}

module.exports = {
    extraerTexto,
    pdfAImagen,
    imagenAPdf
};
