/**
 * test-filtro-mensajes.js
 * Prueba unitaria del módulo de filtrado de números y grupos.
 */

const { FiltroMensajes } = require('../services/filtroMensajes');
const { FiltroNumeros } = require('../services/filtroNumeros');
const { resolverNombreGrupo } = require('../services/filtroGrupos');

function assert(cond, msg) {
    if (cond) {
        console.log(`  ✅ PASS: ${msg}`);
    } else {
        console.error(`  ❌ FAIL: ${msg}`);
        process.exit(1);
    }
}

console.log('='.repeat(70));
console.log(' PRUEBAS DEL MÓDULO DE FILTRO DE NÚMEROS Y GRUPOS');
console.log('='.repeat(70));

// 1. Normalización de números
console.log('\n--- 1. Normalización de Números ---');
{
    const filtro = new FiltroNumeros();
    assert(filtro.normalizar('+52 1 999 123-4567') === '529991234567', 'Normaliza formato internacional con espacios y guiones');
    assert(filtro.normalizar('5219991234567@c.us') === '529991234567', 'Elimina prefijo móvil 1 de México y sufijo @c.us');
    assert(filtro.normalizar('529991234567') === '529991234567', 'Mantiene número ya normalizado');
}

// 2. Modo Whitelist (Lista Blanca)
console.log('\n--- 2. Modo Whitelist ---');
{
    const filtro = new FiltroMensajes({
        modo: 'whitelist',
        numerosPermitidos: ['+52 1 999 111-2233', '529994445566']
    });

    // Mensaje de número autorizado
    const resOk = filtro.evaluarMensaje({ from: '5219991112233@c.us' });
    assert(resOk.permitido === true, 'Permite número que está en la lista blanca');

    // Mensaje de número NO autorizado
    const resNo = filtro.evaluarMensaje({ from: '5219999999999@c.us' });
    assert(resNo.permitido === false, 'Bloquea número que no está en la lista blanca');
}

// 3. Modo Blacklist (Lista Negra)
console.log('\n--- 3. Modo Blacklist ---');
{
    const filtro = new FiltroMensajes({
        modo: 'blacklist',
        numerosBloqueados: ['529998887766']
    });

    const resBloqueado = filtro.evaluarMensaje({ from: '5219998887766@c.us' });
    assert(resBloqueado.permitido === false, 'Bloquea número en lista negra');

    const resPermitido = filtro.evaluarMensaje({ from: '5219991112233@c.us' });
    assert(resPermitido.permitido === true, 'Permite cualquier otro número');
}

// 4. Filtrado de Grupos
console.log('\n--- 4. Filtrado de Grupos ---');
{
    const filtro = new FiltroMensajes({
        permitirGrupos: false
    });

    const resGrupo = filtro.evaluarMensaje({
        from: '120363028123456789@g.us',
        author: '5219991112233@c.us'
    });
    assert(resGrupo.permitido === false, 'Descarta grupos cuando permitirGrupos = false');

    const resPrivado = filtro.evaluarMensaje({ from: '5219991112233@c.us' });
    assert(resPrivado.permitido === true, 'Permite privados cuando permitirGrupos = false');
}

// 5. Grupos autorizados específicos
console.log('\n--- 5. Grupos Autorizados Específicos ---');
{
    const filtro = new FiltroMensajes({
        modo: 'whitelist',
        gruposPermitidos: ['120363000000000001@g.us']
    });

    const grupoValido = filtro.evaluarMensaje({
        from: '120363000000000001@g.us',
        author: '5219990001122@c.us'
    });
    assert(grupoValido.permitido === true, 'Permite grupo en lista blanca');

    const grupoInvalido = filtro.evaluarMensaje({
        from: '120363999999999999@g.us',
        author: '5219990001122@c.us'
    });
    assert(grupoInvalido.permitido === false, 'Bloquea grupo que no está en lista blanca');
}

// 6. Grupos autorizados por nombre visible
console.log('\n--- 6. Grupos Autorizados por Nombre ---');
{
    const filtro = new FiltroMensajes({
        modo: 'whitelist',
        gruposPermitidos: ['Pagos CXC']
    });

    const resultado = filtro.evaluarMensaje({
        from: '120363000000000001@g.us',
        groupName: '  PÁGOS   CXC  '
    });
    assert(resultado.permitido === true, 'Normaliza mayúsculas, espacios repetidos y acentos del nombre');

    filtro.registrarNombreGrupo('120363000000000001@g.us', 'Pagos CXC');
    filtro.registrarNombreGrupo('120363000000000002@g.us', 'Pagos CXC');
    const ambiguo = filtro.evaluarMensaje({
        from: '120363000000000001@g.us',
        groupName: 'Pagos CXC'
    });
    assert(ambiguo.permitido === false, 'Rechaza nombres asociados a múltiples grupos');
}

// 7. Mensaje con remitente LID y grupo remoto
console.log('\n--- 7. Grupo remoto en mensaje con LID ---');
{
    const filtro = new FiltroMensajes({
        modo: 'whitelist',
        gruposPermitidos: ['120363000000000003@g.us']
    });

    const resultado = filtro.evaluarMensaje({
        from: '121521888620552@lid',
        groupId: '120363000000000003@g.us',
        groupName: 'Grupo con LID'
    });
    assert(resultado.permitido === true, 'Evalúa el grupo remoto aunque msg.from sea un LID');
}

// 8. Resuelve el nombre desde la lista de chats cuando getChatById falla
console.log('\n--- 8. Respaldo de nombre mediante getChats ---');
(async () => {
    const mensaje = await resolverNombreGrupo({
        from: '121521888620552@lid',
        id: { remote: '120363000000000004@g.us' },
        client: {
            getChatById: async () => {
                throw new Error('r');
            },
            getChats: async () => [
                {
                    id: { $1: '120363000000000004@g.us' },
                    name: 'HorbisG Isabel&Erik'
                }
            ]
        }
    });
    assert(mensaje.groupId === '120363000000000004@g.us', 'Conserva el ID del grupo');
    assert(mensaje.groupName === 'HorbisG Isabel&Erik', 'Recupera el nombre desde getChats');
    console.log('\n' + '='.repeat(70));
    console.log(' TODAS LAS PRUEBAS DEL FILTRO PASARON SATISFACTORIAMENTE');
    console.log('='.repeat(70));
})().catch(error => {
    console.error('  ❌ FAIL:', error.message || error);
    process.exitCode = 1;
});
