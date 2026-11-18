/**
 * utils/fechas.js
 * Helpers para la estructura de carpetas por año, mes y día.
 *
 * Estructura:
 *   comprobantes/2026/03.-MARZO/01 MARZO/<Grupo>/archivo.pdf
 */

const path = require('path');

const MESES = [
    'ENERO',
    'FEBRERO',
    'MARZO',
    'ABRIL',
    'MAYO',
    'JUNIO',
    'JULIO',
    'AGOSTO',
    'SEPTIEMBRE',
    'OCTUBRE',
    'NOVIEMBRE',
    'DICIEMBRE'
];

const RE_ANIO = /^\d{4}$/;
const RE_MES = /^\d{2}\.-[A-Z]+$/;
const RE_DIA = /^\d{2} [A-Z]+$/;
const RE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function aFechaLocal(valor) {
    if (valor instanceof Date) return valor;
    if (typeof valor === 'number') return new Date(valor);

    const texto = String(valor || '');
    const coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (coincidencia) {
        return new Date(Number(coincidencia[1]), Number(coincidencia[2]) - 1, Number(coincidencia[3]));
    }

    return new Date(texto);
}

/**
 * Convierte una fecha a los segmentos usados en disco.
 *
 * @param {Date|number|string} fecha
 * @returns {{ anio: string, mes: string, dia: string, iso: string, mesNumero: string, diaNumero: string }}
 */
function segmentosFecha(fecha) {
    const valor = aFechaLocal(fecha);
    const valida = Number.isNaN(valor.getTime()) ? new Date() : valor;

    const anio = String(valida.getFullYear());
    const mesNumero = String(valida.getMonth() + 1).padStart(2, '0');
    const diaNumero = String(valida.getDate()).padStart(2, '0');
    const nombreMes = MESES[valida.getMonth()];

    return {
        anio,
        mes: `${mesNumero}.-${nombreMes}`,
        dia: `${diaNumero} ${nombreMes}`,
        iso: `${anio}-${mesNumero}-${diaNumero}`,
        mesNumero,
        diaNumero
    };
}

/**
 * Ruta relativa Año/Mes/Día para una fecha.
 *
 * @param {Date|number|string} fecha
 * @returns {string}
 */
function rutaFecha(fecha) {
    const { anio, mes, dia } = segmentosFecha(fecha);
    return path.join(anio, mes, dia);
}

/**
 * Reconstruye la fecha ISO a partir de los nombres de carpeta.
 *
 * @param {string} anio
 * @param {string} mes
 * @param {string} dia
 * @returns {string|null}
 */
function fechaDesdeSegmentos(anio, mes, dia) {
    if (!RE_ANIO.test(String(anio))) return null;

    const coincidenciaMes = String(mes).match(/^(\d{2})\.-/);
    const coincidenciaDia = String(dia).match(/^(\d{2}) /);
    if (!coincidenciaMes || !coincidenciaDia) return null;

    const mesNumero = Number(coincidenciaMes[1]);
    const diaNumero = Number(coincidenciaDia[1]);
    if (mesNumero < 1 || mesNumero > 12) return null;
    if (diaNumero < 1 || diaNumero > 31) return null;

    return `${anio}-${String(mesNumero).padStart(2, '0')}-${String(diaNumero).padStart(2, '0')}`;
}

function esCarpetaAnio(nombre) {
    return RE_ANIO.test(String(nombre));
}

function esCarpetaMes(nombre) {
    return RE_MES.test(String(nombre));
}

function esCarpetaDia(nombre) {
    return RE_DIA.test(String(nombre));
}

function esFechaISO(valor) {
    return RE_ISO.test(String(valor));
}

module.exports = {
    MESES,
    segmentosFecha,
    rutaFecha,
    fechaDesdeSegmentos,
    esCarpetaAnio,
    esCarpetaMes,
    esCarpetaDia,
    esFechaISO
};
