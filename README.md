# CXC_whatsapp_Scrapear

## Configuración

1. Copia `.env.example` a `.env`.
2. Añade tu clave de Groq en `GROQ_API_KEY`.
3. Configura el filtro de mensajes.
4. Instala dependencias con `npm install`.
5. Inicia el bot con `npm start`.

## Variables de entorno

```env
GROQ_API_KEY=tu_clave_aqui
FILTRO_MODO=whitelist
NUMEROS_PERMITIDOS=+52 1 999 123-4567,529994445566
GRUPOS_PERMITIDOS=Mi grupo de pagos,120363000000000001@g.us
```

### Usar la whitelist

Para procesar únicamente mensajes de números autorizados, configura en `.env`:

```env
FILTRO_MODO=whitelist
NUMEROS_PERMITIDOS=+52 1 999 123-4567,529994445566
```

Los números se separan por comas y se normalizan automáticamente. También puedes usar
identificadores como `5219991234567@c.us`. Después de modificar `.env`, reinicia el bot.
Un número no incluido será descartado antes de descargar o analizar su comprobante.

Para grupos, `GRUPOS_PERMITIDOS` acepta el nombre visible exacto o el ID completo
terminado en `@g.us`. La comparación del nombre ignora mayúsculas y espacios al inicio
y al final. Si WhatsApp detecta el mismo nombre asociado a varios grupos, ese nombre
se vuelve ambiguo y deberás usar el ID del grupo.

La resolución y validación de grupos está separada en
`services/filtroGrupos.js`; `index.js` solo resuelve el nombre del chat y delega la
evaluación al filtro.

La normalización y validación de números está separada en
`services/filtroNumeros.js`; `filtroMensajes.js` coordina ambos filtros.

Para permitir nuevamente todos los números:

```env
FILTRO_MODO=todos
```
