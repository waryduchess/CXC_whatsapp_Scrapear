# ROADMAP — CXC_whatsapp_Scrapear

> Estado del proyecto: extracción de comprobantes de pago vía WhatsApp con IA + almacenamiento en PDF y MySQL.
> Última actualización: 2026-10-12

---

## Estado general

| Fase | Tema | Estado |
|------|------|--------|
| 1 | Ingesta y filtrado de WhatsApp | Completado |
| 2 | Análisis con IA (Groq) y almacenamiento PDF | Completado |
| 3 | Persistencia en base de datos | Completado |
| 4 | Sincronización y conciliación | Pendiente |

---

## Fase 1 — Ingesta y filtrado de WhatsApp (Completado)

- [x] Cliente `whatsapp-web.js` con `LocalAuth` y persistencia de sesión.
- [x] Soporte para imágenes (`image/jpeg`, `image/png`) y PDFs.
- [x] Ignorar audios, videos, stickers, reacciones y estados.
- [x] Cola de pendientes (30s) para asociar el nombre del cliente desde el mensaje de texto posterior.
- [x] Fallback de nombre: `comprobante_{timestamp}.pdf`.
- [x] Filtro por número de teléfono (`services/filtroNumeros.js`).
- [x] Filtro por grupo, nombre visible o ID (`services/filtroGrupos.js`).
- [x] Modos de filtro: `todos`, `whitelist`, `blacklist`, `solo_privados`, `solo_grupos`.

## Fase 2 — Análisis con IA y almacenamiento (Completado)

- [x] Detección de ruta: imagen→visión, PDF texto→texto, PDF imagen→visión.
- [x] Extracción de texto de PDF con `pdf-parse`; PDF→imagen con `pdftoppm`.
- [x] Conversión de imágenes a PDF (`pdfkit`) para almacenamiento uniforme.
- [x] Prompt de extracción con campos financieros e identificadores (folio, autenticación, referencia, clave de rastreo, hora).
- [x] Reintentos con backoff ante errores 429/503.
- [x] Validación mínima (monto + fecha) y nombrado con sanitización.
- [x] Resolución de colisiones de nombre (`Cliente_2.pdf`).
- [x] Marcado de errores en el nombre (`_ERROR_{TIPO}.pdf`).
- [x] Organización de comprobantes por día de recepción (`comprobantes/YYYY-MM-DD/`).

## Fase 3 — Persistencia en base de datos (Completado)

- [x] MySQL 8 vía `docker/docker-compose.yml` (contenedor `mysql_comprobantes`, DB `finanzas`).
- [x] Tabla `comprobantes` con datos de la IA.
- [x] Columna `ruta_archivo` para la ruta del PDF almacenado.
- [x] Columnas `nombre_archivo` y `cliente`.
- [x] Campos de identificador: `hora_operacion`, `autenticacion`, `clave_rastreo`; mapeo `folio_operacion`→`folio`.
- [x] `services/dbConexion.js` con `insertarComprobante(datos, archivo)`.
- [x] Credenciales por variables de entorno (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
- [x] Inserción disparada en `guardarComprobante` (cubre resolver, timeout y `procesarMedia`).
- [x] Tolerancia a fallos: la caída de la BD no interrumpe el guardado del PDF.
- [x] `fecha_recepcion` para categorizar por día en que llegó el comprobante.
- [x] Migraciones para volúmenes existentes (`docker/migracion.sql`, `docker/migracion_02_fecha_recepcion.sql`).

## Fase 4 — Sincronización y conciliación (Pendiente)

- [x] Vista web de comprobantes (`vista/`): tabla, filtro Día/Semana/Mes y exportación CSV.
- [ ] Visualizar el PDF en el navegador al hacer clic en una fila (vista previa del comprobante).
- [ ] Usar los PDFs existentes en `comprobantes/` como datos de prueba (enlazarlos a registros de BD).
- [ ] Nombrado de archivos con folio de operación (`{FOLIO}_{CLIENTE}.pdf`).
- [ ] Folio de pago interno (nomenclatura PAG + número).
- [ ] Sincronización de la carpeta local con OneDrive.
- [ ] Categorización: conciliado vs. no conciliado.
- [ ] Integración con API/backend PHP.
- [ ] Evitar inserciones duplicadas (dedupe por folio/referencia).
- [ ] Panel/reporte de comprobantes procesados.

---

## Deuda técnica / Mejoras

- [ ] Pool de conexiones MySQL en lugar de una conexión por inserción.
- [ ] Tests automatizados para `dbConexion` (mock de MySQL).
- [ ] Manejo de errores de IA con notificación/reporte (hoy solo queda en el nombre del archivo).
- [ ] Documentar el esquema de la BD en `MEMORIA_PROCESO.md`.
