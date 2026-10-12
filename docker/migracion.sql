USE finanzas;

ALTER TABLE comprobantes
    ADD COLUMN hora_operacion TIME NULL AFTER fecha,
    ADD COLUMN autenticacion VARCHAR(100) NULL AFTER referencia,
    ADD COLUMN clave_rastreo VARCHAR(100) NULL AFTER autenticacion,
    ADD COLUMN cliente VARCHAR(255) NULL AFTER concepto,
    ADD COLUMN nombre_archivo VARCHAR(255) NULL AFTER cliente,
    ADD COLUMN ruta_archivo VARCHAR(500) NULL AFTER nombre_archivo;

ALTER TABLE comprobantes
    MODIFY COLUMN monto DECIMAL(12, 2) NULL,
    MODIFY COLUMN fecha DATE NULL;
