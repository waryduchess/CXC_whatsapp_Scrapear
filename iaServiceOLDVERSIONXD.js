const Groq = require('groq-sdk');
const sharp = require('sharp');

// Inicialización del cliente de Groq utilizando la variable de entorno
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_MODEL = "qwen/qwen3.8-27b";

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
 * Envía la imagen procesada a Groq y retorna el JSON extraído.
 * @param {Buffer} bufferImagen 
 * @returns {Promise<Object>}
 */
async function analizarComprobanteGroq(bufferImagen) {
    const imagenB64 = await optimizarImagenBase64(bufferImagen);
/**
 AQUI DEFINIREMOS TODO EL CONTEXTO
 Aqui la IA podra entender que es lo que quermos que haga, como, y las reglas que debe de seguir.
 Si ningun dado es reconocido se quedara como nulo.
 */
    const prompt = `
Analiza este comprobante de pago/transferencia bancaria en México. 
Extrae los datos en un objeto JSON estricto con las siguientes reglas de campo:

- "banco_origen": Nombre del banco emisor. Si dice 'Guardadito' o 'Guardadito Digital', asigna 'BANCO AZTECA'. Si es Mercado Pago Wallet, asigna 'MERCADO PAGO' Si el comprobante dice 'Transferir & Dimo®', asigna 'BBVA'.
- "cuenta_origen_digitos": Los últimos dígitos visibles o el número enmascarado de la cuenta/tarjeta/CLABE de ORIGEN (ejemplo: '1554', '0474', '6762'). Si no hay, pon null.
- "banco_destino": Nombre del banco receptor.
- "cuenta_destino_digitos": Los últimos dígitos visibles o enmascarados de la cuenta/tarjeta/CLABE de DESTINO (ejemplo: '1393', '759', '6759'). Si no hay, pon null.
- "monto": Número flotante/entero sin símbolos (ejemplo: 500 o 1500.50).
- "fecha": Fecha de la operación en formato YYYY-MM-DD.
- "folio": Número de folio de operación, autorización o número de comprobante largo.
- "referencia": ÚNICAMENTE números de referencia bancarios. NUNCA pongas textos o motivos de pago aquí.
- "concepto": El texto libre o motivo que la persona escribió para la transferencia.

Si algún campo no está visible o no existe, asígnale el valor null.
    `;

    const payload = {
        model: GROQ_MODEL,
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    { type: "image_url", image_url: { url: imagenB64 } }
                ]
            }
        ],
        response_format: { type: "json_object" },
        max_tokens: 300,
        temperature: 0.1
    };

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

module.exports = { analizarComprobanteGroq };