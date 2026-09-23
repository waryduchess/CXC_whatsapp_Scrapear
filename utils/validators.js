/**
 * validators.js
 * Funciones de validación de datos financieros y generación de nombres de archivo.
 * Sin dependencias externas — funciones puras.
 */

/**
 * Verifica si el texto extraído de un PDF contiene datos financieros útiles.
 * Busca al menos 2 de 3 patrones: monto, fecha, referencia numérica.
 * 
 * @param {string} texto - Texto extraído del PDF
 * @returns {boolean} true si el texto tiene suficientes patrones financieros
 */
function tieneTextoFinanciero(texto) {
    if (!texto || texto.trim().length < 20) return false;

    let patronesEncontrados = 0;

    // Patrón 1: Monto — busca $ o números con formato monetario
    const regexMonto = /\$\s?\d{1,3}(,\d{3})*(\.\d{2})?|\d{1,3}(,\d{3})+\.\d{2}/;
    if (regexMonto.test(texto)) patronesEncontrados++;

    // Patrón 2: Fecha — formatos comunes en comprobantes mexicanos
    const regexFecha = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}\s+de\s+\w+\s+de\s+\d{4}/i;
    if (regexFecha.test(texto)) patronesEncontrados++;

    // Patrón 3: Referencia numérica larga (>6 dígitos consecutivos)
    const regexReferencia = /\d{7,}/;
    if (regexReferencia.test(texto)) patronesEncontrados++;

    return patronesEncontrados >= 2;
}

/**
 * Valida que los datos extraídos por la IA tengan los campos mínimos requeridos.
 * Un movimiento es válido si tiene monto y fecha. El banco NO se exige:
 * muchos comprobantes de compra/POS no muestran banco pero el movimiento existe.
 * 
 * @param {Object} datos - JSON extraído por Groq
 * @returns {{ valido: boolean, errores: string[] }}
 */
function validarDatosExtraidos(datos) {
    const errores = [];

    if (!datos || typeof datos !== 'object') {
        return { valido: false, errores: ['Datos vacíos o inválidos'] };
    }

    if (datos.monto == null) errores.push('monto es null');
    if (datos.fecha == null) errores.push('fecha es null');

    return {
        valido: errores.length === 0,
        errores
    };
}

/**
 * Genera el nombre sanitizado del archivo PDF final.
 * 
 * @param {string|null} nombreCliente - Nombre del cliente (del caption de WhatsApp)
 * @param {string|null} tipoError - Tipo de error si hubo fallo (null si fue exitoso)
 * @returns {string} Nombre del archivo con extensión .pdf
 */
function generarNombreArchivo(nombreCliente, tipoError = null) {
    let nombre;

    if (nombreCliente && nombreCliente.trim().length > 0) {
        nombre = nombreCliente.trim();
    } else {
        nombre = `comprobante_${Date.now()}`;
    }

    // Sanitizar caracteres no válidos para nombres de archivo
    nombre = nombre.replace(/[/\\?%*:|"<>]/g, '-');

    if (tipoError) {
        nombre = `${nombre}_ERROR_${tipoError}`;
    }

    return `${nombre}.pdf`;
}

module.exports = {
    tieneTextoFinanciero,
    validarDatosExtraidos,
    generarNombreArchivo
};
