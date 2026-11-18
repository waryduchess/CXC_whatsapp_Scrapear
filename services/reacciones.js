/**
 * reacciones.js
 * Confirmación en WhatsApp de los comprobantes guardados.
 *
 * Reacciona con un emoji al mensaje original, en una cola secuencial con
 * retraso aleatorio. Lleva un registro diario en config/reacciones.json para
 * no repetir reacciones ni superar el tope configurado.
 */

const fs = require('fs');
const path = require('path');

const REGISTRO_PATH = path.join(__dirname, '..', 'config', 'reacciones.json');
const MAX_IDS = 2000;

function leerBooleano(valor, defecto) {
    if (valor === undefined || valor === null || valor === '') return defecto;
    return String(valor).trim().toLowerCase() === 'true';
}

function leerEntero(valor, defecto, minimo, maximo) {
    const numero = Number.parseInt(valor, 10);
    if (!Number.isFinite(numero)) return defecto;
    return Math.min(Math.max(numero, minimo), maximo);
}

function configDesdeEntorno(env = process.env) {
    const emoji = String(env.REACCION_EMOJI || '').trim();

    return {
        activa: leerBooleano(env.REACCION_ACTIVA, true),
        emoji: emoji ? emoji.slice(0, 16) : '🤖',
        retrasoMs: leerEntero(env.REACCION_RETRASO_MS, 1500, 0, 60000),
        maxDia: leerEntero(env.REACCION_MAX_DIA, 200, 0, 100000),
        maxEdadMin: leerEntero(env.REACCION_MAX_EDAD_MIN, 10, 0, 1440)
    };
}

function formatearFechaLocal(fecha = new Date()) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

function registroVacio() {
    return { dia: formatearFechaLocal(), total: 0, ids: {} };
}

function crearGestor(opciones = {}) {
    const config = { ...configDesdeEntorno(), ...(opciones.config || {}) };
    const registroPath = opciones.registroPath || REGISTRO_PATH;
    const registrar = opciones.log || console;

    let cola = Promise.resolve();
    let diaAvisoTope = null;

    function cargarRegistro() {
        let contenido;
        try {
            contenido = fs.readFileSync(registroPath, 'utf8');
        } catch (error) {
            if (error.code !== 'ENOENT') {
                registrar.warn('[reaccion] No se pudo leer el registro:', error.message || error);
            }
            return registroVacio();
        }

        let datos;
        try {
            datos = JSON.parse(contenido);
        } catch (error) {
            registrar.warn('[reaccion] El registro no contiene JSON válido; se reinicia.');
            return registroVacio();
        }

        if (!datos || datos.dia !== formatearFechaLocal() || typeof datos.ids !== 'object' || !datos.ids) {
            return registroVacio();
        }

        return {
            dia: datos.dia,
            total: Number.isFinite(datos.total) ? datos.total : Object.keys(datos.ids).length,
            ids: datos.ids
        };
    }

    function guardarRegistro(registro) {
        const entradas = Object.entries(registro.ids)
            .sort((a, b) => b[1] - a[1])
            .slice(0, MAX_IDS);
        const salida = {
            dia: registro.dia,
            total: registro.total,
            ids: Object.fromEntries(entradas)
        };

        fs.mkdirSync(path.dirname(registroPath), { recursive: true });

        const temporal = `${registroPath}.${process.pid}.tmp`;
        try {
            fs.writeFileSync(temporal, `${JSON.stringify(salida, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fs.renameSync(temporal, registroPath);
        } catch (error) {
            try {
                fs.rmSync(temporal, { force: true });
            } catch (limpiezaError) {
                // Sin acción: el temporal se sobrescribe en el siguiente intento.
            }
            registrar.warn('[reaccion] No se pudo guardar el registro:', error.message || error);
        }
    }

    function esperar(ms) {
        if (!ms) return Promise.resolve();
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function encolar(tarea) {
        cola = cola.then(tarea).catch(error => {
            registrar.warn('[reaccion] Error en la cola:', error.message || error);
        });
        return cola;
    }

    /**
     * Encola una reacción de confirmación para el mensaje indicado.
     * No bloquea: los errores se registran y el archivo ya quedó guardado.
     *
     * @param {object} msg - Mensaje original de whatsapp-web.js (debe tener react)
     * @param {object} [contexto] - Datos para el log (grupo, remitente)
     * @returns {Promise<void>|undefined}
     */
    function confirmarMensaje(msg, contexto = {}) {
        if (!config.activa || config.maxDia === 0) return;
        if (!msg || typeof msg.react !== 'function') return;

        const id = msg.id?._serialized || msg.id?.id;
        if (!id) return;

        const registro = cargarRegistro();
        if (registro.ids[id]) return;

        if (registro.total >= config.maxDia) {
            if (diaAvisoTope !== registro.dia) {
                diaAvisoTope = registro.dia;
                registrar.warn(`[reaccion] Tope diario alcanzado (${config.maxDia}); no se reaccionará más hoy.`);
            }
            return;
        }

        const timestamp = Number(msg.timestamp) * 1000;
        if (config.maxEdadMin > 0 && Number.isFinite(timestamp) && timestamp > 0) {
            const edadMin = (Date.now() - timestamp) / 60000;
            if (edadMin > config.maxEdadMin) {
                registrar.log(`[reaccion] Omitido: el mensaje tiene ${Math.round(edadMin)} min.`);
                return;
            }
        }

        const etiqueta = contexto.grupo
            ? `${contexto.grupo}/${contexto.remitente || 'sin remitente'}`
            : contexto.remitente || 'sin remitente';

        return encolar(async () => {
            const espera = config.retrasoMs + Math.floor(Math.random() * config.retrasoMs);
            await esperar(espera);

            const actual = cargarRegistro();
            if (actual.ids[id]) return;
            if (actual.total >= config.maxDia) return;

            try {
                await msg.react(config.emoji);
            } catch (error) {
                registrar.warn(`[reaccion] No se pudo reaccionar al mensaje de ${etiqueta}:`, error.message || error);
                return;
            }

            actual.ids[id] = Date.now();
            actual.total += 1;
            guardarRegistro(actual);
            registrar.log(`[reaccion] Confirmado ${config.emoji} a ${etiqueta}`);
        });
    }

    function esperarReacciones() {
        return cola;
    }

    function obtenerConfig() {
        return { ...config, registroPath };
    }

    return {
        confirmarMensaje,
        esperarReacciones,
        obtenerConfig
    };
}

const gestor = crearGestor();

module.exports = {
    REGISTRO_PATH,
    configDesdeEntorno,
    crearGestor,
    confirmarMensaje: gestor.confirmarMensaje,
    esperarReacciones: gestor.esperarReacciones,
    obtenerConfig: gestor.obtenerConfig
};
