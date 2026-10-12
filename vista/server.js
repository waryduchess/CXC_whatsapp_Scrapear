const http = require('http');
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const DIR = __dirname;
const PORT = Number(process.env.VISTA_PORT || 3001);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'usuario_app',
  password: process.env.DB_PASSWORD || 'password_app',
  database: process.env.DB_NAME || 'finanzas',
  connectionLimit: 5,
  dateStrings: true
});

const MIMES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function formatearFecha(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function rangoPeriodo(periodo, fechaParam) {
  const d = fechaParam ? new Date(`${fechaParam}T00:00:00`) : new Date();
  if (isNaN(d.getTime())) throw new Error('fecha inválida');

  if (periodo === 'dia') {
    return { desde: d, hasta: d };
  }

  if (periodo === 'semana') {
    const diaSemana = d.getDay();
    const diff = diaSemana === 0 ? 6 : diaSemana - 1;
    const lunes = new Date(d);
    lunes.setDate(d.getDate() - diff);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return { desde: lunes, hasta: domingo };
  }

  if (periodo === 'mes') {
    const primero = new Date(d.getFullYear(), d.getMonth(), 1);
    const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { desde: primero, hasta: ultimo };
  }

  throw new Error('periodo inválido');
}

async function obtenerComprobantes(desde, hasta) {
  const [rows] = await pool.execute(
    `SELECT id, banco_origen, cuenta_origen_digitos, banco_destino, cuenta_destino_digitos,
            monto, fecha, hora_operacion, folio, referencia, autenticacion, clave_rastreo,
            concepto, cliente, nombre_archivo, ruta_archivo, fecha_recepcion, created_at
     FROM comprobantes
     WHERE fecha_recepcion IS NOT NULL AND fecha_recepcion BETWEEN ? AND ?
     ORDER BY fecha_recepcion DESC, monto DESC, id DESC`,
    [formatearFecha(desde), formatearFecha(hasta)]
  );
  return rows;
}

async function obtenerFechasDisponibles() {
  const [rows] = await pool.execute(
    'SELECT DISTINCT fecha_recepcion AS fecha FROM comprobantes WHERE fecha_recepcion IS NOT NULL ORDER BY fecha_recepcion'
  );
  return rows.map(r => r.fecha);
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

async function handleApi(res, pathname, searchParams) {
  if (pathname === '/api/comprobantes') {
    const periodo = searchParams.get('periodo') || 'dia';
    const fecha = searchParams.get('fecha');
    try {
      const rango = rangoPeriodo(periodo, fecha);
      const filas = await obtenerComprobantes(rango.desde, rango.hasta);
      sendJSON(res, 200, {
        periodo,
        desde: formatearFecha(rango.desde),
        hasta: formatearFecha(rango.hasta),
        total: filas.length,
        comprobantes: filas
      });
    } catch (error) {
      sendJSON(res, 400, { error: error.message });
    }
    return;
  }

  if (pathname === '/api/fechas') {
    try {
      const fechas = await obtenerFechasDisponibles();
      sendJSON(res, 200, { fechas });
    } catch (error) {
      sendJSON(res, 500, { error: error.message });
    }
    return;
  }

  sendJSON(res, 404, { error: 'endpoint no encontrado' });
}

function servirEstatico(res, pathname) {
  if (pathname === '/') pathname = '/index.html';

  const rutaArchivo = path.normalize(path.join(DIR, pathname));
  const enDirectorio = rutaArchivo === DIR || rutaArchivo.startsWith(DIR + path.sep);
  const basename = path.basename(rutaArchivo);

  if (!enDirectorio || basename.startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(rutaArchivo, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(rutaArchivo).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIMES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    try {
      await handleApi(res, pathname, url.searchParams);
    } catch (error) {
      sendJSON(res, 500, { error: error.message });
    }
    return;
  }

  if (req.method === 'GET') {
    servirEstatico(res, pathname);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('405 Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`[vista] Servidor listo en http://localhost:${PORT}`);
  console.log(`[vista] Para detenerlo: Ctrl+C`);
});