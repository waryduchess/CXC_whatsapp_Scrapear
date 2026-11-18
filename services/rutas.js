/**
 * services/rutas.js
 * Resolución y validación de rutas configurables del bot.
 *
 * Funciones:
 *   - Expande %VAR% y ~ en valores de .env (Windows y Linux).
 *   - Valida que COMPROBANTES_DIR sea escribible; falla en arranque si no.
 *   - Valida que ONEDRIVE_DIR sea escribible; solo avisa si falla.
 *   - Rechaza raíces de unidad (C:\) y rutas UNC (\\server\share).
 *   - Alerta si la ruta supera ~240 caracteres (problema MAX_PATH de Windows).
 *   - Compara rutas en minúsculas en Windows (NTFS case-insensitive).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ES_WINDOWS = process.platform === 'win32';

/* ─── Expansión de variables de entorno ─────────────────────── */

/**
 * Reemplaza %VAR% (Windows), $VAR / ${VAR} (Unix) y ~ (home) en una cadena.
 *
 * @param {string} valor
 * @returns {string}
 */
function expandirVariables(valor) {
    if (typeof valor !== 'string') return valor;

    // %VAR% → process.env.VAR   (Windows y, por comodidad, cualquier plataforma)
    valor = valor.replace(/%([^%]+)%/g, (_, nombre) =>
        process.env[nombre] ?? process.env[nombre.toUpperCase()] ?? `%${nombre}%`
    );

    // ${VAR} y $VAR → process.env.VAR   (Unix/cualquier plataforma)
    valor = valor.replace(/\$\{([^}]+)\}/g, (_, nombre) =>
        process.env[nombre] ?? `\${${nombre}}`
    );
    valor = valor.replace(/\$([A-Z_][A-Z0-9_]*)/gi, (match, nombre) =>
        process.env[nombre] ?? match
    );

    // ~ → home del usuario
    if (valor === '~' || valor.startsWith('~/') || valor.startsWith('~\\')) {
        valor = os.homedir() + valor.slice(1);
    }

    return valor;
}

/* ─── Normalización para comparar (Windows case-insensitive) ── */

/**
 * Normaliza una ruta para comparación: resolve + minúsculas en Windows.
 *
 * @param {string} ruta
 * @returns {string}
 */
function normalizarParaComparar(ruta) {
    const resuelta = path.resolve(ruta);
    return ES_WINDOWS ? resuelta.toLowerCase() : resuelta;
}

/* ─── Validaciones de ruta ───────────────────────────────────── */

const RE_UNC       = /^\\\\[^\\]+\\/;      // \\servidor\carpeta

/**
 * Resuelve una ruta de configuración: expande variables y, si es relativa,
 * la ancla a la raíz del proyecto (no al cwd del proceso).
 *
 * @param {string} valor
 * @returns {string}
 */
function resolverRutaConfigurada(valor) {
    const expandida = expandirVariables(String(valor || '').trim());
    if (!expandida) return '';
    if (!path.isAbsolute(expandida)) {
        return path.resolve(__dirname, '..', expandida);
    }
    return path.resolve(expandida);
}

/**
 * Verifica reglas básicas de seguridad sobre una ruta resuelta.
 * Lanza Error si la ruta no es aceptable.
 *
 * @param {string} rutaResuelta - Ruta ya resuelta con path.resolve
 * @param {string} nombreVar    - Nombre de la variable de entorno (para mensajes)
 */
function validarReglasBasicas(rutaResuelta, nombreVar) {
    if (RE_UNC.test(rutaResuelta)) {
        throw new Error(
            `[rutas] ${nombreVar} apunta a una ruta UNC ("${rutaResuelta}"). ` +
            'Las rutas UNC no son compatibles: el rename atómico y los bloqueos ' +
            'no son confiables ahí. Usa una carpeta local.'
        );
    }

    if (path.parse(rutaResuelta).root === rutaResuelta) {
        throw new Error(
            `[rutas] ${nombreVar} apunta a la raíz de una unidad ("${rutaResuelta}"). ` +
            'Elige una subcarpeta, por ejemplo C:\\CXC\\comprobantes.'
        );
    }

    // Advertencia de MAX_PATH
    if (rutaResuelta.length > 240) {
        console.warn(
            `[rutas] ADVERTENCIA MAX_PATH: ${nombreVar} tiene ${rutaResuelta.length} caracteres ` +
            `("${rutaResuelta}"). Windows limita las rutas a 260 caracteres; ` +
            'activa rutas largas o acorta la raíz.'
        );
    }
}

/**
 * Verifica que una ruta exista o se pueda crear, y que se pueda escribir en ella.
 * Devuelve null si todo va bien; devuelve un string con el error si falla.
 *
 * @param {string} rutaResuelta
 * @returns {string|null}
 */
function probarEscritura(rutaResuelta) {
    try {
        fs.mkdirSync(rutaResuelta, { recursive: true });
    } catch (err) {
        return `No se pudo crear el directorio "${rutaResuelta}": ${err.message}`;
    }

    const tmpFile = path.join(rutaResuelta, `.cxc_write_test_${Date.now()}`);
    try {
        fs.writeFileSync(tmpFile, '');
        fs.unlinkSync(tmpFile);
        return null;
    } catch (err) {
        return `No se puede escribir en "${rutaResuelta}": ${err.message}`;
    }
}

/* ─── Resolución de COMPROBANTES_DIR ────────────────────────── */

let _comprobantesDir = null;

/**
 * Resuelve y valida COMPROBANTES_DIR.
 * Si no se puede escribir → lanza Error (el arranque debe fallar).
 * Cachea el resultado.
 *
 * @returns {string} Ruta absoluta resuelta
 */
function resolverComprobantesDir() {
    if (_comprobantesDir) return _comprobantesDir;

    const raw = process.env.COMPROBANTES_DIR
        ? process.env.COMPROBANTES_DIR
        : './comprobantes';

    const resuelta = resolverRutaConfigurada(raw);
    validarReglasBasicas(resuelta, 'COMPROBANTES_DIR');

    const error = probarEscritura(resuelta);
    if (error) {
        throw new Error(`[rutas] COMPROBANTES_DIR no es utilizable → ${error}`);
    }

    console.log(`[rutas] COMPROBANTES_DIR → ${resuelta}`);
    _comprobantesDir = resuelta;
    return resuelta;
}

/* ─── Resolución de ONEDRIVE_DIR ─────────────────────────────── */

let _onedriveDir     = null;
let _onedriveListo   = false;
let _onedriveError   = null;

/**
 * Resuelve y valida ONEDRIVE_DIR.
 * Si no está definida → devuelve null.
 * Si no se puede escribir → devuelve null y guarda el error en _onedriveError.
 * El arranque NO falla; solo se loguea la advertencia.
 * Cachea el resultado.
 *
 * @returns {string|null} Ruta absoluta resuelta, o null si no está disponible
 */
function resolverOneDriveDir() {
    if (_onedriveDir !== null || _onedriveListo) return _onedriveDir;
    _onedriveListo = true;

    const raw = process.env.ONEDRIVE_DIR
        ? process.env.ONEDRIVE_DIR
        : null;

    if (!raw || !String(raw).trim()) {
        console.log('[rutas] ONEDRIVE_DIR no configurado; espejo desactivado.');
        return null;
    }

    const resuelta = resolverRutaConfigurada(raw);

    try {
        validarReglasBasicas(resuelta, 'ONEDRIVE_DIR');
    } catch (err) {
        _onedriveError = err.message;
        console.warn(`[rutas] ONEDRIVE_DIR inválido: ${err.message}`);
        return null;
    }

    // Evitar espejo recursivo o pisar la carpeta principal.
    const comprobantesDir = resolverComprobantesDir();
    if (mismaRuta(resuelta, comprobantesDir)) {
        _onedriveError = 'ONEDRIVE_DIR es la misma carpeta que COMPROBANTES_DIR';
        console.warn(`[rutas] ONEDRIVE_DIR no puede ser igual a COMPROBANTES_DIR (${resuelta}); espejo desactivado.`);
        return null;
    }
    if (estaAdentro(resuelta, comprobantesDir) || estaAdentro(comprobantesDir, resuelta)) {
        _onedriveError = 'ONEDRIVE_DIR y COMPROBANTES_DIR no deben estar una dentro de otra';
        console.warn('[rutas] ONEDRIVE_DIR y COMPROBANTES_DIR no deben estar una dentro de otra; espejo desactivado.');
        return null;
    }

    const error = probarEscritura(resuelta);
    if (error) {
        _onedriveError = error;
        console.warn(`[rutas] ONEDRIVE_DIR no disponible (el bot arranca igual): ${error}`);
        return null;
    }

    console.log(`[rutas] ONEDRIVE_DIR → ${resuelta}`);
    _onedriveDir = resuelta;
    return resuelta;
}

/* ─── Utilidades de comparación de rutas ────────────────────── */

/**
 * Devuelve true si rutaA y rutaB apuntan al mismo directorio.
 *
 * @param {string} rutaA
 * @param {string} rutaB
 * @returns {boolean}
 */
function mismaRuta(rutaA, rutaB) {
    return normalizarParaComparar(rutaA) === normalizarParaComparar(rutaB);
}

/**
 * Devuelve true si rutaHija está dentro de rutaPadre.
 *
 * @param {string} rutaHija
 * @param {string} rutaPadre
 * @returns {boolean}
 */
function estaAdentro(rutaHija, rutaPadre) {
    const h = normalizarParaComparar(rutaHija);
    const p = normalizarParaComparar(rutaPadre);
    return h.startsWith(p + path.sep) || h === p;
}

/* ─── Ruta relativa con "/" siempre ──────────────────────────── */

/**
 * Convierte una ruta absoluta a relativa respecto a una base,
 * usando "/" como separador (para JSON y API).
 *
 * @param {string} rutaAbsoluta
 * @param {string} base
 * @returns {string}
 */
function rutaRelativaUnix(rutaAbsoluta, base) {
    return path.relative(base, rutaAbsoluta).split(path.sep).join('/');
}

/* ─── Resetear cache (solo para tests) ──────────────────────── */

function _resetearCache() {
    _comprobantesDir = null;
    _onedriveDir     = null;
    _onedriveListo   = false;
    _onedriveError   = null;
}

module.exports = {
    expandirVariables,
    normalizarParaComparar,
    validarReglasBasicas,
    probarEscritura,
    resolverComprobantesDir,
    resolverOneDriveDir,
    mismaRuta,
    estaAdentro,
    rutaRelativaUnix,
    _resetearCache   // expuesto solo para tests unitarios
};
