/**
 * iaService.js
 * Extracción de datos de comprobantes con DeepSeek.
 *
 * Rutas:
 * - Imagen → visión (deepseek-flash).
 * - PDF con texto nativo → modelo de texto.
 * - PDF escaneado → OCR API y luego modelo de texto.
 *
 * No usa SDK: fetch nativo (Node 18+) para no agregar dependencias.
 */

const sharp = require('sharp');
const { PDFParse } = require('pdf-parse');

const PROMPT_EXTRACCION = `
Analiza este comprobante de pago, transferencia o compra en México y devuelve
ÚNICAMENTE un objeto JSON válido, sin explicaciones ni bloques de código.

Campos y reglas:
- "banco_origen": banco o canal emisor. Si dice "Guardadito" o "Guardadito Digital", usa "BANCO AZTECA". Si es Mercado Pago, usa "MERCADO PAGO". Si dice "Transferir & Dimo", usa "BBVA". Si no hay banco pero se ve el comercio o caja emisora, usa ese nombre. Si no hay nada, null.
- "cuenta_origen_digitos": últimos dígitos visibles o número enmascarado de la cuenta, tarjeta o CLABE de origen. Si no hay, null.
- "banco_destino": banco receptor si se ve. Si no hay, null.
- "cuenta_destino_digitos": últimos dígitos visibles o enmascarados de la cuenta, tarjeta o CLABE de destino. Si no hay, null.
- "monto": número sin símbolos ni comas (ejemplo: 500 o 1500.50). Si hay signo $ o un total, extrae ese monto. Si no hay, null.
- "fecha": fecha de la operación en formato YYYY-MM-DD. Si no hay, null.
- "hora_operacion": hora de la operación en formato HH:MM:SS. Si no hay, null.
- "folio_operacion": folio de operación o número de comprobante largo. Si no hay, null.
- "autenticacion": número de autenticación o autorización. Si no hay, null.
- "referencia": SOLO números de referencia bancarios; nunca textos ni motivos de pago. Si no hay, null.
- "clave_rastreo": clave de rastreo interbancaria. Si no hay, null.
- "concepto": texto libre con el motivo o descripción de la compra o transferencia. Si no hay, null.

Si un campo no está visible o no existe, usa null. Nunca inventes datos.
El monto y la fecha son los más importantes: extráelos siempre que aparezcan.
Si el documento contiene varias operaciones (por ejemplo un estado de cuenta),
extrae la operación más relevante y aclara en "concepto" que proviene de un estado de cuenta.

Responde con este objeto y todas las llaves:
{"banco_origen":null,"cuenta_origen_digitos":null,"banco_destino":null,"cuenta_destino_digitos":null,"monto":null,"fecha":null,"hora_operacion":null,"folio_operacion":null,"autenticacion":null,"referencia":null,"clave_rastreo":null,"concepto":null}
`.trim();

const CAMPOS_TEXTO = [
    'banco_origen',
    'cuenta_origen_digitos',
    'banco_destino',
    'cuenta_destino_digitos',
    'folio_operacion',
    'autenticacion',
    'referencia',
    'clave_rastreo',
    'concepto'
];

const VALORES_VACIOS = new Set(['null', 'undefined', 'n/a', 'na', 'no visible', 'ninguno', '-']);
const ESTADOS_REINTENTO = new Set([408, 425, 429, 500, 502, 503, 504]);

function configuracion() {
    return {
        apiKey: String(process.env.DEEPSEEK_API_KEY || '').trim(),
        baseUrl: String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, ''),
        modelo: String(process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim(),
        timeoutMs: Math.max(5000, Number(process.env.IA_TIMEOUT_MS) || 90000),
        reintentos: Math.min(5, Math.max(1, Number(process.env.IA_REINTENTOS) || 3))
    };
}

function estaConfigurada() {
    return Boolean(configuracion().apiKey);
}

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(valor) {
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    if (!texto || VALORES_VACIOS.has(texto.toLowerCase())) return null;
    return texto;
}

function normalizarMonto(valor) {
    if (valor === undefined || valor === null || valor === '') return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;

    let texto = String(valor)
        .replace(/[^\d.,-]/g, '')
        .trim();
    if (!texto) return null;

    const tieneComa = texto.includes(',');
    const tienePunto = texto.includes('.');

    if (tieneComa && tienePunto) {
        texto = texto.lastIndexOf(',') > texto.lastIndexOf('.')
            ? texto.replace(/\./g, '').replace(',', '.')
            : texto.replace(/,/g, '');
    } else if (tieneComa) {
        const decimales = texto.split(',').pop();
        texto = decimales.length === 2
            ? texto.replace(/\./g, '').replace(',', '.')
            : texto.replace(/,/g, '');
    }

    const numero = Number.parseFloat(texto);
    return Number.isFinite(numero) ? numero : null;
}

function normalizarFecha(valor) {
    const texto = limpiarTexto(valor);
    if (!texto) return null;

    let coincidencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (coincidencia) {
        return `${coincidencia[1]}-${coincidencia[2]}-${coincidencia[3]}`;
    }

    coincidencia = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (coincidencia) {
        const dia = coincidencia[1].padStart(2, '0');
        const mes = coincidencia[2].padStart(2, '0');
        const anio = coincidencia[3].length === 2 ? `20${coincidencia[3]}` : coincidencia[3];
        return `${anio}-${mes}-${dia}`;
    }

    const fecha = new Date(texto);
    if (!Number.isNaN(fecha.getTime())) {
        const anio = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');
        return `${anio}-${mes}-${dia}`;
    }

    return null;
}

function normalizarHora(valor) {
    const texto = limpiarTexto(valor);
    if (!texto) return null;

    const coincidencia = texto.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!coincidencia) return null;

    const horas = coincidencia[1].padStart(2, '0');
    const minutos = coincidencia[2];
    const segundos = coincidencia[3] || '00';
    return `${horas}:${minutos}:${segundos}`;
}

function normalizarBanco(valor) {
    const texto = limpiarTexto(valor);
    if (!texto) return null;
    const minusculas = texto.toLowerCase();
    if (minusculas.includes('guardadito')) return 'BANCO AZTECA';
    if (minusculas.includes('mercado pago')) return 'MERCADO PAGO';
    if (minusculas.includes('transferir & dimo') || minusculas.includes('transferir & dimo®')) return 'BBVA';
    return texto;
}

function normalizarDatos(datos) {
    const salida = {};

    for (const campo of CAMPOS_TEXTO) {
        salida[campo] = limpiarTexto(datos?.[campo]);
    }

    salida.banco_origen = normalizarBanco(datos?.banco_origen);
    salida.monto = normalizarMonto(datos?.monto);
    salida.fecha = normalizarFecha(datos?.fecha);
    salida.hora_operacion = normalizarHora(datos?.hora_operacion);
    salida.folio_operacion = limpiarTexto(datos?.folio_operacion ?? datos?.folio);

    return salida;
}

function validarDatos(datos) {
    const errores = [];
    if (!datos || typeof datos !== 'object') {
        return { valido: false, errores: ['Sin datos'] };
    }
    if (datos.monto === null || datos.monto === undefined) errores.push('monto');
    if (!datos.fecha) errores.push('fecha');
    return { valido: errores.length === 0, errores };
}

function parsearJson(texto) {
    if (!texto) return null;
    let limpio = String(texto).trim();
    limpio = limpio.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    try {
        return JSON.parse(limpio);
    } catch (error) {
        const inicio = limpio.indexOf('{');
        const fin = limpio.lastIndexOf('}');
        if (inicio === -1 || fin <= inicio) return null;
        try {
            return JSON.parse(limpio.slice(inicio, fin + 1));
        } catch (errorInterno) {
            return null;
        }
    }
}

async function solicitar(ruta, opciones = {}) {
    const { apiKey, baseUrl, timeoutMs } = configuracion();
    if (!apiKey) {
        throw new Error('Falta DEEPSEEK_API_KEY en .env');
    }

    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), timeoutMs);

    try {
        const respuesta = await fetch(`${baseUrl}${ruta}`, {
            ...opciones,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                ...(opciones.headers || {})
            },
            signal: controlador.signal
        });

        const cuerpo = await respuesta.text();

        if (!respuesta.ok) {
            let mensaje = cuerpo;
            try {
                const json = JSON.parse(cuerpo);
                mensaje = json?.error?.message || json?.message || cuerpo;
            } catch (error) {
                // El cuerpo no es JSON: se conserva el texto.
            }
            const fallo = new Error(`DeepSeek ${respuesta.status}: ${String(mensaje).slice(0, 300)}`);
            fallo.status = respuesta.status;
            throw fallo;
        }

        if (!cuerpo.trim()) return {};
        return JSON.parse(cuerpo);
    } catch (error) {
        if (error.name === 'AbortError') {
            const fallo = new Error(`Tiempo de espera agotado (${Math.round(timeoutMs / 1000)} s)`);
            fallo.code = 'IA_TIMEOUT';
            throw fallo;
        }
        throw error;
    } finally {
        clearTimeout(temporizador);
    }
}

async function conReintentos(fn) {
    const { reintentos } = configuracion();
    let ultimoError;

    for (let intento = 1; intento <= reintentos; intento++) {
        try {
            return await fn();
        } catch (error) {
            ultimoError = error;
            const estado = error.status;
            const reintentable = ESTADOS_REINTENTO.has(estado) ||
                error.code === 'IA_TIMEOUT' ||
                error.name === 'TypeError';
            if (!reintentable || intento === reintentos) break;
            const espera = (2000 * intento) + Math.floor(Math.random() * 500);
            console.warn(`[ia] Intento ${intento}/${reintentos} falló (${estado || error.code || error.message}). Reintentando en ${Math.round(espera / 1000)} s...`);
            await esperar(espera);
        }
    }

    throw ultimoError;
}

async function extraerConModelo(contenido) {
    const { modelo } = configuracion();

    const payload = {
        model: modelo,
        messages: [{ role: 'user', content: contenido }],
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        temperature: 0.1,
        max_tokens: 1500
    };

    const respuesta = await conReintentos(() => solicitar('/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }));

    const texto = respuesta?.choices?.[0]?.message?.content || '';
    const datos = parsearJson(texto);
    if (!datos) {
        throw new Error('La IA no devolvió JSON válido');
    }

    return normalizarDatos(datos);
}

async function optimizarImagen(buffer) {
    const imagen = sharp(buffer).rotate();
    const metadatos = await imagen.metadata();
    const formato = String(metadatos.format || '').toLowerCase();

    const redimensionada = imagen.resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true
    });

    if (formato === 'jpeg' || formato === 'jpg') {
        return {
            buffer: await redimensionada.jpeg({ quality: 88, mozjpeg: true }).toBuffer(),
            mimetype: 'image/jpeg'
        };
    }

    return {
        buffer: await redimensionada.png({ compressionLevel: 9 }).toBuffer(),
        mimetype: 'image/png'
    };
}

/**
 * Analiza una imagen con el modelo de visión.
 *
 * @param {Buffer} buffer
 * @returns {Promise<Object>} Datos normalizados
 */
async function analizarImagen(buffer) {
    const { buffer: optimizada, mimetype } = await optimizarImagen(buffer);
    const dataUrl = `data:${mimetype};base64,${optimizada.toString('base64')}`;

    return extraerConModelo([
        { type: 'text', text: PROMPT_EXTRACCION },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } }
    ]);
}

/**
 * Analiza texto ya extraído (PDF nativo u OCR).
 *
 * @param {string} texto
 * @returns {Promise<Object>} Datos normalizados
 */
async function analizarTexto(texto) {
    const contenido = `${PROMPT_EXTRACCION}\n\n--- CONTENIDO DEL COMPROBANTE ---\n${texto}\n--- FIN DEL COMPROBANTE ---`;
    return extraerConModelo(contenido);
}

async function extraerTextoPdf(buffer) {
    let parser;
    try {
        parser = new PDFParse({ data: buffer });
        const resultado = await parser.getText();
        return String(resultado?.text || '');
    } catch (error) {
        console.warn('[ia] No se pudo extraer texto del PDF:', error.message || error);
        return '';
    } finally {
        if (parser && typeof parser.destroy === 'function') {
            try {
                await parser.destroy();
            } catch (error) {
                // Sin acción: el parser se libera al terminar el proceso.
            }
        }
    }
}

function tieneTextoUtil(texto) {
    if (!texto || texto.trim().length < 80) return false;

    let patrones = 0;
    if (/\$\s?\d|\d{1,3}(,\d{3})+(\.\d{2})?|\d+\.\d{2}/.test(texto)) patrones++;
    if (/\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}/.test(texto)) patrones++;
    if (/\d{7,}/.test(texto)) patrones++;
    return patrones >= 2;
}

async function reconocerTextoPdf(buffer, nombreArchivo = 'comprobante.pdf') {
    const formulario = new FormData();
    formulario.append('purpose', 'text_recognition');
    formulario.append('file', new Blob([buffer], { type: 'application/pdf' }), nombreArchivo);

    const respuesta = await conReintentos(() => solicitar('/v1/tools/ocr', {
        method: 'POST',
        body: formulario
    }));

    if (respuesta?.error) {
        throw new Error(respuesta.error.message || 'El OCR no pudo procesar el PDF');
    }

    return (respuesta?.pages || [])
        .map(pagina => String(pagina.text || ''))
        .join('\n')
        .trim();
}

/**
 * Analiza un PDF: primero intenta texto nativo y, si no hay, usa OCR.
 *
 * @param {Buffer} buffer
 * @param {string} [nombreArchivo]
 * @returns {Promise<{ datos: Object, rutaUsada: string }>}
 */
async function analizarPdf(buffer, nombreArchivo) {
    const texto = await extraerTextoPdf(buffer);

    if (tieneTextoUtil(texto)) {
        return { datos: await analizarTexto(texto), rutaUsada: 'pdf-texto' };
    }

    console.log('[ia] PDF sin texto útil: usando OCR de DeepSeek');
    const textoOcr = await reconocerTextoPdf(buffer, nombreArchivo);
    if (!textoOcr) {
        throw new Error('El OCR no devolvió texto');
    }

    return { datos: await analizarTexto(textoOcr), rutaUsada: 'pdf-ocr' };
}

/**
 * Punto de entrada: analiza un comprobante en imagen o PDF.
 *
 * @param {{ buffer: Buffer, mimetype?: string, nombreArchivo?: string }} opciones
 * @returns {Promise<{ datos: Object, rutaUsada: string }>}
 */
async function analizarComprobante({ buffer, mimetype = '', nombreArchivo = 'comprobante.pdf' }) {
    if (!buffer || !buffer.length) {
        throw new Error('Archivo vacío');
    }

    const tipo = String(mimetype).toLowerCase();
    const esPdf = tipo === 'application/pdf' || /\.pdf$/i.test(nombreArchivo);

    if (esPdf) {
        return analizarPdf(buffer, nombreArchivo);
    }

    if (tipo.startsWith('image/') || !tipo) {
        return { datos: await analizarImagen(buffer), rutaUsada: 'imagen-vision' };
    }

    throw new Error(`Tipo no soportado para IA: ${mimetype}`);
}

module.exports = {
    PROMPT_EXTRACCION,
    configuracion,
    estaConfigurada,
    analizarComprobante,
    analizarImagen,
    analizarTexto,
    analizarPdf,
    reconocerTextoPdf,
    extraerTextoPdf,
    tieneTextoUtil,
    normalizarDatos,
    normalizarMonto,
    normalizarFecha,
    normalizarHora,
    normalizarBanco,
    validarDatos,
    parsearJson
};
