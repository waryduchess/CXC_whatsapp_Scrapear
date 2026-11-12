# CXC_whatsapp_Scrapear

Bot de WhatsApp que descarga imágenes y PDFs, convierte las imágenes a PDF y los guarda
renombrados con el caption del mensaje.

## Qué hace

- Escucha mensajes de WhatsApp con `whatsapp-web.js` y `LocalAuth`.
- Descarga **imágenes** (`image/*`) y **PDFs** (`application/pdf`).
- Convierte cualquier imagen a PDF.
- Renombra el archivo con el **caption del mismo mensaje**.
- Guarda todo en `comprobantes/` como PDF.
- Si no hay caption, usa `comprobante_<timestamp>.pdf`.
- Si el nombre ya existe, agrega `_2`, `_3`, etc.
- Ignora mensajes de texto, stickers, audios, videos y reacciones.

No usa IA ni base de datos: solo almacena los archivos recibidos.

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

Escanea el QR con WhatsApp la primera vez.

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

Los PDFs generados quedan en `comprobantes/`.
