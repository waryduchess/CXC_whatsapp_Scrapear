#!/usr/bin/env node
/**
 * analizar-comprobantes.js
 * Backfill manual: analiza con DeepSeek los comprobantes ya guardados.
 *
 * Uso:
 *   node scripts/analizar-comprobantes.js                 # pendientes y con error
 *   node scripts/analizar-comprobantes.js --todos         # todos, incluso ya analizados
 *   node scripts/analizar-comprobantes.js --forzar        # reanaliza aunque estén en ok
 *   node scripts/analizar-comprobantes.js --fecha 2026-11-12
 *   node scripts/analizar-comprobantes.js --limite 5
 *   node scripts/analizar-comprobantes.js --seco          # solo lista, no analiza
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const iaService = require('../services/iaService');
const datosComprobantes = require('../services/datosComprobantes');

const COMPROBANTES_DIR = path.join(__dirname, '..', 'comprobantes');
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_ARCHIVO = /\.pdf$/i;

function leerArgumentos(argv) {
    const opciones = {
        todos: false,
        forzar: false,
        seco: false,
        fecha: null,
        limite: Infinity
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--todos') opciones.todos = true;
        else if (arg === '--forzar') opciones.forzar = true;
        else if (arg === '--seco') opciones.seco = true;
        else if (arg === '--fecha') opciones.fecha = argv[++i] || null;
        else if (arg === '--limite') opciones.limite = Math.max(1, Number(argv[++i]) || 1);
        else if (arg === '--ayuda' || arg === '-h') opciones.ayuda = true;
        else {
            console.error(`Opción desconocida: ${arg}`);
            process.exit(1);
        }
    }

    if (opciones.fecha && !RE_FECHA.test(opciones.fecha)) {
        console.error('La fecha debe tener formato YYYY-MM-DD');
        process.exit(1);
    }

    return opciones;
}

function listarArchivos(fecha) {
    const carpeta = path.join(COMPROBANTES_DIR, fecha);
    const archivos = [];

    let entradas;
    try {
        entradas = fs.readdirSync(carpeta, { withFileTypes: true });
    } catch (error) {
        return archivos;
    }

    for (const entrada of entradas) {
        if (entrada.isFile() && RE_ARCHIVO.test(entrada.name)) {
            archivos.push({
                rutaRelativa: `${fecha}/${entrada.name}`,
                ruta: path.join(carpeta, entrada.name)
            });
        } else if (entrada.isDirectory()) {
            const subcarpeta = path.join(carpeta, entrada.name);
            let hijos = [];
            try {
                hijos = fs.readdirSync(subcarpeta, { withFileTypes: true });
            } catch (error) {
                continue;
            }
            for (const hijo of hijos) {
                if (!hijo.isFile() || !RE_ARCHIVO.test(hijo.name)) continue;
                archivos.push({
                    rutaRelativa: `${fecha}/${entrada.name}/${hijo.name}`,
                    ruta: path.join(subcarpeta, hijo.name)
                });
            }
        }
    }

    return archivos;
}

function listarTodo(fecha) {
    if (fecha) return listarArchivos(fecha);

    let fechas;
    try {
        fechas = fs.readdirSync(COMPROBANTES_DIR, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory() && RE_FECHA.test(entrada.name))
            .map(entrada => entrada.name)
            .sort();
    } catch (error) {
        console.error('No se pudo leer la carpeta de comprobantes:', error.message);
        return [];
    }

    return fechas.flatMap(listarArchivos);
}

async function analizar({ rutaRelativa, ruta }) {
    const previo = datosComprobantes.obtener(rutaRelativa);
    const buffer = fs.readFileSync(ruta);
    const nombreArchivo = path.basename(ruta);

    const { datos, rutaUsada } = await iaService.analizarComprobante({
        buffer,
        mimetype: 'application/pdf',
        nombreArchivo
    });

    const validacion = iaService.validarDatos(datos);
    const registro = {
        estado: validacion.valido ? 'ok' : 'incompleto',
        datos,
        rutaUsada,
        modelo: iaService.configuracion().modelo,
        analizadoEn: new Date().toISOString(),
        error: validacion.valido ? null : `Sin ${validacion.errores.join(' ni ')}`,
        hash: datosComprobantes.hashBuffer(buffer)
    };

    datosComprobantes.guardarRegistro(rutaRelativa, registro);
    return { registro, previo };
}

async function main() {
    const opciones = leerArgumentos(process.argv.slice(2));

    if (opciones.ayuda) {
        console.log(`Uso: node scripts/analizar-comprobantes.js [opciones]

  --todos           Analiza todos los archivos, no solo pendientes/error
  --forzar          Reanaliza aunque el registro esté en ok
  --fecha FECHA     Solo una carpeta de fecha (YYYY-MM-DD)
  --limite N        Máximo de archivos a procesar
  --seco            Solo muestra qué haría, sin llamar a DeepSeek`);
        return;
    }

    if (!iaService.estaConfigurada()) {
        console.error('Falta DEEPSEEK_API_KEY en .env');
        process.exit(1);
    }

    const archivos = listarTodo(opciones.fecha);
    const pendientes = archivos.filter(archivo => {
        const estado = datosComprobantes.obtener(archivo.rutaRelativa)?.estado;
        if (opciones.forzar) return true;
        if (opciones.todos) return true;
        return estado !== 'ok' && estado !== 'incompleto';
    }).slice(0, opciones.limite);

    console.log(`Comprobantes encontrados: ${archivos.length}`);
    console.log(`Por analizar: ${pendientes.length}`);
    console.log(`Modelo: ${iaService.configuracion().modelo}`);

    if (opciones.seco) {
        for (const archivo of pendientes) console.log(` - ${archivo.rutaRelativa}`);
        return;
    }

    if (pendientes.length === 0) {
        console.log('Nada por hacer.');
        return;
    }

    const inicio = Date.now();
    let ok = 0;
    let incompletos = 0;
    let errores = 0;

    for (let i = 0; i < pendientes.length; i++) {
        const archivo = pendientes[i];
        console.log(`\n[${i + 1}/${pendientes.length}] ${archivo.rutaRelativa}`);
        try {
            const { registro } = await analizar(archivo);
            if (registro.estado === 'ok') {
                ok++;
                const monto = registro.datos?.monto;
                const fecha = registro.datos?.fecha;
                console.log(`  OK · ${monto ?? 'sin monto'} · ${fecha ?? 'sin fecha'}`);
            } else {
                incompletos++;
                console.log(`  Incompleto: ${registro.error}`);
            }
        } catch (error) {
            errores++;
            const previo = datosComprobantes.obtener(archivo.rutaRelativa);
            datosComprobantes.guardarRegistro(archivo.rutaRelativa, {
                estado: 'error',
                datos: previo?.datos || null,
                rutaUsada: previo?.rutaUsada || null,
                modelo: iaService.configuracion().modelo,
                analizadoEn: new Date().toISOString(),
                error: error.message || String(error),
                hash: previo?.hash || null
            });
            console.error(`  Error: ${error.message || error}`);
        }
    }

    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
    console.log(`\nListo en ${segundos} s · ok: ${ok} · incompletos: ${incompletos} · errores: ${errores}`);
}

main().catch(error => {
    console.error('Error general:', error.message || error);
    process.exit(1);
});
