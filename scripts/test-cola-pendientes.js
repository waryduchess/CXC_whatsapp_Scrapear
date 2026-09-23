const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const fs = require('fs');

const { ColaPendientes } = require('../services/colaPendientes');
const { guardarComprobante, COMPROBANTES_DIR } = require('../mediaHandler');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock de preparación rápido para pruebas deterministas sin consumir tokens ni depender de red externa
async function mockPrepararComprobante(media) {
    await sleep(20); // Simular procesamiento asíncrono
    return {
        bufferPdf: Buffer.from('%PDF-1.4 mock content'),
        datos: {
            banco_origen: 'BBVA',
            monto: 1500,
            fecha: '2026-09-23'
        },
        tipoError: null,
        rutaUsada: 'pdf-texto'
    };
}

async function runTests() {
    console.log('='.repeat(70));
    console.log(' PRUEBAS DE COLA DE PENDIENTES (ESPERA DE TEXTO POSTERIOR)');
    console.log('='.repeat(70));

    const mockMedia = {
        mimetype: 'application/pdf',
        data: Buffer.from('mock pdf data').toString('base64')
    };

    let exitos = 0;
    let total = 0;

    function assert(cond, msg) {
        total++;
        if (cond) {
            console.log(`  ✅ PASS: ${msg}`);
            exitos++;
        } else {
            console.error(`  ❌ FAIL: ${msg}`);
        }
    }

    // --- TEST 1: Registro y resolución con texto posterior ---
    console.log('\n--- CASO 1: Comprobante sin caption resuelto por mensaje de texto posterior ---');
    {
        const cola = new ColaPendientes(1500, mockPrepararComprobante, guardarComprobante);
        const remitente = '5215500000001@c.us';

        cola.registrar(remitente, mockMedia);
        assert(cola.tienePendientes(remitente), 'El remitente figura en la lista de pendientes');
        assert(cola.cantidadPendientes(remitente) === 1, 'Tiene exactamente 1 comprobante pendiente');

        // Simular que 100ms después llega el texto con el nombre
        await sleep(100);
        const resultados = await cola.resolver(remitente, 'Test Cliente Rapido');

        assert(!cola.tienePendientes(remitente), 'La cola queda limpia después de resolver');
        assert(resultados.length === 1, 'Se procesó 1 resultado');
        assert(resultados[0].nombreArchivo.includes('Test Cliente Rapido'), `El archivo tiene el nombre asignado: ${resultados[0].nombreArchivo}`);
        assert(fs.existsSync(resultados[0].ruta), 'El archivo físico fue guardado');

        // Limpieza del archivo generado para la prueba
        if (fs.existsSync(resultados[0].ruta)) fs.unlinkSync(resultados[0].ruta);
        cola.destruir();
    }

    // --- TEST 2: Vencimiento de timeout sin texto posterior ---
    console.log('\n--- CASO 2: Comprobante sin caption cuyo timeout expira sin recibir texto ---');
    {
        const cola = new ColaPendientes(200, mockPrepararComprobante, guardarComprobante); // 200ms timeout
        const remitente = '5215500000002@c.us';

        let callbackLlamado = false;
        let resultadoTimeout = null;

        cola.setOnTimeoutGuardado((res, rem) => {
            callbackLlamado = true;
            resultadoTimeout = res;
        });

        cola.registrar(remitente, mockMedia);
        assert(cola.tienePendientes(remitente), 'El remitente está pendiente');

        // Esperar a que venza el timeout (350ms)
        await sleep(350);

        assert(!cola.tienePendientes(remitente), 'El remitente ya no está en pendientes tras timeout');
        assert(callbackLlamado, 'El callback onTimeoutGuardado fue ejecutado');
        assert(resultadoTimeout && resultadoTimeout.length === 1, 'Se guardó 1 comprobante por timeout');
        assert(resultadoTimeout[0].nombreArchivo.startsWith('comprobante_'), `Tiene nombre con timestamp: ${resultadoTimeout[0].nombreArchivo}`);
        assert(fs.existsSync(resultadoTimeout[0].ruta), 'El archivo físico con timestamp fue creado');

        // Limpieza
        if (resultadoTimeout && fs.existsSync(resultadoTimeout[0].ruta)) {
            fs.unlinkSync(resultadoTimeout[0].ruta);
        }
        cola.destruir();
    }

    // --- TEST 3: Múltiples comprobantes seguidos resueltos con un solo texto ---
    console.log('\n--- CASO 3: Múltiples comprobantes seguidos resueltos con un solo texto (nombres únicos) ---');
    {
        const cola = new ColaPendientes(1500, mockPrepararComprobante, guardarComprobante);
        const remitente = '5215500000003@c.us';

        // Envía 2 comprobantes seguidos sin caption
        cola.registrar(remitente, mockMedia);
        cola.registrar(remitente, mockMedia);

        assert(cola.cantidadPendientes(remitente) === 2, 'Tiene 2 comprobantes en cola');

        await sleep(50);
        const resultados = await cola.resolver(remitente, 'Cliente Multiple');

        assert(resultados.length === 2, 'Se resolvieron 2 comprobantes');
        assert(resultados[0].nombreArchivo !== resultados[1].nombreArchivo, `Los nombres son únicos y no colisionan: [${resultados[0].nombreArchivo}, ${resultados[1].nombreArchivo}]`);
        assert(fs.existsSync(resultados[0].ruta), 'Archivo 1 existe');
        assert(fs.existsSync(resultados[1].ruta), 'Archivo 2 existe');

        // Limpieza
        for (const r of resultados) {
            if (fs.existsSync(r.ruta)) fs.unlinkSync(r.ruta);
        }
        cola.destruir();
    }

    console.log('\n' + '='.repeat(70));
    console.log(` RESULTADOS: ${exitos}/${total} pruebas superadas con éxito`);
    console.log('='.repeat(70));

    if (exitos === total) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Error durante la ejecución de las pruebas:', err);
    process.exit(1);
});
