/**
 * probar-archivos.js
 * Script para probar el flujo completo con los archivos reales sin levantar WhatsApp.
 *
 * Uso:
 *   node scripts/probar-archivos.js                      # Escanea imagenes_recibidas/
 *   node scripts/probar-archivos.js <ruta> <cliente>     # Un archivo específico
 *   node scripts/probar-archivos.js <ruta> <cliente> <mimetype>
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { procesarMedia } = require('../mediaHandler');

function inferirMimetype(archivo) {
    const ext = path.extname(archivo).toLowerCase();
    switch (ext) {
        case '.pdf':
            return 'application/pdf';
        case '.jpg':
        case '.jpeg':
            return 'image/jpeg';
        case '.png':
            return 'image/png';
        case '.webp':
            return 'image/webp';
        default:
            return null;
    }
}

async function procesarCaso(descripcion, archivo, mimetype, cliente) {
    const rutaArchivo = path.resolve(archivo);

    console.log(`\n>>> ${descripcion}`);
    console.log(`    Archivo: ${rutaArchivo}`);

    if (!fs.existsSync(rutaArchivo)) {
        console.error(`    [ERROR] No existe el archivo en: ${rutaArchivo}`);
        return;
    }

    if (!mimetype) {
        mimetype = inferirMimetype(rutaArchivo);
    }
    if (!mimetype) {
        console.error(`    [ERROR] No se pudo inferir el mimetype. Pásalo como tercer argumento.`);
        return;
    }

    const buffer = fs.readFileSync(rutaArchivo);
    const mediaSimulada = {
        mimetype,
        data: buffer.toString('base64')
    };

    const inicio = Date.now();
    const resultado = await procesarMedia(mediaSimulada, cliente);
    const duracion = ((Date.now() - inicio) / 1000).toFixed(2);

    console.log(`    Resultado:`);
    console.log(`      - Éxito: ${resultado.exito ? 'SÍ' : 'NO'}`);
    console.log(`      - Ruta usada: ${resultado.rutaUsada}`);
    console.log(`      - Archivo generado: ${resultado.nombreArchivo}`);
    console.log(`      - Tiempo: ${duracion}s`);
    console.log(`      - Datos extraídos:`);
    console.dir(resultado.datos, { depth: null, colors: true });
}

async function ejecutarPruebas() {
    console.log('='.repeat(70));
    console.log(' INICIANDO PRUEBAS DE EXTRACCIÓN Y PROCESAMIENTO');
    console.log('='.repeat(70));

    const args = process.argv.slice(2);
    const casos = [];

    if (args.length >= 1) {
        // Caso por línea de comandos: <ruta> [cliente] [mimetype]
        const [archivo, cliente = 'Cliente CLI', mimetype] = args;
        const descripcion = `CASO CLI: ${path.basename(archivo)}`;
        await procesarCaso(descripcion, archivo, mimetype, cliente);
    } else {
        // Escanear imagenes_recibidas/ y procesar lo que exista
        const dir = path.join(__dirname, '..', 'imagenes_recibidas');
        if (!fs.existsSync(dir)) {
            console.error(`No existe la carpeta de pruebas: ${dir}`);
            process.exit(1);
        }

        const archivos = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
        if (archivos.length === 0) {
            console.error(`La carpeta ${dir} está vacía. Pon un comprobante de prueba ahí o pasa una ruta por CLI.`);
            console.log(`Ejemplo: node scripts/probar-archivos.js /ruta/al/comprobante.pdf "Nombre Cliente"`);
            process.exit(1);
        }

        for (const archivo of archivos) {
            casos.push({
                descripcion: `CASO AUTO: ${archivo}`,
                ruta: path.join(dir, archivo),
                mimetype: inferirMimetype(archivo),
                cliente: path.basename(archivo, path.extname(archivo))
            });
        }

        let i = 0;
        for (const c of casos) {
            i++;
            await procesarCaso(`[${i}/${casos.length}] ${c.descripcion}`, c.ruta, c.mimetype, c.cliente);
        }
    }

    console.log('\n' + '='.repeat(70));
    console.log(' PRUEBAS FINALIZADAS');
    console.log(' Revisa la carpeta "comprobantes/" para ver los PDFs finales generados.');
    console.log('='.repeat(70));
}

ejecutarPruebas().catch(err => {
    console.error('Error fatal durante las pruebas:', err);
});