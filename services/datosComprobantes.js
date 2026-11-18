/**
 * datosComprobantes.js
 * Almacén local (JSON) con los datos extraídos de cada comprobante.
 *
 * Se indexa por ruta relativa dentro de comprobantes/, por ejemplo:
 * 2026-11-18/Grupo/remitente - caption.pdf
 *
 * El archivo vive en datos/comprobantes.json y no se versiona porque contiene
 * montos, cuentas y nombres.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATOS_DIR = path.join(__dirname, '..', 'datos');
const ARCHIVO_DATOS = path.join(DATOS_DIR, 'comprobantes.json');
const VERSION = 1;

function normalizarRuta(rutaRelativa) {
    return String(rutaRelativa || '')
        .replace(/\\/g, '/')
        .replace(/^\.?\//, '')
        .replace(/\/{2,}/g, '/');
}

function hashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function hashArchivo(ruta) {
    try {
        return hashBuffer(fs.readFileSync(ruta));
    } catch (error) {
        return null;
    }
}

function crearAlmacen(opciones = {}) {
    const archivo = opciones.archivo || ARCHIVO_DATOS;
    const log = opciones.log || console;

    let cache = null;
    let cacheMtime = 0;

    function vacio() {
        return { version: VERSION, actualizado: new Date().toISOString(), registros: {} };
    }

    function leer() {
        let info;
        try {
            info = fs.statSync(archivo);
        } catch (error) {
            if (error.code !== 'ENOENT') {
                log.warn('[datos] No se pudo leer el almacén:', error.message || error);
            }
            return vacio();
        }

        if (cache && info.mtimeMs === cacheMtime) {
            return cache;
        }

        let contenido;
        try {
            contenido = fs.readFileSync(archivo, 'utf8');
        } catch (error) {
            log.warn('[datos] No se pudo abrir el almacén:', error.message || error);
            return vacio();
        }

        let datos;
        try {
            datos = JSON.parse(contenido);
        } catch (error) {
            log.warn('[datos] El almacén no contiene JSON válido; se ignora.');
            return vacio();
        }

        if (!datos || typeof datos !== 'object' || typeof datos.registros !== 'object' || !datos.registros) {
            return vacio();
        }

        cache = {
            version: Number(datos.version) || VERSION,
            actualizado: datos.actualizado || new Date().toISOString(),
            registros: datos.registros
        };
        cacheMtime = info.mtimeMs;
        return cache;
    }

    function guardar(datos) {
        const salida = {
            version: VERSION,
            actualizado: new Date().toISOString(),
            registros: datos.registros
        };

        fs.mkdirSync(path.dirname(archivo), { recursive: true });
        const temporal = `${archivo}.${process.pid}.tmp`;

        try {
            fs.writeFileSync(temporal, `${JSON.stringify(salida, null, 2)}\n`, {
                encoding: 'utf8',
                mode: 0o600
            });
            fs.renameSync(temporal, archivo);
        } catch (error) {
            try {
                fs.rmSync(temporal, { force: true });
            } catch (limpiezaError) {
                // Sin acción: el temporal se sobrescribe en el siguiente intento.
            }
            throw error;
        }

        try {
            cacheMtime = fs.statSync(archivo).mtimeMs;
        } catch (error) {
            cacheMtime = 0;
        }
        cache = salida;
        return salida;
    }

    function obtener(rutaRelativa) {
        const clave = normalizarRuta(rutaRelativa);
        return leer().registros[clave] || null;
    }

    function guardarRegistro(rutaRelativa, registro) {
        const clave = normalizarRuta(rutaRelativa);
        if (!clave) throw new Error('Ruta relativa vacía');

        const datos = leer();
        const previo = datos.registros[clave];
        const nuevo = { ...registro };

        // La marca de impresión es independiente del análisis de IA: se conserva
        // cuando la cola vuelve a guardar el registro.
        if (nuevo.impreso === undefined && previo?.impreso !== undefined) {
            nuevo.impreso = previo.impreso;
            nuevo.impresoEn = previo.impresoEn ?? null;
        }

        datos.registros[clave] = {
            ...nuevo,
            rutaRelativa: clave,
            actualizadoEn: new Date().toISOString()
        };
        guardar(datos);
        return datos.registros[clave];
    }

    function marcarImpreso(rutaRelativa, impreso = true) {
        const clave = normalizarRuta(rutaRelativa);
        if (!clave) throw new Error('Ruta relativa vacía');

        const datos = leer();
        const previo = datos.registros[clave] || { datos: null };
        const ahora = new Date().toISOString();

        datos.registros[clave] = {
            ...previo,
            impreso: Boolean(impreso),
            impresoEn: impreso ? ahora : null,
            rutaRelativa: clave,
            actualizadoEn: ahora
        };
        guardar(datos);
        return datos.registros[clave];
    }

    function eliminarRegistro(rutaRelativa) {
        const clave = normalizarRuta(rutaRelativa);
        const datos = leer();
        if (!datos.registros[clave]) return false;
        delete datos.registros[clave];
        guardar(datos);
        return true;
    }

    function renombrarRegistro(rutaAnterior, rutaNueva) {
        const claveAnterior = normalizarRuta(rutaAnterior);
        const claveNueva = normalizarRuta(rutaNueva);
        if (!claveAnterior || !claveNueva || claveAnterior === claveNueva) return null;

        const datos = leer();
        const registro = datos.registros[claveAnterior];
        if (!registro) return null;

        delete datos.registros[claveAnterior];
        datos.registros[claveNueva] = {
            ...registro,
            rutaRelativa: claveNueva,
            actualizadoEn: new Date().toISOString()
        };
        guardar(datos);
        return datos.registros[claveNueva];
    }

    function listar() {
        return Object.values(leer().registros);
    }

    function resumen() {
        const conteo = { total: 0, ok: 0, incompleto: 0, error: 0, pendiente: 0 };
        for (const registro of listar()) {
            // Registros creados solo para marcar impresión no cuentan como IA pendiente.
            if (!registro.estado) continue;
            conteo.total++;
            const estado = registro.estado;
            if (conteo[estado] === undefined) {
                conteo.pendiente++;
            } else {
                conteo[estado]++;
            }
        }
        return conteo;
    }

    return {
        archivo,
        leer,
        obtener,
        guardarRegistro,
        marcarImpreso,
        eliminarRegistro,
        renombrarRegistro,
        listar,
        resumen
    };
}

const almacen = crearAlmacen();

module.exports = {
    DATOS_DIR,
    ARCHIVO_DATOS,
    normalizarRuta,
    hashBuffer,
    hashArchivo,
    crearAlmacen,
    obtener: almacen.obtener,
    guardarRegistro: almacen.guardarRegistro,
    marcarImpreso: almacen.marcarImpreso,
    eliminarRegistro: almacen.eliminarRegistro,
    renombrarRegistro: almacen.renombrarRegistro,
    listar: almacen.listar,
    resumen: almacen.resumen
};
