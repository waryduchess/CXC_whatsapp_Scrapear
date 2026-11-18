#!/usr/bin/env node
/**
 * migrar-comprobantes.js
 * Mueve los comprobantes de la estructura vieja YYYY-MM-DD a Año/MM.-MES/DD MES.
 *
 * Por defecto solo simula. Para mover de verdad:
 *   node scripts/migrar-comprobantes.js --aplicar
 *
 * Opciones:
 *   --aplicar         Ejecuta la migración (sin esto solo muestra el plan).
 *   --fecha FECHA     Migra solo una fecha YYYY-MM-DD.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const datosComprobantes = require('../services/datosComprobantes');
const { resolverComprobantesDir } = require('../services/rutas');
const { rutaFecha } = require('../utils/fechas');

const COMPROBANTES_DIR = resolverComprobantesDir();
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function leerArgumentos(argv) {
    const opciones = { aplicar: false, fecha: null, ayuda: false };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--aplicar') opciones.aplicar = true;
        else if (arg === '--fecha') opciones.fecha = argv[++i] || null;
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

function aRelativa(ruta) {
    return ruta.split(path.sep).join('/');
}

function listarArchivosRecursivo(directorio) {
    const archivos = [];

    let entradas;
    try {
        entradas = fs.readdirSync(directorio, { withFileTypes: true });
    } catch (error) {
        return archivos;
    }

    for (const entrada of entradas) {
        const ruta = path.join(directorio, entrada.name);
        if (entrada.isDirectory()) {
            archivos.push(...listarArchivosRecursivo(ruta));
        } else if (entrada.isFile()) {
            archivos.push(ruta);
        }
    }

    return archivos;
}

function moverArchivo(origen, destino) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    try {
        fs.renameSync(origen, destino);
    } catch (error) {
        if (error.code !== 'EXDEV') throw error;
        fs.copyFileSync(origen, destino);
        fs.unlinkSync(origen);
    }
}

function borrarCarpetasVacias(directorio, raiz) {
    let entradas;
    try {
        entradas = fs.readdirSync(directorio, { withFileTypes: true });
    } catch (error) {
        return;
    }

    for (const entrada of entradas) {
        if (entrada.isDirectory()) {
            borrarCarpetasVacias(path.join(directorio, entrada.name), raiz);
        }
    }

    if (directorio === raiz) return;

    try {
        if (fs.readdirSync(directorio).length === 0) {
            fs.rmdirSync(directorio);
        }
    } catch (error) {
        // La carpeta no está vacía o no se puede borrar: se deja.
    }
}

function main() {
    const opciones = leerArgumentos(process.argv.slice(2));

    if (opciones.ayuda) {
        console.log(`Uso: node scripts/migrar-comprobantes.js [opciones]

  --aplicar       Mueve los archivos (sin esto solo simula)
  --fecha FECHA   Migra solo una fecha YYYY-MM-DD`);
        return;
    }

    let fechas;
    try {
        fechas = fs.readdirSync(COMPROBANTES_DIR, { withFileTypes: true })
            .filter(entrada => entrada.isDirectory() && RE_FECHA.test(entrada.name))
            .map(entrada => entrada.name)
            .filter(fecha => !opciones.fecha || fecha === opciones.fecha)
            .sort();
    } catch (error) {
        console.error('No se pudo leer la carpeta de comprobantes:', error.message || error);
        process.exit(1);
    }

    if (fechas.length === 0) {
        console.log('No hay carpetas con la estructura vieja YYYY-MM-DD.');
        return;
    }

    let movidos = 0;
    let existentes = 0;
    let errores = 0;
    let registrosActualizados = 0;

    for (const fecha of fechas) {
        const carpetaFecha = path.join(COMPROBANTES_DIR, fecha);
        const archivos = listarArchivosRecursivo(carpetaFecha);
        console.log(`\n${fecha}: ${archivos.length} archivo(s) → ${rutaFecha(fecha)}`);

        for (const origen of archivos) {
            const relativa = aRelativa(path.relative(carpetaFecha, origen));
            const destino = path.join(COMPROBANTES_DIR, rutaFecha(fecha), relativa);
            const rutaAnterior = `${fecha}/${relativa}`;
            const rutaNueva = `${aRelativa(rutaFecha(fecha))}/${relativa}`;

            if (fs.existsSync(destino)) {
                const tamanoOrigen = fs.statSync(origen).size;
                const tamanoDestino = fs.statSync(destino).size;
                if (tamanoOrigen === tamanoDestino) {
                    existentes++;
                    console.log(`  = ya existe: ${rutaNueva}`);
                } else {
                    errores++;
                    console.warn(`  ! conflicto (distinto tamaño): ${rutaNueva}`);
                }
                continue;
            }

            if (!opciones.aplicar) {
                movidos++;
                console.log(`  → ${rutaAnterior}  ⇒  ${rutaNueva}`);
                continue;
            }

            try {
                moverArchivo(origen, destino);
                movidos++;
                const actualizado = datosComprobantes.renombrarRegistro(rutaAnterior, rutaNueva);
                if (actualizado) registrosActualizados++;
                console.log(`  ✓ ${rutaNueva}`);
            } catch (error) {
                errores++;
                console.error(`  ! error con ${rutaAnterior}: ${error.message || error}`);
            }
        }

        if (opciones.aplicar) {
            borrarCarpetasVacias(carpetaFecha, COMPROBANTES_DIR);
        }
    }

    console.log('\nResumen:');
    console.log(`  Archivos ${opciones.aplicar ? 'movidos' : 'por mover'}: ${movidos}`);
    console.log(`  Ya existentes: ${existentes}`);
    console.log(`  Errores: ${errores}`);
    if (opciones.aplicar) {
        console.log(`  Registros de IA actualizados: ${registrosActualizados}`);
    } else {
        console.log('\nSimulación. Ejecuta con --aplicar para mover los archivos.');
    }
}

main();
