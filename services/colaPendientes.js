/**
 * colaPendientes.js
 * Gestor de cola temporal para comprobantes recibidos sin caption.
 * Permite esperar el siguiente mensaje de texto del mismo remitente
 * para usar como nombre del cliente.
 */

const { prepararComprobante, guardarComprobante } = require('../mediaHandler');

class ColaPendientes {
    /**
     * @param {number} timeoutMs - Tiempo en ms para esperar el texto (default: 30000)
     * @param {Function} fnPreparar - Función de preparación/análisis (default: prepararComprobante)
     * @param {Function} fnGuardar - Función de guardado (default: guardarComprobante)
     */
    constructor(timeoutMs = 30000, fnPreparar = prepararComprobante, fnGuardar = guardarComprobante) {
        this.timeoutMs = timeoutMs;
        this.fnPreparar = fnPreparar;
        this.fnGuardar = fnGuardar;
        // Mapa: remitenteId -> { items: Array<{ promesaPreparacion, timestamp }>, timerId: Timeout }
        this.pendientes = new Map();
        // Callback opcional cuando se guardan comprobantes por timeout
        this.onTimeoutGuardado = null;
    }

    /**
     * Configura el tiempo de espera en milisegundos.
     * @param {number} ms 
     */
    setTimeoutMs(ms) {
        this.timeoutMs = ms;
    }

    /**
     * Configura el callback a ejecutar cuando se guarden comprobantes al vencer el timeout.
     * @param {Function} callback - fn(resultados, remitente)
     */
    setOnTimeoutGuardado(callback) {
        this.onTimeoutGuardado = callback;
    }

    /**
     * Registra un nuevo comprobante para un remitente.
     * Acepta un objeto media o una Promesa que resolverá el media.
     * 
     * @param {string} remitente - Identificador del remitente (ej: '52155...@c.us')
     * @param {Object|Promise<Object>} mediaOPromesa - Archivo media o promesa de descarga
     * @returns {void}
     */
    registrar(remitente, mediaOPromesa) {
        console.log(`[colaPendientes] Registrando comprobante para: ${remitente}`);

        // Preparar la promesa de análisis en segundo plano
        const promesaPreparacion = (async () => {
            try {
                const media = typeof mediaOPromesa.then === 'function' ? await mediaOPromesa : mediaOPromesa;
                if (!media) {
                    console.warn(`[colaPendientes] Media no válido para ${remitente} (descarga fallida o mimetype no soportado). El item se descartará.`);
                    return null;
                }
                return await this.fnPreparar(media);
            } catch (err) {
                console.error('[colaPendientes] Error preparando media:', err.message);
                return null;
            }
        })();

        let entrada = this.pendientes.get(remitente);

        if (!entrada) {
            entrada = {
                items: [],
                timerId: null
            };
            this.pendientes.set(remitente, entrada);
        }

        entrada.items.push({
            promesaPreparacion,
            timestamp: Date.now()
        });

        // Si ya hay un timer corriendo, se mantiene o renueva
        if (entrada.timerId) {
            clearTimeout(entrada.timerId);
        }

        console.log(`[colaPendientes] Esperando mensaje con nombre (${this.timeoutMs / 1000}s) para ${remitente}...`);

        entrada.timerId = setTimeout(async () => {
            await this._procesarPorTimeout(remitente);
        }, this.timeoutMs);
    }

    /**
     * Verifica si un remitente tiene comprobantes esperando nombre.
     * 
     * @param {string} remitente 
     * @returns {boolean}
     */
    tienePendientes(remitente) {
        const entrada = this.pendientes.get(remitente);
        return Boolean(entrada && entrada.items.length > 0);
    }

    /**
     * Cantidad de comprobantes pendientes para un remitente.
     * 
     * @param {string} remitente 
     * @returns {number}
     */
    cantidadPendientes(remitente) {
        const entrada = this.pendientes.get(remitente);
        return entrada ? entrada.items.length : 0;
    }

    /**
     * Resuelve los comprobantes pendientes asignándoles el nombre recibido en el texto.
     * 
     * @param {string} remitente 
     * @param {string} nombreCliente 
     * @returns {Promise<Array<Object>>} Resultados de guardado
     */
    async resolver(remitente, nombreCliente) {
        const entrada = this.pendientes.get(remitente);
        if (!entrada || entrada.items.length === 0) {
            return [];
        }

        if (entrada.timerId) {
            clearTimeout(entrada.timerId);
        }

        const items = entrada.items;
        this.pendientes.delete(remitente);

        console.log(`[colaPendientes] Resolviendo ${items.length} comprobante(s) de ${remitente} con nombre: "${nombreCliente}"`);

        const resultados = [];
        for (const item of items) {
            const preparado = await item.promesaPreparacion;
            if (!preparado) {
                console.warn(`[colaPendientes] Se omite el comprobante de ${remitente}: la preparación no produjo resultado (media inválido o análisis fallido).`);
                continue;
            }
            const res = await this.fnGuardar(preparado, nombreCliente);
            resultados.push(res);
        }

        return resultados;
    }

    /**
     * Ejecuta el guardado con timestamp cuando expira la ventana de tiempo.
     * @private
     */
    async _procesarPorTimeout(remitente) {
        const entrada = this.pendientes.get(remitente);
        if (!entrada || entrada.items.length === 0) return;

        this.pendientes.delete(remitente);
        console.log(`[colaPendientes] ⏰ Timeout expirado para ${remitente}. Guardando con timestamp por defecto...`);

        const resultados = [];
        for (const item of entrada.items) {
            const preparado = await item.promesaPreparacion;
            if (!preparado) {
                console.warn(`[colaPendientes] Se omite el comprobante de ${remitente}: la preparación no produjo resultado (media inválido o análisis fallido).`);
                continue;
            }
            const res = await this.fnGuardar(preparado, null);
            resultados.push(res);
        }

        if (typeof this.onTimeoutGuardado === 'function') {
            this.onTimeoutGuardado(resultados, remitente);
        }
    }

    /**
     * Limpia todas las colas y temporizadores activos.
     */
    destruir() {
        for (const [, entrada] of this.pendientes) {
            if (entrada.timerId) clearTimeout(entrada.timerId);
        }
        this.pendientes.clear();
    }
}

// Instancia singleton compartida
const colaPendientes = new ColaPendientes();

module.exports = {
    colaPendientes,
    ColaPendientes
};
