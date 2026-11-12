const util = require('util');
const { eventos } = require('./estado');

const MAX_LINEAS = 500;
const buffer = [];
let instalado = false;

function formatear(args) {
    return args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        return util.inspect(arg, { depth: 3, colors: false, breakLength: 120 });
    }).join(' ');
}

function instalarLogger() {
    if (instalado) return;
    instalado = true;

    for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
        const original = console[nivel].bind(console);
        console[nivel] = (...args) => {
            original(...args);
            try {
                const hora = new Date().toLocaleString('es-MX', { hour12: false });
                const linea = `[${hora}] [${nivel.toUpperCase()}] ${formatear(args)}`;
                buffer.push(linea);
                if (buffer.length > MAX_LINEAS) buffer.splice(0, buffer.length - MAX_LINEAS);
                eventos.emit('log', linea);
            } catch (error) {
                original('[logger] Error formateando registro:', error);
            }
        };
    }
}

function obtenerLogs() {
    return buffer.slice();
}

module.exports = {
    instalarLogger,
    obtenerLogs
};
