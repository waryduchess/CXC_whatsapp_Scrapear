# CXC_whatsapp_Scrapear

Bot de WhatsApp que descarga imágenes y PDFs, convierte las imágenes a PDF y los guarda
renombrados con el caption del mensaje.

## Qué hace

- Escucha mensajes de WhatsApp con `whatsapp-web.js` y `LocalAuth`.
- Descarga **imágenes** (`image/*`) y **PDFs** (`application/pdf`).
- Convierte cualquier imagen a PDF.
- Renombra el archivo con el **caption del mismo mensaje**.
- Guarda todo en `comprobantes/YYYY-MM-DD/` como PDF, usando la fecha del mensaje.
- Si no hay caption, usa `comprobante_<timestamp>.pdf`.
- Si el nombre ya existe, agrega `_2`, `_3`, etc.
- Ignora mensajes de texto, stickers, audios, videos y reacciones.

No usa IA ni base de datos: solo almacena los archivos recibidos.

## Panel web local

El servicio levanta un panel en `http://127.0.0.1:3001` (se puede cambiar con
`PANEL_PORT` en `.env`). Desde ahí puedes ver:

- Estado de la conexión y cuenta de WhatsApp.
- Código QR cuando hace falta vincular el dispositivo.
- Filtros activos, registros en vivo y comprobantes por fecha.
- Botones para reiniciar el servicio (bajo PM2) y abrir la carpeta de comprobantes.

El panel solo escucha en `127.0.0.1`; no se expone a la red local.

## Configuración

1. Copia `.env.example` a `.env`.
2. Configura el filtro de mensajes (opcional).
3. Instala dependencias:

```bash
npm install
```

4. Inicia el bot:

```bash
npm start
```

Abre `http://127.0.0.1:3001` y escanea el QR con WhatsApp la primera vez.

Funciona en Linux y Windows. La dependencia `whatsapp-web.js` se instala desde GitHub por
HTTPS (requiere Git instalado) y `.npmrc` permite que Puppeteer descargue Chrome durante
`npm install`.

## Windows con PM2

1. Copia el proyecto a una ruta corta, por ejemplo `C:\CXC_WhatsApp`.
2. Ejecuta `windows\instalar-windows.bat` una vez. Verifica Node.js y Git, instala las
   dependencias, deja PM2 local y crea los accesos de Escritorio e Inicio.
3. Usa el acceso `CXC WhatsApp` del Escritorio para abrir el panel. Si el servicio no está
   corriendo, el lanzador lo inicia sin mostrar ventanas negras.
4. El acceso de Inicio arranca el servicio al iniciar sesión en Windows.

Requisitos: Node.js 18 o superior, Git y Chrome o Edge. El servicio arranca al iniciar
sesión, no antes del login. Si el puerto 3001 está ocupado, cambia `PANEL_PORT` en `.env`
y vuelve a iniciar el servicio.

Comandos útiles:

```bash
npm run pm2:start
npm run pm2:save
npm run pm2:logs
```

## Filtros

```env
FILTRO_MODO=whitelist
NUMEROS_PERMITIDOS=+52 1 999 123-4567,529994445566
GRUPOS_PERMITIDOS=Mi grupo de pagos,120363000000000001@g.us
```

Modos disponibles: `todos`, `whitelist`, `blacklist`, `solo_privados`, `solo_grupos`.

Los números se separan por comas y se normalizan automáticamente. Para grupos puedes usar
el nombre visible exacto o el ID terminado en `@g.us`. Después de modificar `.env`,
reinicia el bot.

Para permitir todo:

```env
FILTRO_MODO=todos
```

## Prueba sin WhatsApp

```bash
node scripts/probar-archivos.js /ruta/a/imagen.jpg "Nombre del cliente"
node scripts/probar-archivos.js /ruta/a/comprobante.pdf "Nombre del cliente"
```

Los PDFs generados quedan en `comprobantes/YYYY-MM-DD/`, usando la fecha del mensaje en la
zona horaria local.
