const { EventEmitter } = require('events');
const paquete = require('../package.json');

const eventos = new EventEmitter();
eventos.setMaxListeners(50);

const inicio = Date.now();

const estado = {
    fase: 'iniciando',
    detalle: 'Iniciando servicio...',
    qr: null,
    cuenta: null,
    ultimoError: null,
    inicio,
    actualizado: new Date().toISOString(),
    version: paquete.version,
    pm2: Boolean(process.env.pm_id)
};

function actualizarEstado(cambios = {}) {
    Object.assign(estado, cambios, { actualizado: new Date().toISOString() });
    eventos.emit('estado', { ...estado });
    return { ...estado };
}

function obtenerEstado() {
    return {
        ...estado,
        uptime: Math.floor((Date.now() - inicio) / 1000)
    };
}

module.exports = {
    estado,
    eventos,
    actualizarEstado,
    obtenerEstado
};
