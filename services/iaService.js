/**
 * iaService.js
 * Servicio de IA (Groq) para análisis de comprobantes de pago.
 * Dos modos: visión (imagen) y texto (PDF con texto nativo).
 */

const Groq = require('groq-sdk');
const sharp = require('sharp');

// Inicialización del cliente de Groq utilizando la variable de entorno
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = "qwen/qwen3.8-27b";

/**
 * Prompt compartido para ambos modos de análisis.
 * Se extraen todos los identificadores por separado para uso futuro.
 */
const PROMPT_EXTRACCION = `
Analiza este comprobante de pago/transferencia/comprobante de compra en México.
Extrae los datos en un objeto JSON estricto con las siguientes reglas de campo:

- "banco_origen": Banco o canal emisor del pago. Si dice 'Guardadito' o 'Guardadito Digital', asigna 'BANCO AZTECA'. Si es Mercado Pago, asigna 'MERCADO PAGO'. Si dice 'Transferir & Dimo®', asigna 'BBVA'. Si no aparece un banco pero se ve el comercio/caja/POS emisor (ej: nombre de tienda), usa ese nombre. Si no hay nada, pon null.
- "cuenta_origen_digitos": Los últimos dígitos visibles o el número enmascarado de la cuenta/tarjeta/CLABE de ORIGEN (ejemplo: '1554', '0474', '6762'). Si no hay, pon null.
- "banco_destino": Banco receptor si se ve (ejemplo: 'SANTANDER', 'BBVA'). Si no hay, pon null.
- "cuenta_destino_digitos": Los últimos dígitos visibles o enmascarados de la cuenta/tarjeta/CLABE de DESTINO (ejemplo: '1393', '759', '6759'). Si no hay, pon null.
- "monto": Número flotante/entero SIN símbolos ni comas (ejemplo: 500 o 1500.50). SIEMPRE extrae el monto si hay un número con signo $ o un total.
- "fecha": Fecha de la operación en formato YYYY-MM-DD.
- "hora_operacion": Hora de la operación en formato HH:MM:SS. Si no hay, pon null.
- "folio_operacion": Número de folio de operación o número de comprobante largo. Si no hay, pon null.
- "autenticacion": Número de autenticación o autorización. Si no hay, pon null.
- "referencia": ÚNICAMENTE números de referencia bancarios. NUNCA pongas textos o motivos de pago aquí. Si no hay, pon null.
- "clave_rastreo": Clave de rastreo interbancaria. Si no hay, pon null.
- "concepto": Texto libre, motivo o descripción de la compra o transferencia. Si no hay, pon null.

Si algún campo no está visible o no existe, asígnale el valor null. Nunca inventes datos.
El monto y la fecha son los datos más importantes: márcalos siempre que aparezcan en el comprobante.
`;

/**
 * Redimensiona y optimiza la imagen en memoria para reducir el consumo de tokens.
 * @param {Buffer} bufferImagen 
 * @returns {Promise<string>} Data URL en Base64
 */
async function optimizarImagenBase64(bufferImagen) {
    const anchoMax = 1280;

    const imagenOptimizada = await sharp(bufferImagen)
        .resize({ width: anchoMax, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

    return `data:image/jpeg;base64,${imagenOptimizada.toString('base64')}`;
}

/**
 * Ejecuta la llamada a Groq con lógica de reintentos (3 intentos, backoff exponencial).
 * @param {Object} payload - Payload completo para groq.chat.completions.create
 * @returns {Promise<Object>} JSON parseado de la respuesta
 */
async function ejecutarConReintentos(payload) {
    for (let intento = 0; intento < 3; intento++) {
        try {
            const respuesta = await groq.chat.completions.create(payload);
            const contenidoTexto = respuesta.choices[0]?.message?.content || '{}';
            return JSON.parse(contenidoTexto);
        } catch (error) {
            const status = error.status || error.statusCode;
            console.warn(`[!] Intento ${intento + 1}/3 falló (Status: ${status}): ${error.message}`);

            if ([429, 503].includes(status) && intento < 2) {
                await new Promise(resolve => setTimeout(resolve, 2000 * (intento + 1)));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Analiza un comprobante a partir de una IMAGEN usando Groq visión.
 * Usado para: fotos de vouchers, screenshots, y PDFs-imagen convertidos.
 * 
 * @param {Buffer} bufferImagen - Buffer de la imagen (JPEG/PNG)
 * @returns {Promise<Object>} Datos extraídos como JSON
 */
async function analizarImagen(bufferImagen) {
    const imagenB64 = await optimizarImagenBase64(bufferImagen);

    const payload = {
        model: GROQ_MODEL,
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: PROMPT_EXTRACCION },
                    { type: "image_url", image_url: { url: imagenB64 } }
                ]
            }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.1
    };

    return ejecutarConReintentos(payload);
}

/**
 * Analiza un comprobante a partir de TEXTO extraído de un PDF.
 * Usado para: PDFs con texto nativo (BBVA, Santander, Banorte).
 * Más rápido y barato que el modo visión.
 * 
 * @param {string} textoExtraido - Texto plano extraído del PDF
 * @returns {Promise<Object>} Datos extraídos como JSON
 */
async function analizarTexto(textoExtraido) {
    const contenidoCompleto = `${PROMPT_EXTRACCION}\n\n--- CONTENIDO DEL COMPROBANTE ---\n${textoExtraido}\n--- FIN DEL COMPROBANTE ---`;

    const payload = {
        model: GROQ_MODEL,
        messages: [
            {
                role: "user",
                content: contenidoCompleto
            }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
        temperature: 0.1
    };

    return ejecutarConReintentos(payload);
}

module.exports = {
    analizarImagen,
    analizarTexto
};
