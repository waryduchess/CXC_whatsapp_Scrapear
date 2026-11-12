/**
 * validators.js
 * Utilidades para generar el nombre del archivo final.
 */

const MAX_NOMBRE_BASE = 100;
const MAX_CARPETA_BASE = 80;
const NOMBRES_RESERVADOS_WINDOWS = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

function normalizarParaComparar(valor) {
    return String(valor || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('es-MX')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function sanitizarNombreBase(nombre, maximo) {
    let valor = typeof nombre === 'string' ? nombre : '';

    valor = valor
        .replace(/[\x00-\x1F<>:"/\\|?*%]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');

    if (NOMBRES_RESERVADOS_WINDOWS.test(valor)) {
        valor = `_${valor}`;
    }

    if (Array.from(valor).length > maximo) {
        valor = Array.from(valor)
            .slice(0, maximo)
            .join('')
            .trim()
            .replace(/[. ]+$/g, '');
    }

    if (!valor || valor === '.' || valor === '..') {
        return '';
    }

    return valor;
}

/**
 * Genera el nombre sanitizado del archivo PDF final.
 * El nombre proviene del caption del mensaje de WhatsApp y debe ser válido
 * tanto en Linux como en Windows.
 *
 * @param {string|null} nombreCliente - Nombre tomado del caption del mensaje
 * @returns {string} Nombre del archivo con extensión .pdf
 */
function generarNombreArchivo(nombreCliente) {
    const nombre = sanitizarNombreBase(nombreCliente, MAX_NOMBRE_BASE) ||
        `comprobante_${Date.now()}`;

    return `${nombre}.pdf`;
}

function sanitizarNombreCarpeta(nombre) {
    return sanitizarNombreBase(nombre, MAX_CARPETA_BASE);
}

function generarNombreComprobante(caption, remitente) {
    const cap = typeof caption === 'string'
        ? caption.trim().replace(/\.pdf$/i, '').trim()
        : '';
    const rem = typeof remitente === 'string' ? remitente.trim() : '';

    if (rem && cap) {
        const capNormalizado = normalizarParaComparar(cap);
        const remNormalizado = normalizarParaComparar(rem);
        if (remNormalizado && capNormalizado.startsWith(remNormalizado)) {
            return generarNombreArchivo(cap);
        }
        return generarNombreArchivo(`${rem} - ${cap}`);
    }

    return generarNombreArchivo(rem || cap || null);
}

module.exports = {
    generarNombreArchivo,
    generarNombreComprobante,
    sanitizarNombreCarpeta,
    MAX_CARPETA_BASE
};
