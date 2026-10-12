CREATE DATABASE IF NOT EXISTS finanzas;
USE finanzas;

CREATE TABLE IF NOT EXISTS comprobantes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    banco_origen VARCHAR(100) NULL,
    cuenta_origen_digitos VARCHAR(20) NULL DEFAULT NULL,
    banco_destino VARCHAR(100) NULL,
    cuenta_destino_digitos VARCHAR(20) NULL DEFAULT NULL,
    monto DECIMAL(12, 2) NULL,
    fecha DATE NULL,
    hora_operacion TIME NULL,
    folio VARCHAR(100) NULL,
    referencia VARCHAR(100) NULL,
    autenticacion VARCHAR(100) NULL,
    clave_rastreo VARCHAR(100) NULL,
    concepto TEXT NULL,
    cliente VARCHAR(255) NULL,
    nombre_archivo VARCHAR(255) NULL,
    ruta_archivo VARCHAR(500) NULL,
    fecha_recepcion DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
