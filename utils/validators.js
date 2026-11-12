/**
 * validators.js
 * Utilidades para generar el nombre del archivo final.
 */

const MAX_NOMBRE_BASE = 120;
const NOMBRES_RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Genera el nombre sanitizado del archivo PDF final.
 * El nombre proviene del caption del mensaje de WhatsApp y debe ser válido
 * tanto en Linux como en Windows.
 *
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @returns {string} Nombre del archivo con extensión .pdf
 */
function generarNombreArchivo(nombreCliente) {
    let nombre = typeof nombreCliente === 'string' ? nombreCliente : '';

    // Caracteres inválidos en Windows, caracteres de control y espacios repetidos
    nombre = nombre
        .replace(/[\x00-\x1F<>:"/\\|?*%]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');

    // Windows no permite nombres de dispositivo como CON, PRN, AUX, NUL, COM1-9 o LPT1-9
    if (NOMBRES_RESERVADOS_WINDOWS.test(nombre)) {
        nombre = `_${nombre}`;
    }

    // Evitar rutas demasiado largas en Windows (MAX_PATH), sin cortar emojis
    if (Array.from(nombre).length > MAX_NOMBRE_BASE) {
        nombre = Array.from(nombre)
            .slice(0, MAX_NOMBRE_BASE)
            .join('')
            .trim()
            .replace(/[. ]+$/g, '');
    }

    if (!nombre || nombre === '.' || nombre === '..') {
        nombre = `comprobante_${Date.now()}`;
    }

    return `${nombre}.pdf`;
}

module.exports = {
    generarNombreArchivo
};
