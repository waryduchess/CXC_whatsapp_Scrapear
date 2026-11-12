# Memoria del Proceso — Almacenamiento de Comprobantes vía WhatsApp

> Documento vivo con las decisiones y la arquitectura actual del sistema.
> Última actualización: 2026-11-12

---

## 1. Descripción General

El sistema recibe comprobantes de pago/transferencia por WhatsApp, ya sea como **imágenes**
(fotos, screenshots) o como **PDFs**. El bot descarga el archivo, convierte las imágenes a
PDF y lo guarda en una carpeta por grupo o chat, con el **remitente** y el **caption del
mismo mensaje** en el nombre.

No se analiza el contenido ni se persiste en base de datos: solo se almacenan los archivos.

---

## 2. Flujo de Entrada

- Se usa `whatsapp-web.js` con `LocalAuth` para mantener la sesión.
- Se filtran los mensajes según `FILTRO_MODO`, números y grupos. La configuración se toma
  de `config/filtros.json` si existe (guardada desde el panel); si no, de `.env`.
- Cuando llega un mensaje con media:
  - Se toma el **caption** (`msg.body`) y el **remitente** (`msg.getContact()`).
  - Se resuelve el **grupo o chat** para la subcarpeta.
  - Se descarga el archivo con `msg.downloadMedia()`.
  - Si es imagen (`image/*`) se convierte a PDF.
  - Si es PDF (`application/pdf`) se guarda tal cual.
  - Se guarda en `comprobantes/YYYY-MM-DD/<Grupo o Chat>/` (fecha del mensaje) con nombre único.
- Tipos ignorados: texto, audio, video, stickers, reacciones y estados.

---

## 3. Flujo de Procesamiento

```
WhatsApp recibe media
        │
        ├── ¿Es imagen (image/*)?
        │       ├── Normalizar con sharp si no es JPEG/PNG
        │       ├── Convertir a PDF con pdfkit
        │       └── Guardar como {GRUPO_O_CHAT}/{REMITENTE} - {CAPTION}.pdf
        │
        ├── ¿Es PDF (application/pdf)?
        │       └── Guardar como {GRUPO_O_CHAT}/{REMITENTE} - {CAPTION}.pdf (sin modificar)
        │
        └── ¿Otro tipo? → IGNORAR
```

---

## 4. Carpetas y Nombrado de Archivos

```
comprobantes/{YYYY-MM-DD}/{GRUPO_O_CHAT}/{REMITENTE} - {CAPTION}.pdf
```

- La carpeta diaria usa la **fecha del mensaje** (`msg.timestamp`) en la zona horaria local.
- La subcarpeta usa el **nombre del grupo**; si no se resuelve, su ID.
- En chats privados, la subcarpeta usa el nombre del contacto (`contact.name`, luego `contact.pushname`) o su número.
- Si dos grupos comparten nombre, se agrega un sufijo con los últimos 6 dígitos del ID del grupo.
- Si un chat privado se llama igual que un grupo, se agrega un sufijo con los últimos 4 dígitos del número.
- El nombre del archivo usa `<remitente> - <caption>`.
- Si el caption está vacío: `<remitente>.pdf`; sin remitente: `comprobante_{TIMESTAMP}.pdf`.
- Caracteres no válidos para nombres de archivo se reemplazan por `-`.
- Nombres válidos en Windows: se evitan nombres reservados (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) y se limita la longitud.
- Si el nombre ya existe: `omar - Hotel Haba.pdf`, `omar - Hotel Haba_2.pdf`, etc.

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
| `qrcode`            | Imagen del QR en el panel web      |
| `dotenv`            | Variables de entorno               |
| `pdfkit`            | Convertir imágenes a PDF           |
| `sharp`             | Normalizar imágenes a PNG/JPEG     |
| `pm2` (dev)         | Proceso en segundo plano y reinicio |

---

## 7. Estructura de Archivos

```
CXC_whatsapp_Scrapear/
├── .env                        # Filtros iniciales y PANEL_PORT
├── config/
│   └── filtros.json            # Filtros guardados desde el panel (prioridad sobre .env)
├── index.js                    # Punto de entrada: WhatsApp, panel y watchdog
├── mediaHandler.js             # Convierte a PDF y guarda el archivo
├── ecosystem.config.js         # Configuración de PM2
├── panel/
│   ├── server.js               # HTTP local, API y SSE
│   └── public/                 # Interfaz del panel
├── services/
│   ├── estado.js               # Estado compartido y eventos
│   ├── logger.js               # Buffer de registros y captura de consola
│   ├── configFiltros.js        # Validación y persistencia de filtros
│   ├── carpetas.js             # Carpeta por grupo/chat y sufijos por colisión
│   ├── filtroGrupos.js         # Resolución de grupos
│   ├── filtroMensajes.js       # Filtro principal
│   ├── filtroNumeros.js        # Filtro de números
│   └── pdfService.js           # Conversión imagen → PDF
├── utils/
│   └── validators.js           # Nombres de archivo y carpetas
├── windows/
│   ├── lanzador.vbs            # Arranque silencioso y apertura del panel
│   ├── instalar-windows.ps1    # Instalación y accesos directos
│   ├── instalar-windows.bat    # Lanzador del instalador
│   └── cxc-whatsapp.ico        # Icono de los accesos de Escritorio e Inicio
├── comprobantes/               # Salida (PDF) por fecha y grupo/chat
├── scripts/
│   └── probar-archivos.js      # Prueba sin WhatsApp
├── package.json
├── .npmrc                      # Permisos de npm para git y Puppeteer
└── MEMORIA_PROCESO.md          # Este archivo
```

### Responsabilidades por módulo

| Módulo | Responsabilidad |
|--------|----------------|
| `index.js` | Inicializar WhatsApp, filtrar mensajes, resolver remitente, publicar estado y vigilar Chromium |
| `mediaHandler.js` | Convertir imágenes a PDF, resolver carpeta y nombre único, y guardar |
| `panel/server.js` | Servir el panel, API local, SSE y descarga de comprobantes |
| `services/estado.js` | Mantener el estado compartido y emitir eventos |
| `services/logger.js` | Guardar los últimos registros y emitirlos en vivo |
| `services/configFiltros.js` | Validar, guardar y aplicar `config/filtros.json` |
| `services/carpetas.js` | Resolver grupo/chat y sufijos para nombres repetidos |
| `services/pdfService.js` | `imagenAPdf(buffer, mimetype)` y `normalizarImagen` |
| `utils/validators.js` | `generarNombreComprobante(caption, remitente)` y `sanitizarNombreCarpeta` |
| `services/filtro*.js` | Filtrar por modo, números y grupos |

---

## 8. Panel web y despliegue

- El panel corre dentro del mismo proceso que el bot y escucha solo en `127.0.0.1`.
- Puerto por defecto: `3001`, configurable con `PANEL_PORT` en `.env`.
- Muestra estado, QR, cuenta conectada, filtros, registros y comprobantes por fecha, grupo o chat.
- La API interna expone `/api/salud`, `/api/estado`, `/api/logs`, `/api/eventos`,
  `/api/comprobantes`, `/api/filtros`, `/api/grupos`, `/api/reiniciar` y `/api/abrir-carpeta`.
- La descarga acepta `/api/comprobantes/:fecha/:grupo/:archivo` y mantiene la ruta antigua
  `/api/comprobantes/:fecha/:archivo` para los comprobantes guardados en la raíz de la fecha.
- El botón **Editar** abre un modal con pestañas General/Números/Grupos. Los filtros se
  guardan en `config/filtros.json` (escritura atómica), se aplican en caliente y se
  notifican por SSE. `POST /api/filtros` valida modo, números y grupos; `GET /api/grupos`
  lista los grupos conocidos para el selector.
- El botón de reinicio solo funciona bajo PM2 (`process.env.pm_id`).
- PM2 usa `ecosystem.config.js` con autorestart, backoff, límite de memoria y logs en `logs/`.
- Un watchdog revisa Chromium cada 30 segundos y sale si el navegador o la página se caen;
  PM2 vuelve a iniciar el proceso.
- En Windows, `windows\instalar-windows.bat` instala dependencias, PM2 local y crea los
  accesos de Escritorio e Inicio con el icono `windows\cxc-whatsapp.ico`. El arranque es al
  iniciar sesión, no antes del login.
- El lanzador `windows\lanzador.vbs` verifica `/api/salud`, inicia o recarga PM2 y abre el
  panel en Chrome o Edge; si no existen, usa el navegador predeterminado.

---

## 9. Pendientes / Futuro

- [ ] Sincronización de la carpeta local con OneDrive.
- [ ] Categorización de comprobantes (conciliado vs. no conciliado).
