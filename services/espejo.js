/**
 * services/espejo.js
 * Copia un comprobante desde COMPROBANTES_DIR a ONEDRIVE_DIR, manteniendo
 * la misma estructura de carpetas relativa (Año/Mes/Día/Grupo/archivo.pdf).
 *
 * Características:
 *  - No recopia si el destino ya existe con mismo tamaño y hash SHA-256.
 *  - Escribe a un archivo temporal en la MISMA carpeta y hace rename atómico.
 *  - Reintentos con backoff: 2s, 5s, 15s, 60s, 300s.
 *  - Maneja EBUSY, EPERM, EACCES, ENOENT (antivirus, OneDrive bloqueando).
 *  - No copia data/, config/, logs/ ni .env.
 *  - Función sincronizarTodo() escanea COMPROBANTES_DIR y espeja todo.
 *  - Si ONEDRIVE_DIR no está configurado/disponible, todas las funciones
 *    son no-op y devuelven { omitido: true, razon: '...' }.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { resolverComprobantesDir, resolverOneDriveDir, rutaRelativaUnix } = require('./rutas');

/* ─── Constantes ─────────────────────────────────────────────── */

// Carpetas que NUNCA se sincronizan
const CARPETAS_EXCLUIDAS = new Set(['datos', 'data', 'config', 'logs', '.wwebjs_auth', '.wwebjs_cache', 'node_modules']);

// Backoff en ms: 2s, 5s, 15s, 60s, 300s
const REINTENTOS_MS = [2000, 5000, 15000, 60000, 300000];

// Códigos de error que se reintentan (antivirus, OneDrive, etc.)
const ERRORES_REINTENTO = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOENT', 'EPIPE', 'EIO']);

// Estado del espejo y cola secuencial
const estado = {
    procesando: false,
    enCola: 0,
    copiados: 0,
    omitidos: 0,
    errores: 0,
    ultimo: null
};
const cola = [];
const enCola = new Set();
let promesaCola = Promise.resolve();

/* ─── Utilidades internas ─────────────────────────────────────── */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calcula el hash SHA-256 de un buffer (para comparar sin releer el archivo).
 * @param {Buffer} buf
 * @returns {string}
 */
function hashBuffer(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Calcula el hash SHA-256 de un archivo en disco.
 * @param {string} rutaArchivo
 * @returns {string}
 */
function hashArchivo(rutaArchivo) {
    return hashBuffer(fs.readFileSync(rutaArchivo));
}

/**
 * Escribe buf en destino usando un archivo temporal + rename atómico,
 * con reintentos ante bloqueos de OneDrive o antivirus.
 *
 * @param {string}  destino    Ruta final del archivo en ONEDRIVE_DIR
 * @param {Buffer}  buf        Contenido a escribir
 * @param {string}  relativa   Ruta relativa (solo para logs)
 * @returns {Promise<void>}
 */
async function escribirConReintentos(destino, buf, relativa) {
    const dir  = path.dirname(destino);
    const tmp  = path.join(dir, `.tmp_${Date.now()}_${path.basename(destino)}`);

    fs.mkdirSync(dir, { recursive: true });

    for (let intento = 0; intento <= REINTENTOS_MS.length; intento++) {
        try {
            fs.writeFileSync(tmp, buf);
            fs.renameSync(tmp, destino);
            return; // éxito
        } catch (err) {
            const esReintentable = ERRORES_REINTENTO.has(err.code) || ERRORES_REINTENTO.has(String(err.code));
            const hayMasIntentos = intento < REINTENTOS_MS.length;

            console.warn(
                `[espejo] Error ${err.code || err.message} escribiendo "${relativa}" ` +
                `(intento ${intento + 1}/${REINTENTOS_MS.length + 1})`
            );

            // Limpiar temp si quedó
            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (_) {}

            if (!esReintentable || !hayMasIntentos) {
                throw err;
            }

            const espera = REINTENTOS_MS[intento];
            console.log(`[espejo] Reintentando en ${espera / 1000}s...`);
            await sleep(espera);
        }
    }
}

/* ─── API pública ────────────────────────────────────────────── */

/**
 * Espeja un archivo recién guardado a ONEDRIVE_DIR.
 * No-op si ONEDRIVE_DIR no está disponible.
 *
 * @param {string} rutaOrigen  Ruta absoluta del archivo en COMPROBANTES_DIR
 * @param {Buffer} [bufOrigen] Buffer ya disponible (evita releer el archivo)
 * @returns {Promise<{ ok: boolean, omitido?: boolean, razon?: string, destino?: string }>}
 */
async function espejarArchivo(rutaOrigen, bufOrigen) {
    const comprobantesDir = resolverComprobantesDir();
    const onedriveDir     = resolverOneDriveDir();

    if (!onedriveDir) {
        return { ok: false, omitido: true, razon: 'ONEDRIVE_DIR no disponible' };
    }

    // Ruta relativa con "/"
    const relativa = rutaRelativaUnix(rutaOrigen, comprobantesDir);
    const segmentos = relativa.split('/');

    if (!relativa || relativa.startsWith('../') || path.isAbsolute(relativa) ||
        segmentos.includes('..')) {
        const razon = `ruta fuera de COMPROBANTES_DIR: ${relativa}`;
        console.error(`[espejo] ${razon}`);
        estado.errores++;
        estado.ultimo = { relativa, ok: false, razon };
        return { ok: false, razon };
    }

    // Ruta destino con sep del SO
    const destino  = path.join(onedriveDir, ...segmentos);

    try {
        const buf = bufOrigen || fs.readFileSync(rutaOrigen);

        // ¿Ya existe con mismo tamaño y hash?
        if (fs.existsSync(destino)) {
            const statDest = fs.statSync(destino);
            if (statDest.size === buf.length && hashArchivo(destino) === hashBuffer(buf)) {
                console.log(`[espejo] Sin cambios, omitido: ${relativa}`);
                estado.omitidos++;
                estado.ultimo = { relativa, ok: true, omitido: true };
                return { ok: true, omitido: true, razon: 'idéntico', destino };
            }
        }

        await escribirConReintentos(destino, buf, relativa);
        console.log(`[espejo] Copiado: ${relativa}`);
        estado.copiados++;
        estado.ultimo = { relativa, ok: true };
        return { ok: true, destino };

    } catch (err) {
        console.error(`[espejo] Error al espejar "${relativa}": ${err.message} (code: ${err.code})`);
        estado.errores++;
        estado.ultimo = { relativa, ok: false, razon: err.message };
        return { ok: false, razon: err.message, destino };
    }
}

/**
 * Encola un comprobante para copiarlo al espejo de forma secuencial.
 * No bloquea al llamador y deduplica por ruta de origen.
 *
 * @param {string} rutaOrigen
 * @param {Buffer} [bufOrigen]
 * @returns {boolean} true si quedó en la cola
 */
function encolarEspejo(rutaOrigen, bufOrigen) {
    if (!resolverOneDriveDir()) return false;

    const clave = path.resolve(rutaOrigen);
    if (enCola.has(clave)) return false;

    enCola.add(clave);
    cola.push({ rutaOrigen, bufOrigen });
    estado.enCola = cola.length;

    promesaCola = promesaCola.then(procesarCola).catch(() => {});
    return true;
}

async function procesarCola() {
    if (estado.procesando) return;

    estado.procesando = true;
    try {
        while (cola.length > 0) {
            const tarea = cola.shift();
            estado.enCola = cola.length;
            try {
                await espejarArchivo(tarea.rutaOrigen, tarea.bufOrigen);
            } catch (error) {
                estado.errores++;
                console.error('[espejo] Error inesperado en la cola:', error.message || error);
            } finally {
                enCola.delete(path.resolve(tarea.rutaOrigen));
            }
        }
    } finally {
        estado.procesando = false;
        estado.enCola = cola.length;
    }
}

/**
 * Espera a que la cola termine (útil para tests y apagado ordenado).
 *
 * @returns {Promise<void>}
 */
function esperarCola() {
    return promesaCola;
}

/**
 * Estado actual del espejo para logs o panel.
 *
 * @returns {{ activo: boolean, procesando: boolean, enCola: number, copiados: number, omitidos: number, errores: number, ultimo: Object|null }}
 */
function obtenerEstadoEspejo() {
    return {
        activo: Boolean(resolverOneDriveDir()),
        procesando: estado.procesando,
        enCola: estado.enCola,
        copiados: estado.copiados,
        omitidos: estado.omitidos,
        errores: estado.errores,
        ultimo: estado.ultimo
    };
}

/**
 * Escanea COMPROBANTES_DIR y espeja todos los archivos PDF a ONEDRIVE_DIR.
 * Los archivos ya idénticos se omiten.
 * No-op si ONEDRIVE_DIR no está disponible.
 *
 * @param {{ aplicar?: boolean }} opciones
 *   - aplicar: false → solo lista (dry-run), true → copia
 * @returns {Promise<{ total: number, copiados: number, omitidos: number, errores: number, items: Array }>}
 */
async function sincronizarTodo({ aplicar = false } = {}) {
    const comprobantesDir = resolverComprobantesDir();
    const onedriveDir     = resolverOneDriveDir();

    if (!onedriveDir) {
        console.warn('[espejo] sincronizarTodo: ONEDRIVE_DIR no disponible, nada que hacer.');
        return { total: 0, copiados: 0, omitidos: 0, errores: 0, items: [] };
    }

    const resumen = { total: 0, copiados: 0, omitidos: 0, errores: 0, items: [] };

    function recorrer(dir, nivel = 0) {
        let entradas;
        try { entradas = fs.readdirSync(dir); } catch (_) { return; }

        for (const nombre of entradas) {
            if (nombre.startsWith('.')) continue;
            if (nivel === 0 && CARPETAS_EXCLUIDAS.has(nombre.toLowerCase())) continue;

            const ruta = path.join(dir, nombre);
            let stat;
            try { stat = fs.statSync(ruta); } catch (_) { continue; }

            if (stat.isDirectory()) {
                recorrer(ruta, nivel + 1);
            } else if (stat.isFile() && nombre.toLowerCase().endsWith('.pdf')) {
                resumen.total++;
                const relativa = rutaRelativaUnix(ruta, comprobantesDir);
                resumen.items.push({ relativa, ruta });
            }
        }
    }

    recorrer(comprobantesDir);

    if (!aplicar) {
        console.log(`[espejo] Dry-run: ${resumen.total} PDF(s) encontrados en COMPROBANTES_DIR.`);
        return resumen;
    }

    for (const item of resumen.items) {
        const r = await espejarArchivo(item.ruta);
        if (r.ok && r.omitido) resumen.omitidos++;
        else if (r.ok)          resumen.copiados++;
        else                    resumen.errores++;
    }

    console.log(
        `[espejo] Sincronización completa: ` +
        `${resumen.copiados} copiados, ${resumen.omitidos} sin cambios, ${resumen.errores} errores.`
    );
    return resumen;
}

module.exports = {
    espejarArchivo,
    encolarEspejo,
    esperarCola,
    obtenerEstadoEspejo,
    sincronizarTodo
};
