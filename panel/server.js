const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { URL } = require('url');
const { estado, eventos, obtenerEstado } = require('../services/estado');
const { obtenerLogs } = require('../services/logger');
const { resolverComprobantesDir } = require('../services/rutas');
const COMPROBANTES_DIR = resolverComprobantesDir();
const { encolarAnalisis, obtenerEstadoIA, resolverRutaComprobante } = require('../services/colaIA');
const datosComprobantes = require('../services/datosComprobantes');
const iaService = require('../services/iaService');
const {
    rutaFecha,
    segmentosFecha,
    fechaDesdeSegmentos,
    esCarpetaAnio,
    esCarpetaMes,
    esCarpetaDia
} = require('../utils/fechas');
const {
    validarConfig,
    guardarConfig,
    aplicarConfig,
    obtenerConfigActual
} = require('../services/configFiltros');

const PUBLIC_DIR = path.join(__dirname, 'public');
const PDFJS_DIR = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist');
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ARCHIVO = /\.pdf$/i;
const TIPOS_CONTENIDO = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.bcmap': 'application/octet-stream',
    '.properties': 'text/plain; charset=utf-8',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

function aplicarCabecerasSeguridad(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
    );
}

function responderJson(res, codigo, datos) {
    const cuerpo = JSON.stringify(datos);
    res.writeHead(codigo, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(cuerpo),
        'Cache-Control': 'no-store'
    });
    res.end(cuerpo);
}

function responderTexto(res, codigo, texto) {
    res.writeHead(codigo, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(texto),
        'Cache-Control': 'no-store'
    });
    res.end(texto);
}

function hostPermitido(req, puerto) {
    const host = String(req.headers.host || '').toLowerCase();
    return host === `127.0.0.1:${puerto}` || host === `localhost:${puerto}`;
}

function origenPermitido(req, puerto) {
    const origen = req.headers.origin;
    if (!origen) return true;
    try {
        const url = new URL(origen);
        return url.protocol === 'http:' &&
            (url.hostname === '127.0.0.1' || url.hostname === 'localhost') &&
            url.port === String(puerto);
    } catch (error) {
        return false;
    }
}

function resumenFiltros() {
    try {
        return obtenerConfigActual();
    } catch (error) {
        return null;
    }
}

function leerCuerpoJson(req, limite = 32768) {
    return new Promise((resolve, reject) => {
        const tipo = String(req.headers['content-type'] || '')
            .split(';')[0]
            .trim()
            .toLowerCase();

        if (tipo !== 'application/json') {
            const error = new Error('El Content-Type debe ser application/json');
            error.status = 415;
            reject(error);
            return;
        }

        let total = 0;
        let excedido = false;
        const partes = [];

        req.on('data', (trozo) => {
            if (excedido) return;
            total += trozo.length;
            if (total > limite) {
                excedido = true;
                partes.length = 0;
                return;
            }
            partes.push(trozo);
        });

        req.on('end', () => {
            if (excedido) {
                const error = new Error('El cuerpo de la solicitud es demasiado grande');
                error.status = 413;
                reject(error);
                return;
            }

            try {
                const texto = Buffer.concat(partes).toString('utf8');
                resolve(JSON.parse(texto));
            } catch (error) {
                const invalido = new Error('El cuerpo no contiene JSON válido');
                invalido.status = 400;
                reject(invalido);
            }
        });

        req.on('error', (error) => {
            const fallo = new Error(error.message || 'No se pudo leer la solicitud');
            fallo.status = 400;
            reject(fallo);
        });
    });
}

function listarFechas() {
    const fechas = new Set();

    try {
        for (const anio of fs.readdirSync(COMPROBANTES_DIR, { withFileTypes: true })) {
            if (!anio.isDirectory() || !esCarpetaAnio(anio.name)) continue;
            const rutaAnio = path.join(COMPROBANTES_DIR, anio.name);

            for (const mes of fs.readdirSync(rutaAnio, { withFileTypes: true })) {
                if (!mes.isDirectory() || !esCarpetaMes(mes.name)) continue;
                const rutaMes = path.join(rutaAnio, mes.name);

                for (const dia of fs.readdirSync(rutaMes, { withFileTypes: true })) {
                    if (!dia.isDirectory() || !esCarpetaDia(dia.name)) continue;
                    const fecha = fechaDesdeSegmentos(anio.name, mes.name, dia.name);
                    if (fecha) fechas.add(fecha);
                }
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('[panel] No se pudo leer la estructura por año/mes/día:', error.message || error);
        }
    }

    // Compatibilidad con la estructura anterior YYYY-MM-DD.
    try {
        for (const entrada of fs.readdirSync(COMPROBANTES_DIR, { withFileTypes: true })) {
            if (entrada.isDirectory() && RE_FECHA.test(entrada.name)) {
                fechas.add(entrada.name);
            }
        }
    } catch (error) {
        if (error.code !== 'ENOENT') {
            console.error('[panel] No se pudo leer la carpeta de comprobantes:', error.message || error);
        }
    }

    return [...fechas].sort((a, b) => b.localeCompare(a));
}

function listarArchivos(fecha) {
    const archivos = [];
    const vistos = new Set();

    const agregar = (segmentos, grupo, directorio, nombre) => {
        const clave = `${grupo || ''}/${nombre}`;
        if (vistos.has(clave)) return;

        try {
            const info = fs.statSync(path.join(directorio, nombre));
            vistos.add(clave);
            const rutaRelativa = [...segmentos, grupo, nombre].filter(Boolean).join('/');
            archivos.push({
                fecha,
                grupo,
                nombre,
                rutaRelativa,
                tamano: info.size,
                mtime: info.mtimeMs,
                analisis: datosComprobantes.obtener(rutaRelativa)
            });
        } catch (error) {
            return;
        }
    };

    const listarCarpeta = (carpeta, segmentos) => {
        let entradas;
        try {
            entradas = fs.readdirSync(carpeta, { withFileTypes: true });
        } catch (error) {
            if (error.code !== 'ENOENT') {
                console.error(`[panel] No se pudo leer ${carpeta}:`, error.message || error);
            }
            return;
        }

        for (const entrada of entradas) {
            if (entrada.name.startsWith('.')) continue;

            if (entrada.isFile() && RE_ARCHIVO.test(entrada.name)) {
                agregar(segmentos, null, carpeta, entrada.name);
                continue;
            }

            if (!entrada.isDirectory()) continue;

            const subcarpeta = path.join(carpeta, entrada.name);
            let subentradas;
            try {
                subentradas = fs.readdirSync(subcarpeta, { withFileTypes: true });
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error(`[panel] No se pudo leer la carpeta ${entrada.name}:`, error.message || error);
                }
                continue;
            }

            for (const subentrada of subentradas) {
                if (!subentrada.isFile() || !RE_ARCHIVO.test(subentrada.name)) continue;
                agregar(segmentos, entrada.name, subcarpeta, subentrada.name);
            }
        }
    };

    const segmentos = segmentosFecha(fecha);
    listarCarpeta(
        path.join(COMPROBANTES_DIR, rutaFecha(fecha)),
        [segmentos.anio, segmentos.mes, segmentos.dia]
    );

    if (RE_FECHA.test(fecha)) {
        listarCarpeta(path.join(COMPROBANTES_DIR, fecha), [fecha]);
    }

    return archivos.sort((a, b) => b.mtime - a.mtime);
}

function listarTodo() {
    const fechas = listarFechas();
    const archivos = [];
    for (const fecha of fechas) {
        archivos.push(...listarArchivos(fecha));
    }
    archivos.sort((a, b) => b.mtime - a.mtime);
    return { fechas, archivos, ultimo: archivos[0] || null };
}

function decodificarSegmento(valor) {
    try {
        const decodificado = decodeURIComponent(valor);
        if (!decodificado || decodificado === '.' || decodificado === '..' ||
            decodificado.includes('/') || decodificado.includes('\\') ||
            decodificado.includes('\0')) {
            return null;
        }
        return decodificado;
    } catch (error) {
        return null;
    }
}

function resolverArchivoEnBase(carpetaFecha, grupoCodificado, nombreCodificado) {
    const nombre = decodificarSegmento(nombreCodificado);
    if (!nombre || !RE_ARCHIVO.test(nombre)) return null;

    let carpetaDestino = carpetaFecha;

    if (grupoCodificado != null) {
        const grupo = decodificarSegmento(grupoCodificado);
        if (!grupo) return null;
        carpetaDestino = path.resolve(carpetaFecha, grupo);
        if (!carpetaDestino.startsWith(carpetaFecha + path.sep)) return null;
    }

    const ruta = path.resolve(carpetaDestino, nombre);
    if (ruta !== path.join(carpetaDestino, nombre) || !ruta.startsWith(carpetaDestino + path.sep)) {
        return null;
    }

    return ruta;
}

function resolverArchivo(fecha, grupoCodificado, nombreCodificado) {
    if (!RE_FECHA.test(fecha)) return null;

    const carpetaNueva = path.resolve(COMPROBANTES_DIR, rutaFecha(fecha));
    const candidata = resolverArchivoEnBase(carpetaNueva, grupoCodificado, nombreCodificado);
    if (candidata && fs.existsSync(candidata)) {
        return candidata;
    }

    // Compatibilidad con la estructura anterior YYYY-MM-DD.
    return resolverArchivoEnBase(
        path.resolve(COMPROBANTES_DIR, fecha),
        grupoCodificado,
        nombreCodificado
    );
}

function descargarArchivo(res, ruta, opciones = {}) {
    let info;
    try {
        info = fs.statSync(ruta);
    } catch (error) {
        return responderJson(res, 404, { ok: false, error: 'Archivo no encontrado' });
    }

    if (!info.isFile()) {
        return responderJson(res, 404, { ok: false, error: 'Archivo no encontrado' });
    }

    const nombre = path.basename(ruta);
    const ascii = nombre
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\]/g, '_');

    const inline = opciones.inline === true;
    const cabeceras = {
        'Content-Type': 'application/pdf',
        'Content-Length': info.size,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
        'Cache-Control': 'no-store'
    };

    if (inline) {
        cabeceras['X-Frame-Options'] = 'SAMEORIGIN';
        cabeceras['Content-Security-Policy'] = "frame-ancestors 'self'";
    }

    res.writeHead(200, cabeceras);

    const flujo = fs.createReadStream(ruta);
    flujo.on('error', (error) => {
        console.error('[panel] Error al leer el archivo:', error.message || error);
        if (!res.headersSent) {
            responderJson(res, 500, { ok: false, error: 'No se pudo leer el archivo' });
        } else {
            res.destroy();
        }
    });
    flujo.pipe(res);
}

function servirEstatico(req, res, pathname) {
    const relativo = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    if (!relativo || relativo.includes('\0')) {
        return responderTexto(res, 400, 'Solicitud inválida');
    }

    const ruta = path.resolve(PUBLIC_DIR, relativo);
    if (!ruta.startsWith(PUBLIC_DIR + path.sep)) {
        return responderTexto(res, 403, 'Prohibido');
    }

    let info;
    try {
        info = fs.statSync(ruta);
    } catch (error) {
        return responderTexto(res, 404, 'No encontrado');
    }

    if (!info.isFile()) {
        return responderTexto(res, 404, 'No encontrado');
    }

    const tipo = TIPOS_CONTENIDO[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
        'Content-Type': tipo,
        'Content-Length': info.size,
        'Cache-Control': 'no-store'
    });

    const flujo = fs.createReadStream(ruta);
    flujo.on('error', () => {
        if (!res.headersSent) responderTexto(res, 500, 'No se pudo leer el archivo');
        else res.destroy();
    });
    flujo.pipe(res);
}

function servirPdfJs(req, res, pathname) {
    const prefijo = '/vendor/pdfjs/';
    let relativo;
    try {
        relativo = decodeURIComponent(pathname.slice(prefijo.length));
    } catch (error) {
        return responderTexto(res, 400, 'Solicitud inválida');
    }

    if (!relativo || relativo.includes('\0')) {
        return responderTexto(res, 400, 'Solicitud inválida');
    }

    const ruta = path.resolve(PDFJS_DIR, relativo);
    if (!ruta.startsWith(PDFJS_DIR + path.sep)) {
        return responderTexto(res, 403, 'Prohibido');
    }

    let info;
    try {
        info = fs.statSync(ruta);
    } catch (error) {
        return responderTexto(res, 404, 'No encontrado');
    }

    if (!info.isFile()) {
        return responderTexto(res, 404, 'No encontrado');
    }

    const tipo = TIPOS_CONTENIDO[path.extname(ruta).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
        'Content-Type': tipo,
        'Content-Length': info.size,
        'Cache-Control': 'public, max-age=3600',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'"
    });

    const flujo = fs.createReadStream(ruta);
    flujo.on('error', () => {
        if (!res.headersSent) responderTexto(res, 500, 'No se pudo leer el archivo');
        else res.destroy();
    });
    flujo.pipe(res);
}

function manejarSSE(req, res) {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
    });

    const enviar = (evento, datos) => {
        if (res.writableEnded) return;
        try {
            res.write(`event: ${evento}\n`);
            res.write(`data: ${JSON.stringify(datos)}\n\n`);
        } catch (error) {
            res.destroy();
        }
    };

    enviar('estado', { ...obtenerEstado(), filtros: resumenFiltros() });
    enviar('logs', obtenerLogs());

    const alEstado = () => enviar('estado', { ...obtenerEstado(), filtros: resumenFiltros() });
    const alLog = (linea) => enviar('log', linea);
    const alArchivo = (archivo) => enviar('archivo', archivo);
    const alIa = (datos) => enviar('ia', datos);
    const alDatos = (datos) => enviar('datos', datos);

    eventos.on('estado', alEstado);
    eventos.on('log', alLog);
    eventos.on('archivo', alArchivo);
    eventos.on('ia', alIa);
    eventos.on('datos', alDatos);

    const latido = setInterval(() => {
        if (res.writableEnded) return;
        try {
            res.write(': ping\n\n');
        } catch (error) {
            res.destroy();
        }
    }, 25000);

    req.on('close', () => {
        clearInterval(latido);
        eventos.off('estado', alEstado);
        eventos.off('log', alLog);
        eventos.off('archivo', alArchivo);
        eventos.off('ia', alIa);
        eventos.off('datos', alDatos);
    });
}

function abrirCarpeta() {
    let comando;
    let args;

    if (process.platform === 'win32') {
        comando = 'explorer.exe';
        args = [COMPROBANTES_DIR];
    } else if (process.platform === 'darwin') {
        comando = 'open';
        args = [COMPROBANTES_DIR];
    } else {
        comando = 'xdg-open';
        args = [COMPROBANTES_DIR];
    }

    const hijo = spawn(comando, args, { detached: true, stdio: 'ignore' });
    hijo.on('error', (error) => {
        console.error('[panel] No se pudo abrir la carpeta:', error.message || error);
    });
    hijo.unref();
}

async function manejarApi(req, res, url, puerto, opciones) {
    const { pathname, searchParams } = url;

    if (pathname === '/api/salud' && req.method === 'GET') {
        return responderJson(res, 200, {
            ok: true,
            fase: estado.fase,
            uptime: obtenerEstado().uptime
        });
    }

    if (pathname === '/api/estado' && req.method === 'GET') {
        return responderJson(res, 200, { ...obtenerEstado(), filtros: resumenFiltros() });
    }

    if (pathname === '/api/filtros' && req.method === 'GET') {
        return responderJson(res, 200, { ok: true, filtros: obtenerConfigActual() });
    }

    if (pathname === '/api/filtros' && req.method === 'POST') {
        if (!origenPermitido(req, puerto)) {
            return responderJson(res, 403, { ok: false, error: 'Origen no permitido' });
        }

        let datos;
        try {
            datos = await leerCuerpoJson(req);
        } catch (error) {
            return responderJson(res, error.status || 400, { ok: false, error: error.message });
        }

        const validacion = validarConfig(datos);
        if (!validacion.valido) {
            return responderJson(res, 400, {
                ok: false,
                error: validacion.errores.join(' '),
                errores: validacion.errores
            });
        }

        try {
            guardarConfig(validacion.config);
            aplicarConfig(validacion.config);
        } catch (error) {
            console.error('[panel] No se pudieron guardar los filtros:', error.message || error);
            return responderJson(res, 500, {
                ok: false,
                error: 'No se pudieron guardar los filtros. Revisa los registros.'
            });
        }

        return responderJson(res, 200, {
            ok: true,
            filtros: obtenerConfigActual(),
            advertencias: validacion.advertencias
        });
    }

    if (pathname === '/api/grupos' && req.method === 'GET') {
        try {
            const grupos = await opciones.obtenerGrupos?.();
            return responderJson(res, 200, {
                ok: true,
                grupos: Array.isArray(grupos) ? grupos : []
            });
        } catch (error) {
            console.error('[panel] No se pudieron obtener los grupos:', error.message || error);
            return responderJson(res, 500, {
                ok: false,
                error: 'No se pudieron obtener los grupos'
            });
        }
    }

    if (pathname === '/api/logs' && req.method === 'GET') {
        return responderJson(res, 200, { lineas: obtenerLogs() });
    }

    if (pathname === '/api/eventos' && req.method === 'GET') {
        return manejarSSE(req, res);
    }

    if (pathname === '/api/ia' && req.method === 'GET') {
        return responderJson(res, 200, { ok: true, ...obtenerEstadoIA() });
    }

    if (pathname === '/api/ia/analizar' && req.method === 'POST') {
        if (!origenPermitido(req, puerto)) {
            return responderJson(res, 403, { ok: false, error: 'Origen no permitido' });
        }

        let datos;
        try {
            datos = await leerCuerpoJson(req);
        } catch (error) {
            return responderJson(res, error.status || 400, { ok: false, error: error.message });
        }

        const rutaRelativa = String(datos?.rutaRelativa || '').trim();
        if (!rutaRelativa) {
            return responderJson(res, 400, { ok: false, error: 'Falta la ruta del comprobante' });
        }

        if (!iaService.estaConfigurada()) {
            return responderJson(res, 400, {
                ok: false,
                error: 'Falta DEEPSEEK_API_KEY en .env'
            });
        }

        let ruta;
        try {
            ruta = resolverRutaComprobante(rutaRelativa);
        } catch (error) {
            return responderJson(res, 400, { ok: false, error: error.message });
        }

        const encolado = encolarAnalisis({
            rutaRelativa,
            ruta,
            forzar: Boolean(datos?.forzar)
        });

        return responderJson(res, 200, {
            ok: true,
            encolado,
            mensaje: encolado ? 'En cola' : 'Ya estaba en la cola',
            estado: obtenerEstadoIA()
        });
    }

    if (pathname === '/api/ia/pendientes' && req.method === 'POST') {
        if (!origenPermitido(req, puerto)) {
            return responderJson(res, 403, { ok: false, error: 'Origen no permitido' });
        }
        req.resume();

        if (!iaService.estaConfigurada()) {
            return responderJson(res, 400, {
                ok: false,
                error: 'Falta DEEPSEEK_API_KEY en .env'
            });
        }

        const archivos = listarTodo().archivos;
        let encolados = 0;
        for (const archivo of archivos) {
            const estadoIA = archivo.analisis?.estado;
            if (estadoIA === 'ok' || estadoIA === 'incompleto') continue;
            if (!archivo.rutaRelativa) continue;
            try {
                if (encolarAnalisis({ rutaRelativa: archivo.rutaRelativa, forzar: true })) {
                    encolados++;
                }
            } catch (error) {
                console.warn('[panel] No se pudo encolar:', error.message || error);
            }
        }

        return responderJson(res, 200, {
            ok: true,
            encolados,
            total: archivos.length,
            estado: obtenerEstadoIA()
        });
    }

    if (pathname === '/api/comprobantes' && req.method === 'GET') {
        const fecha = searchParams.get('fecha');
        if (fecha) {
            if (!RE_FECHA.test(fecha)) {
                return responderJson(res, 400, { ok: false, error: 'Fecha inválida' });
            }
            return responderJson(res, 200, { fecha, archivos: listarArchivos(fecha) });
        }
        return responderJson(res, 200, listarTodo());
    }

    if (pathname.startsWith('/api/comprobantes/') && req.method === 'GET') {
        const partes = pathname.split('/').filter(Boolean);
        if (partes.length !== 4 && partes.length !== 5) {
            return responderJson(res, 404, { ok: false, error: 'No encontrado' });
        }

        const fecha = partes[2];
        const grupo = partes.length === 5 ? partes[3] : null;
        const nombre = partes.length === 5 ? partes[4] : partes[3];
        const ruta = resolverArchivo(fecha, grupo, nombre);
        if (!ruta) {
            return responderJson(res, 400, { ok: false, error: 'Archivo inválido' });
        }
        return descargarArchivo(res, ruta, {
            inline: searchParams.get('inline') === '1'
        });
    }

    if (pathname === '/api/reiniciar' && req.method === 'POST') {
        req.resume();
        if (!origenPermitido(req, puerto)) {
            return responderJson(res, 403, { ok: false, error: 'Origen no permitido' });
        }
        if (!process.env.pm_id) {
            return responderJson(res, 400, {
                ok: false,
                error: 'El servicio no está administrado por PM2'
            });
        }

        responderJson(res, 200, { ok: true });
        setTimeout(() => {
            Promise.resolve(opciones.onReiniciar?.()).catch((error) => {
                console.error('[panel] Error al reiniciar:', error.message || error);
                process.exit(1);
            });
        }, 300);
        return;
    }

    if (pathname === '/api/abrir-carpeta' && req.method === 'POST') {
        req.resume();
        if (!origenPermitido(req, puerto)) {
            return responderJson(res, 403, { ok: false, error: 'Origen no permitido' });
        }

        try {
            abrirCarpeta();
            return responderJson(res, 200, { ok: true });
        } catch (error) {
            return responderJson(res, 500, { ok: false, error: error.message || 'No se pudo abrir la carpeta' });
        }
    }

    return responderJson(res, 404, { ok: false, error: 'No encontrado' });
}

function iniciarPanel(opciones = {}) {
    const puerto = Number(process.env.PANEL_PORT) || 3001;
    if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
        return Promise.reject(new Error(`PANEL_PORT inválido: ${process.env.PANEL_PORT}`));
    }

    return new Promise((resolve, reject) => {
        let resuelto = false;

        const servidor = http.createServer((req, res) => {
            aplicarCabecerasSeguridad(res);

            if (!hostPermitido(req, puerto)) {
                return responderTexto(res, 403, 'Host no permitido');
            }

            let url;
            try {
                url = new URL(req.url, `http://127.0.0.1:${puerto}`);
            } catch (error) {
                return responderTexto(res, 400, 'Solicitud inválida');
            }

            if (url.pathname.startsWith('/api/')) {
                manejarApi(req, res, url, puerto, opciones).catch((error) => {
                    console.error('[panel] Error en la API:', error.message || error);
                    if (!res.headersSent) {
                        responderJson(res, 500, { ok: false, error: 'Error interno' });
                    } else {
                        res.destroy();
                    }
                });
                return;
            }

            if (url.pathname.startsWith('/vendor/pdfjs/')) {
                try {
                    servirPdfJs(req, res, url.pathname);
                } catch (error) {
                    console.error('[panel] Error sirviendo PDF.js:', error.message || error);
                    if (!res.headersSent) {
                        responderTexto(res, 500, 'Error interno');
                    } else {
                        res.destroy();
                    }
                }
                return;
            }

            try {
                servirEstatico(req, res, url.pathname);
            } catch (error) {
                console.error('[panel] Error sirviendo archivo estático:', error.message || error);
                if (!res.headersSent) {
                    responderTexto(res, 500, 'Error interno');
                } else {
                    res.destroy();
                }
            }
        });

        servidor.on('error', (error) => {
            if (!resuelto) {
                resuelto = true;
                reject(error);
                return;
            }
            console.error('[panel] Error del servidor:', error.message || error);
            process.exit(1);
        });

        servidor.listen(puerto, '127.0.0.1', () => {
            resuelto = true;
            console.log(`[panel] Panel disponible en http://127.0.0.1:${puerto}`);
            resolve({
                servidor,
                puerto,
                cerrar: () => new Promise((listo) => servidor.close(() => listo()))
            });
        });
    });
}

module.exports = {
    iniciarPanel
};
