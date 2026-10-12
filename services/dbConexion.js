const mysql = require('mysql2/promise');

function normalizarBancoOrigen(banco) {
  if (!banco) return null;
  const b = banco.toLowerCase();
  if (b.includes('guardadito')) return 'BANCO AZTECA';
  if (b.includes('mercado pago')) return 'MERCADO PAGO';
  if (b.includes('transferir & dimo')) return 'BBVA';
  return banco;
}

function configConexion() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'usuario_app',
    password: process.env.DB_PASSWORD || 'password_app',
    database: process.env.DB_NAME || 'finanzas'
  };
}

async function insertarComprobante(datos, archivo = {}) {
  if (!datos || typeof datos !== 'object') {
    return null;
  }

  const connection = await mysql.createConnection(configConexion());

  try {
    const query = `
      INSERT INTO comprobantes
      (banco_origen, cuenta_origen_digitos, banco_destino, cuenta_destino_digitos, monto, fecha, hora_operacion, folio, referencia, autenticacion, clave_rastreo, concepto, cliente, nombre_archivo, ruta_archivo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      normalizarBancoOrigen(datos.banco_origen),
      datos.cuenta_origen_digitos ?? null,
      datos.banco_destino ?? null,
      datos.cuenta_destino_digitos ?? null,
      datos.monto ?? null,
      datos.fecha ?? null,
      datos.hora_operacion ?? null,
      datos.folio_operacion ?? datos.folio ?? null,
      datos.referencia ?? null,
      datos.autenticacion ?? null,
      datos.clave_rastreo ?? null,
      datos.concepto ?? null,
      archivo.cliente ?? null,
      archivo.nombreArchivo ?? null,
      archivo.ruta ?? null
    ];

    const [result] = await connection.execute(query, values);
    return result.insertId;
  } finally {
    await connection.end();
  }
}

module.exports = {
  insertarComprobante,
  normalizarBancoOrigen
};
