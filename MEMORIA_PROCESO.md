# Memoria del Proceso — Extracción de Comprobantes de Pago vía WhatsApp

> Documento vivo que captura las decisiones, reglas de negocio y arquitectura del sistema.
> Última actualización: 2026-09-22

---

## 1. Descripción General

El sistema recibe comprobantes de pago/transferencia bancaria a través de WhatsApp.
Estos comprobantes pueden llegar como **imágenes** (fotos, screenshots) o como **PDFs**.
Una IA (Groq) analiza cada comprobante y extrae datos financieros estructurados en JSON.

Los archivos procesados se guardan localmente como PDF con el nombre del cliente,
y en el futuro se sincronizarán a una carpeta compartida de OneDrive.

---

## 2. Flujo de Entrada desde WhatsApp

- Se usa `whatsapp-web.js` con `LocalAuth` para mantener la sesión.
- Cuando llega un mensaje con media (`msg.hasMedia`):
  - El **caption del archivo se ignora**.
  - Se inicia el análisis de IA de inmediato en segundo plano.
  - Se encola el comprobante en una ventana de espera (default: 30s) para tomar el **siguiente mensaje de texto** del mismo remitente como el nombre del cliente / título del comprobante.
  - Si vence la ventana de tiempo sin recibir mensaje de texto, se usa el fallback genérico: `comprobante_{TIMESTAMP}.pdf`.
- Tipos de media a procesar:
  - `image/*` → Imágenes (fotos de vouchers, screenshots de transferencias)
  - `application/pdf` → PDFs de bancos
- Tipos a **ignorar**: audio, video, stickers, GIFs, estados.

---

## 3. Bancos Identificados y su Comportamiento

| Banco       | Formato del comprobante        | Ruta de procesamiento           |
|-------------|--------------------------------|----------------------------------|
| **BBVA**    | PDF con texto nativo           | Extraer texto → Groq (solo texto) |
| **Santander** | PDF con texto nativo        | Extraer texto → Groq (solo texto) |
| **Banorte** | PDF con texto nativo           | Extraer texto → Groq (solo texto) |
| **Mifel**   | PDF con imagen embebida        | PDF → imagen → Groq (visión)     |
| Cualquiera  | Foto/screenshot de voucher     | Imagen directa → Groq (visión)   |

---

## 4. Flujo de Procesamiento

```
WhatsApp recibe media
        │
        ├── ¿Es imagen (image/*)?
        │       │
        │       ├── Optimizar con sharp (resize, JPEG 85%)
        │       ├── Enviar a Groq como image_url (visión)
        │       ├── Convertir imagen → PDF para almacenamiento
        │       └── Guardar como {NOMBRE_CLIENTE}.pdf
        │
        ├── ¿Es PDF (application/pdf)?
        │       │
        │       ├── Paso 1: Extraer texto con pdf-parse
        │       │
        │       ├── ¿El texto tiene datos financieros?
        │       │     (validar patrones: monto, fecha, referencia bancaria)
        │       │
        │       │   ├── SÍ (BBVA, Santander, Banorte)
        │       │   │     → Enviar TEXTO a Groq (sin visión, más rápido y barato)
        │       │   │
        │       │   └── NO (Mifel, PDFs-imagen)
        │       │         → Convertir PDF a imagen con pdf-poppler
        │       │         → Optimizar con sharp
        │       │         → Enviar a Groq como image_url (visión)
        │       │
        │       └── Guardar como {NOMBRE_CLIENTE}.pdf (ya es PDF)
        │
        └── ¿Otro tipo? → IGNORAR
```

---

## 5. Datos a Extraer (Prompt de IA)

### Campos principales

| Campo                   | Tipo     | Descripción                                              |
|-------------------------|----------|----------------------------------------------------------|
| `banco_origen`          | string   | Banco emisor. Reglas especiales: Guardadito → BANCO AZTECA, Mercado Pago Wallet → MERCADO PAGO, Transferir & Dimo® → BBVA |
| `cuenta_origen_digitos` | string   | Últimos dígitos de la cuenta/tarjeta/CLABE de origen     |
| `banco_destino`         | string   | Banco receptor                                           |
| `cuenta_destino_digitos`| string   | Últimos dígitos de la cuenta/tarjeta/CLABE de destino    |
| `monto`                 | number   | Importe sin símbolos (ej: 500, 1500.50)                  |
| `fecha`                 | string   | Fecha de operación en formato YYYY-MM-DD                 |
| `concepto`              | string   | Texto libre / motivo de la transferencia                 |

### Campos de identificador (extraer TODOS por separado)

| Campo              | Tipo   | Descripción                                    |
|--------------------|--------|------------------------------------------------|
| `folio_operacion`  | string | Número de folio de operación                   |
| `autenticacion`    | string | Número de autenticación                        |
| `referencia`       | string | Referencia numérica bancaria (NUNCA texto/motivo) |
| `clave_rastreo`    | string | Clave de rastreo                               |
| `hora_operacion`   | string | Hora de la operación (HH:MM:SS)                |

> **Regla**: Si un campo no está visible o no existe → `null`

### Cadena de fallback para identificador único (uso futuro)

Cuando se implemente el nombrado con folio, se usará esta prioridad:

```
1º  folio_operacion
 └── si null →
2º  autenticacion
     └── si null →
3º  referencia
         └── si null →
4º  clave_rastreo
             └── si null →
5º  fecha + hora_operacion (último recurso)
```

---

## 6. Validación de Texto Extraído de PDF

Para determinar si un PDF tiene texto útil (y no es un PDF-imagen):

Buscar **al menos 2 de estos 3 patrones** en el texto extraído:

1. **Monto**: presencia de `$` o números con formato `1,500.00`
2. **Fecha**: patrones tipo `22/09/2026`, `22-sep-2026`, `2026-09-22`
3. **Referencia bancaria**: secuencia numérica larga (>6 dígitos)

Si no hay suficientes patrones → tratar como PDF-imagen → convertir y usar visión.

---

## 7. Nombrado de Archivos

### Fase actual
```
{NOMBRE_CLIENTE}.pdf
```
- El nombre del cliente viene de:
  1. **Siguiente mensaje de texto** enviado por el remitente tras el comprobante (dentro de la ventana de espera de 30s).
  2. Si vence el tiempo sin mensaje de texto posterior: `comprobante_{TIMESTAMP}.pdf`.
  *(Nota: El texto que venga como pie de foto/caption en el propio archivo multimedia se ignora).*
- Si se guardan múltiples comprobantes para un mismo cliente, se resuelve sufijo único (`Cliente.pdf`, `Cliente_2.pdf`).
- Caracteres especiales se sanitizan.

### Caso de error en extracción
```
{NOMBRE_CLIENTE}_ERROR_{TIPO}.pdf
```
Tipos de error:
- `SIN-DATOS` → La IA no pudo extraer información
- `PDF-ILEGIBLE` → No se pudo leer ni como texto ni como imagen
- `IA-FALLO` → Error de la API de Groq (después de 3 reintentos)

### Fase futura (pendiente)
```
{FOLIO_OPERACION}_{NOMBRE_CLIENTE}.pdf
Ejemplo: 15446321_Eriksantiago.pdf
```

---

## 8. Volumen y Rendimiento

- **Mínimo diario**: ~53 comprobantes
- **Máximo diario**: ~90 comprobantes
- **Reintentos**: 3 intentos con backoff exponencial (2s, 4s) ante errores 429/503
- **Optimización**: Los PDFs con texto nativo van por la ruta de texto (sin visión), lo cual:
  - Reduce consumo de tokens ~10x
  - Es más rápido
  - Menor riesgo de rate-limit

---

## 9. Restricciones y Reglas

- ❌ **NO responder por WhatsApp** → Riesgo de baneo del número.
- ✅ Los errores se señalizan en el **nombre del archivo**.
- ✅ Todos los archivos finales se guardan como **PDF**.
- ✅ Imágenes recibidas se **convierten a PDF** para almacenamiento uniforme.
- ✅ PDFs recibidos se **conservan en su formato original**.

---

## 10. Dependencias del Proyecto

### Actuales
| Paquete             | Uso                                |
|---------------------|------------------------------------|
| `whatsapp-web.js`   | Cliente de WhatsApp                |
| `groq-sdk`          | API de IA para análisis            |
| `sharp`             | Optimización de imágenes           |
| `qrcode-terminal`   | QR para autenticación de WhatsApp  |
| `dotenv`            | Variables de entorno               |

### Por agregar
| Paquete             | Uso                                        |
|---------------------|--------------------------------------------|
| `pdf-parse`         | Extraer texto de PDFs                      |
| `pdf-poppler`       | Convertir PDF-imagen a imagen renderizada  |
| `pdfkit` o similar  | Convertir imágenes a PDF                   |

> **Nota**: Si `pdf-poppler` da problemas por dependencias del sistema, migrar a alternativas puras en JS.

---

## 11. Estructura de Archivos del Proyecto

```
prueba whatsapp web/
├── .env                        # GROQ_API_KEY
├── index.js                    # Punto de entrada: solo WhatsApp, conectar y delegar
├── mediaHandler.js             # Orquestador: detecta tipo, decide ruta, nombra archivo
├── services/
│   ├── colaPendientes.js       # Cola temporal de comprobantes sin caption (espera de texto)
│   ├── iaService.js            # Groq IA (modo visión + modo texto)
│   └── pdfService.js           # Extracción de texto, conversión PDF↔imagen
├── utils/
│   └── validators.js           # Patrones financieros, validación de datos, nombrado
├── comprobantes/               # Carpeta de salida (todo como PDF)
├── scripts/
│   └── patch-wwebjs.js         # Patch de compatibilidad
├── package.json
└── MEMORIA_PROCESO.md          # Este archivo
```

### Responsabilidades por módulo

| Módulo | Responsabilidad |
|--------|----------------|
| `index.js` | Inicializar WhatsApp, escuchar mensajes (media y texto posterior), delegar a colaPendientes / mediaHandler |
| `mediaHandler.js` | Orquestar: detectar tipo, preparar análisis (IA + PDF), guardar resultado con nombre único |
| `services/colaPendientes.js` | Gestionar ventana de espera (30s) por remitente para asociar el texto posterior con comprobantes sin caption |
| `services/iaService.js` | `analizarImagen(buffer)` y `analizarTexto(texto)` — ambos con el mismo prompt, reintentos, y response_format JSON |
| `services/pdfService.js` | `extraerTexto(buffer)` (pdf-parse), `pdfAImagen(buffer)` (pdf-poppler), `imagenAPdf(buffer)` (pdfkit) |
| `utils/validators.js` | `tieneTextoFinanciero(texto)`, `validarDatosExtraidos(json)`, `generarNombreArchivo(nombre, error)` |

### Flujo de conexión

```
index.js  ──> colaPendientes.js (si no hay caption, espera texto)
    │                  │
    ▼                  ▼
    └───> mediaHandler.js  →  iaService.js    (IA)
                │          →  pdfService.js   (PDFs)
                │          →  validators.js   (validación)
                ▼
          comprobantes/    (archivo PDF final)
```

---

## 12. Pendientes / Futuro

- [ ] Nombrado de archivos con folio de operación
- [ ] Folio de pago interno (nomenclatura PAG + número)
- [ ] Sincronización de carpeta local con OneDrive
- [ ] Filtros: números de teléfono específicos, grupos específicos
- [ ] Ignorar estados de WhatsApp (cuentan como mensaje)
- [ ] Categorización: conciliado vs. no conciliado
- [ ] Integración con API/backend PHP para enviar datos extraídos
