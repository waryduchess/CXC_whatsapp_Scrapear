/**
 * validators.js
 * Utilidades para generar el nombre del archivo final.
 */

/**
 * Genera el nombre sanitizado del archivo PDF final.
 * El nombre proviene del caption del mensaje de WhatsApp.
 *
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @returns {string} Nombre del archivo con extensión .pdf
 */
function generarNombreArchivo(nombreCliente) {
    let nombre = typeof nombreCliente === 'string' ? nombreCliente.trim() : '';

    // Sanitizar caracteres no válidos para nombres de archivo y espacios repetidos
    nombre = nombre
        .replace(/[/\\?%*:|"<>]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    if (!nombre || nombre === '.' || nombre === '..') {
        nombre = `comprobante_${Date.now()}`;
    }

    return `${nombre}.pdf`;
}

module.exports = {
    generarNombreArchivo
};
