/**
 * configFiltros.js
 * Validación, persistencia y aplicación de la configuración de filtros.
 *
 * La configuración del panel se guarda en config/filtros.json y tiene
 * prioridad sobre las variables de entorno de .env.
 */

const fs = require('fs');
const path = require('path');
const { FiltroNumeros } = require('./filtroNumeros');

const MODOS = ['todos', 'whitelist', 'blacklist', 'solo_privados', 'solo_grupos'];
const CONFIG_PATH = path.join(__dirname, '..', 'config', 'filtros.json');
const RE_GRUPO_ID = /^\d+@g\.us$/;
const RE_NUMERO = /^[+\d\s().-]+$/;
const RE_CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_ENTRADAS = 500;
const MAX_LARGO = 120;

const normalizador = new FiltroNumeros();

function listaDesdeEnv(env, nombre) {
    return (env[nombre] || '')
        .split(',')
        .map(valor => valor.trim())
        .filter(Boolean);
}

function limpiarLista(valor, tipo, errores) {
    if (valor === undefined || valor === null) return [];

    if (!Array.isArray(valor)) {
        errores.push(`La lista de ${tipo} debe ser un arreglo.`);
        return [];
    }

    if (valor.length > MAX_ENTRADAS) {
        errores.push(`La lista de ${tipo} supera el máximo de ${MAX_ENTRADAS} entradas.`);
        return [];
    }

    const resultado = [];
    const vistos = new Set();

    for (const entrada of valor) {
        if (typeof entrada !== 'string') {
            errores.push(`Cada entrada de ${tipo} debe ser texto.`);
            continue;
        }

        const limpio = entrada.trim();
        if (!limpio) continue;

        if (limpio.length > MAX_LARGO) {
            errores.push(`Una entrada de ${tipo} supera ${MAX_LARGO} caracteres.`);
            continue;
        }

        if (RE_CONTROL.test(limpio)) {
            errores.push(`Una entrada de ${tipo} contiene caracteres inválidos.`);
            continue;
        }

        let normalizado;
        if (tipo === 'números') {
            if (!RE_NUMERO.test(limpio) || !/\d/.test(limpio)) {
                errores.push(`Número inválido: "${limpio}".`);
                continue;
            }
            normalizado = normalizador.normalizar(limpio);
            if (!normalizado) {
                errores.push(`Número inválido: "${limpio}".`);
                continue;
            }
        } else {
            if (limpio.includes('@') && !RE_GRUPO_ID.test(limpio)) {
                errores.push(`ID de grupo inválido: "${limpio}". Usa un nombre o un ID terminado en @g.us.`);
                continue;
            }
            normalizado = limpio;
        }

        const clave = tipo === 'números' ? normalizado : normalizado.toLocaleLowerCase('es-MX');
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        resultado.push(normalizado);
    }

    return resultado;
}

function validarConfig(datos) {
    const errores = [];
    const advertencias = [];

    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        return { valido: false, errores: ['La configuración debe ser un objeto.'], advertencias, config: null };
    }

    const modo = typeof datos.modo === 'string' ? datos.modo.trim() : 'todos';
    if (!MODOS.includes(modo)) {
        errores.push(`Modo inválido: "${datos.modo}". Valores permitidos: ${MODOS.join(', ')}.`);
    }

    const config = {
        modo: MODOS.includes(modo) ? modo : 'todos',
        numerosPermitidos: limpiarLista(datos.numerosPermitidos, 'números', errores),
        numerosBloqueados: limpiarLista(datos.numerosBloqueados, 'números', errores),
        gruposPermitidos: limpiarLista(datos.gruposPermitidos, 'grupos', errores),
        gruposBloqueados: limpiarLista(datos.gruposBloqueados, 'grupos', errores),
        permitirGrupos: datos.permitirGrupos !== false,
        permitirPrivados: datos.permitirPrivados !== false
    };

    for (const numero of config.numerosPermitidos) {
        if (numero.length === 10) {
            advertencias.push(
                `El número ${numero} tiene 10 dígitos. WhatsApp suele enviar el número con lada de país (por ejemplo 52...); verifica que sea el correcto.`
            );
        }
    }

    if (config.modo === 'whitelist' &&
        config.numerosPermitidos.length === 0 &&
        config.gruposPermitidos.length === 0) {
        advertencias.push('El modo whitelist está activo sin números ni grupos permitidos: se descartarán todos los mensajes.');
    }

    return {
        valido: errores.length === 0,
        errores,
        advertencias,
        config: errores.length === 0 ? config : null
    };
}

function configDesdeEntorno(env = process.env) {
    const config = {
        modo: (env.FILTRO_MODO || 'todos').trim(),
        numerosPermitidos: listaDesdeEnv(env, 'NUMEROS_PERMITIDOS'),
        numerosBloqueados: listaDesdeEnv(env, 'NUMEROS_BLOQUEADOS'),
        gruposPermitidos: listaDesdeEnv(env, 'GRUPOS_PERMITIDOS'),
        gruposBloqueados: listaDesdeEnv(env, 'GRUPOS_BLOQUEADOS'),
        permitirGrupos: env.PERMITIR_GRUPOS !== 'false',
        permitirPrivados: env.PERMITIR_PRIVADOS !== 'false'
    };

    const validacion = validarConfig(config);
    if (!validacion.valido) {
        throw new Error(`Configuración de filtros inválida en .env: ${validacion.errores.join(' ')}`);
    }

    return validacion.config;
}

function cargarConfig() {
    let contenido;
    try {
        contenido = fs.readFileSync(CONFIG_PATH, 'utf8');
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.warn('[config] No se pudo leer config/filtros.json:', error.message || error);
        }
        return null;
    }

    let datos;
    try {
        datos = JSON.parse(contenido);
    } catch (error) {
        console.warn('[config] config/filtros.json no contiene JSON válido; se usará .env.');
        return null;
    }

    const validacion = validarConfig(datos);
    if (!validacion.valido) {
        console.warn('[config] config/filtros.json es inválido; se usará .env:', validacion.errores.join(' '));
        return null;
    }

    return validacion.config;
}

function guardarConfig(datos) {
    const validacion = validarConfig(datos);
    if (!validacion.valido) {
        const error = new Error(validacion.errores.join(' '));
        error.errores = validacion.errores;
        throw error;
    }

    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });

    const temporal = `${CONFIG_PATH}.${process.pid}.tmp`;
    const contenido = `${JSON.stringify(validacion.config, null, 2)}\n`;

    try {
        fs.writeFileSync(temporal, contenido, { encoding: 'utf8', mode: 0o600 });
        fs.renameSync(temporal, CONFIG_PATH);
    } catch (error) {
        try {
            fs.rmSync(temporal, { force: true });
        } catch (limpiezaError) {
            // Sin acción: el archivo temporal se sobrescribe en el siguiente intento.
        }
        throw error;
    }

    return validacion;
}

function aplicarConfig(config) {
    const { filtroMensajes } = require('./filtroMensajes');
    const { eventos, obtenerEstado } = require('./estado');

    filtroMensajes.reemplazarConfiguracion(config);
    eventos.emit('estado', obtenerEstado());
}

function obtenerConfigActual() {
    const { filtroMensajes } = require('./filtroMensajes');
    return filtroMensajes.obtenerConfiguracion();
}

module.exports = {
    MODOS,
    CONFIG_PATH,
    validarConfig,
    configDesdeEntorno,
    cargarConfig,
    guardarConfig,
    aplicarConfig,
    obtenerConfigActual
};
