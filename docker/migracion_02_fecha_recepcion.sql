USE finanzas;

ALTER TABLE comprobantes
    ADD COLUMN fecha_recepcion DATE NULL AFTER ruta_archivo;