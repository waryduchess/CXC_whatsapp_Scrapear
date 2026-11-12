# Memoria del Proceso — Almacenamiento de Comprobantes vía WhatsApp

> Documento vivo con las decisiones y la arquitectura actual del sistema.
> Última actualización: 2026-11-10

---

## 1. Descripción General

El sistema recibe comprobantes de pago/transferencia por WhatsApp, ya sea como **imágenes**
(fotos, screenshots) o como **PDFs**. El bot descarga el archivo, convierte las imágenes a
PDF y lo guarda renombrado con el **caption del mismo mensaje**.

No se analiza el contenido ni se persiste en base de datos: solo se almacenan los archivos.

---

## 2. Flujo de Entrada

- Se usa `whatsapp-web.js` con `LocalAuth` para mantener la sesión.
- Se filtran los mensajes según `FILTRO_MODO`, números y grupos configurados en `.env`.
- Cuando llega un mensaje con media:
  - Se toma el **caption** (`msg.body`) como nombre del archivo.
  - Se descarga el archivo con `msg.downloadMedia()`.
  - Si es imagen (`image/*`) se convierte a PDF.
  - Si es PDF (`application/pdf`) se guarda tal cual.
  - Se guarda en `comprobantes/YYYY-MM-DD/` (fecha del mensaje) con nombre único.
- Tipos ignorados: texto, audio, video, stickers, reacciones y estados.

---

## 3. Flujo de Procesamiento

```
WhatsApp recibe media
        │
        ├── ¿Es imagen (image/*)?
        │       ├── Normalizar con sharp si no es JPEG/PNG
        │       ├── Convertir a PDF con pdfkit
        │       └── Guardar como {CAPTION}.pdf
        │
        ├── ¿Es PDF (application/pdf)?
        │       └── Guardar como {CAPTION}.pdf (sin modificar)
        │
        └── ¿Otro tipo? → IGNORAR
```

---

## 4. Carpetas y Nombrado de Archivos

```
comprobantes/{YYYY-MM-DD}/{CAPTION}.pdf
```

- La carpeta diaria usa la **fecha del mensaje** (`msg.timestamp`) en la zona horaria local.
- El nombre viene del **caption del mismo mensaje**.
- Si el caption está vacío: `comprobante_{TIMESTAMP}.pdf`.
- Caracteres no válidos para nombres de archivo se reemplazan por `-`.
- Nombres válidos en Windows: se evitan nombres reservados (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) y se limita la longitud.
- Si el nombre ya existe: `Cliente.pdf`, `Cliente_2.pdf`, `Cliente_3.pdf`, etc.

---

## 5. Restricciones y Reglas

- No responder por WhatsApp (riesgo de baneo del número).
- Todos los archivos finales se guardan como **PDF**.
- Las imágenes recibidas se convierten a PDF.
- Los PDFs recibidos se conservan en su formato original.
- No hay análisis con IA ni escritura en base de datos.

---

## 6. Dependencias del Proyecto

| Paquete             | Uso                                |
|---------------------|------------------------------------|
| `whatsapp-web.js`   | Cliente de WhatsApp                |
| `qrcode-terminal`   | QR para autenticación de WhatsApp  |
| `dotenv`            | Variables de entorno               |
| `pdfkit`            | Convertir imágenes a PDF           |
| `sharp`             | Normalizar imágenes a PNG/JPEG     |

---

## 7. Estructura de Archivos

```
CXC_whatsapp_Scrapear/
├── .env                        # Filtros de mensajes
├── index.js                    # Punto de entrada: WhatsApp y delegación
├── mediaHandler.js             # Convierte a PDF y guarda el archivo
├── services/
│   ├── filtroGrupos.js         # Resolución de grupos
│   ├── filtroMensajes.js       # Filtro principal
│   ├── filtroNumeros.js        # Filtro de números
│   └── pdfService.js           # Conversión imagen → PDF
├── utils/
│   └── validators.js           # Generación del nombre del archivo
├── comprobantes/               # Salida (PDF) por fecha YYYY-MM-DD
├── scripts/
│   └── probar-archivos.js      # Prueba sin WhatsApp
├── package.json
├── .npmrc                      # Permisos de npm para git y Puppeteer
└── MEMORIA_PROCESO.md          # Este archivo
```

### Responsabilidades por módulo

| Módulo | Responsabilidad |
|--------|----------------|
| `index.js` | Inicializar WhatsApp, filtrar mensajes y delegar el media a `mediaHandler` |
| `mediaHandler.js` | Convertir imágenes a PDF, resolver nombre único y guardar |
| `services/pdfService.js` | `imagenAPdf(buffer, mimetype)` y `normalizarImagen` |
| `utils/validators.js` | `generarNombreArchivo(caption)` |
| `services/filtro*.js` | Filtrar por modo, números y grupos |

---

## 8. Pendientes / Futuro

- [ ] Sincronización de la carpeta local con OneDrive.
- [ ] Categorización de comprobantes (conciliado vs. no conciliado).
