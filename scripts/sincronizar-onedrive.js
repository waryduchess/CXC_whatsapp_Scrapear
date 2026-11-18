#!/usr/bin/env node
/**
 * scripts/sincronizar-onedrive.js
 * Espeja todos los comprobantes de COMPROBANTES_DIR a ONEDRIVE_DIR.
 *
 * Uso:
 *   node scripts/sincronizar-onedrive.js            # dry-run (solo lista)
 *   node scripts/sincronizar-onedrive.js --aplicar  # copia los archivos
 *
 * PowerShell (prueba):
 *   $env:ONEDRIVE_DIR = "$env:TEMP\onedrive-test"
 *   node scripts/sincronizar-onedrive.js --aplicar
 */

'use strict';

require('dotenv').config();
const { sincronizarTodo } = require('../services/espejo');

const aplicar = process.argv.includes('--aplicar');

(async () => {
    console.log('═'.repeat(60));
    console.log(' SINCRONIZACIÓN ONEDRIVE' + (aplicar ? '' : ' — DRY-RUN'));
    if (!aplicar) {
        console.log(' Pasa --aplicar para copiar los archivos.');
    }
    console.log('═'.repeat(60));

    try {
        const r = await sincronizarTodo({ aplicar });

        console.log('');
        console.log('Resumen:');
        console.log(`  Archivos encontrados : ${r.total}`);
        if (aplicar) {
            console.log(`  Copiados             : ${r.copiados}`);
            console.log(`  Sin cambios (omitidos): ${r.omitidos}`);
            console.log(`  Errores              : ${r.errores}`);
        }

        if (r.total > 0 && !aplicar) {
            console.log('');
            console.log('Archivos que se copiarían:');
            for (const item of r.items) {
                console.log(`  ${item.relativa}`);
            }
        }

        console.log('');
        console.log('═'.repeat(60));
        process.exit(r.errores > 0 ? 1 : 0);
    } catch (err) {
        console.error('Error fatal:', err.message);
        process.exit(1);
    }
})();
