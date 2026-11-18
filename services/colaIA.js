/**
 * colaIA.js
 * Cola secuencial de análisis de comprobantes con DeepSeek.
 *
 * El análisis corre en segundo plano: el comprobante ya está guardado y la
 * reacción enviada antes de entrar aquí. Un fallo solo deja el registro en
 * estado "error" y puede reintentarse desde el panel.
 */

const fs = require('fs');
const path = require('path');
const iaService = require('./iaService');
const datosComprobantes = require('./datosComprobantes');
const { eventos } = require('./estado');
const { resolverComprobantesDir } = require('./rutas');
const COMPROBANTES_DIR = resolverComprobantesDir();

function crearCola(opciones = {}) {
    const analizar = opciones.analizar || iaService.analizarComprobante;
    const almacen = opciones.almacen || datosComprobantes;
    const log = opciones.log || console;
    const emitir = opciones.emitir || ((nombre, datos) => eventos.emit(nombre, datos));
    const comprobantesDir = opciones.comprobantesDir || COMPROBANTES_DIR;

    const cola = [];
    const enCola = new Set();
    let procesando = false;
    let ultimo = null;
    let promesaActual = Promise.resolve();

    function configurada() {
        return iaService.estaConfigurada();
    }

    function estado() {
        return {
            configurada: configurada(),
            modelo: iaService.configuracion().modelo,
            procesando,
            enCola: cola.length,
            ultimo,
            resumen: almacen.resumen()
        };
    }

    function notificar() {
        try {
            emitir('ia', estado());
        } catch (error) {
            log.warn('[ia] No se pudo emitir el estado:', error.message || error);
        }
    }

    function resolverRuta(rutaRelativa) {
        const relativa = datosComprobantes.normalizarRuta(rutaRelativa);
        const absoluta = path.resolve(comprobantesDir, relativa);
        const raiz = path.resolve(comprobantesDir);
        if (!absoluta.startsWith(raiz + path.sep)) {
            throw new Error('Ruta fuera de comprobantes');
        }
        if (!fs.existsSync(absoluta)) {
            throw new Error('El archivo no existe');
        }
        return absoluta;
    }

    async function analizarTarea(tarea) {
        const rutaRelativa = datosComprobantes.normalizarRuta(tarea.rutaRelativa);
        const ruta = tarea.ruta || resolverRuta(rutaRelativa);
        const nombreArchivo = path.basename(ruta);
        const previo = almacen.obtener(rutaRelativa);
        const buffer = tarea.buffer || fs.readFileSync(ruta);
        const mimetype = tarea.mimetype ||
            (/\.pdf$/i.test(nombreArchivo) ? 'application/pdf' : 'image/jpeg');

        if (previo?.estado === 'ok' && !tarea.forzar) {
            return previo;
        }

        const hash = datosComprobantes.hashBuffer(buffer);
        log.log(`[ia] Analizando ${rutaRelativa}`);

        let registro;
        try {
            const { datos, rutaUsada } = await analizar({
                buffer,
                mimetype,
                nombreArchivo
            });
            const validacion = iaService.validarDatos(datos);

            registro = {
                estado: validacion.valido ? 'ok' : 'incompleto',
                datos,
                rutaUsada,
                modelo: iaService.configuracion().modelo,
                analizadoEn: new Date().toISOString(),
                error: validacion.valido
                    ? null
                    : `Sin ${validacion.errores.join(' ni ')}`,
                hash
            };

            const resumenDatos = [datos.monto, datos.fecha].filter(Boolean).join(' · ');
            log.log(`[ia] ${validacion.valido ? 'Listo' : 'Incompleto'}: ${rutaRelativa}${resumenDatos ? ` (${resumenDatos})` : ''}`);
        } catch (error) {
            registro = {
                estado: 'error',
                datos: previo?.datos || null,
                rutaUsada: previo?.rutaUsada || null,
                modelo: iaService.configuracion().modelo,
                analizadoEn: new Date().toISOString(),
                error: error.message || String(error),
                hash
            };
            log.warn(`[ia] Error al analizar ${rutaRelativa}: ${registro.error}`);
        }

        almacen.guardarRegistro(rutaRelativa, registro);
        ultimo = { rutaRelativa, estado: registro.estado, error: registro.error };

        try {
            emitir('datos', { rutaRelativa, registro });
        } catch (error) {
            log.warn('[ia] No se pudo emitir el registro:', error.message || error);
        }

        return registro;
    }

    async function procesar() {
        if (procesando) return;
        procesando = true;
        notificar();

        try {
            while (cola.length > 0) {
                const tarea = cola.shift();
                try {
                    await analizarTarea(tarea);
                } catch (error) {
                    log.warn('[ia] Error inesperado en la cola:', error.message || error);
                } finally {
                    enCola.delete(datosComprobantes.normalizarRuta(tarea.rutaRelativa));
                    notificar();
                }
            }
        } finally {
            procesando = false;
            notificar();
        }
    }

    /**
     * Encola un comprobante para análisis.
     *
     * @param {{ rutaRelativa: string, ruta?: string, buffer?: Buffer, mimetype?: string, forzar?: boolean }} tarea
     * @returns {boolean} true si quedó en la cola
     */
    function encolar(tarea) {
        if (!configurada()) {
            log.warn('[ia] DEEPSEEK_API_KEY no está configurada; no se analiza el comprobante.');
            return false;
        }

        const rutaRelativa = datosComprobantes.normalizarRuta(tarea?.rutaRelativa);
        if (!rutaRelativa) return false;
        if (enCola.has(rutaRelativa)) return false;

        enCola.add(rutaRelativa);
        cola.push({ ...tarea, rutaRelativa });
        notificar();
        promesaActual = promesaActual.then(() => procesar()).catch(() => {});
        return true;
    }

    function esperar() {
        return promesaActual;
    }

    return {
        encolar,
        esperar,
        estado,
        analizarTarea,
        resolverRuta
    };
}

const cola = crearCola();

module.exports = {
    crearCola,
    encolarAnalisis: cola.encolar,
    esperarAnalisis: cola.esperar,
    obtenerEstadoIA: cola.estado,
    analizarArchivo: cola.analizarTarea,
    resolverRutaComprobante: cola.resolverRuta
};
