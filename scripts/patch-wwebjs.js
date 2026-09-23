'use strict';

const fs = require('fs');
const path = require('path');

const utilsPath = path.join(
    __dirname,
    '..',
    'node_modules',
    'whatsapp-web.js',
    'src',
    'util',
    'Injected',
    'Utils.js'
);

const MARKER = 'widSerialized';

const helpers = `    window.WWebJS = {};

    /**
     * Dual-compat: WhatsApp Web >= 2.3000.1043xxx expone el WID/MsgKey
     * serializado como \`$1\` en vez de \`_serialized\`. Ver wwebjs PR #201840.
     */
    window.WWebJS.widSerialized = (wid) => {
        if (!wid || typeof wid === 'string') return wid;
        return (
            wid._serialized ??
            wid.$1 ??
            (typeof wid.toString === 'function' ? wid.toString() : undefined)
        );
    };

    /**
     * Espeja \`$1\` sobre \`_serialized\` en los objetos que se devuelven a Node
     * para que el codigo existente siga leyendo \`id._serialized\`.
     */
    window.WWebJS.normalizeSerialized = (obj, depth = 0) => {
        if (!obj || typeof obj !== 'object' || depth > 8) return obj;
        if (Array.isArray(obj)) {
            for (const item of obj) {
                window.WWebJS.normalizeSerialized(item, depth + 1);
            }
            return obj;
        }
        if (obj.$1 !== undefined && obj._serialized === undefined) {
            obj._serialized = obj.$1;
        }
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (value && typeof value === 'object') {
                window.WWebJS.normalizeSerialized(value, depth + 1);
            }
        }
        return obj;
    };
`;

function patchUtils() {
    let src = fs.readFileSync(utilsPath, 'utf8');

    if (src.includes(MARKER)) {
        console.log('[patch-wwebjs] Utils.js ya estaba parcheado');
        return;
    }

    src = src.replace('    window.WWebJS = {};\n', helpers);
    src = src.replace(
        '\n        delete msg.pendingAckUpdate;\n\n        return msg;\n    };',
        '\n        delete msg.pendingAckUpdate;\n\n        return window.WWebJS.normalizeSerialized(msg);\n    };'
    );

    fs.writeFileSync(utilsPath, src);
    console.log('[patch-wwebjs] Utils.js parcheado correctamente');
}

function patchClient() {
    const clientPath = path.join(
        __dirname,
        '..',
        'node_modules',
        'whatsapp-web.js',
        'src',
        'Client.js'
    );

    if (!fs.existsSync(clientPath)) return;

    let src = fs.readFileSync(clientPath, 'utf8');

    if (src.includes('socket.hasSynced')) {
        console.log('[patch-wwebjs] Client.js ya estaba parcheado para hasSynced');
        return;
    }

    const target = `            window
                .require('WAWebSocketModel')
                .Socket.on('change:hasSynced', () => {
                    window.onAppStateHasSyncedEvent();
                });`;

    const replacement = `            const socket = window.require('WAWebSocketModel').Socket;
            if (socket.hasSynced) {
                window.onAppStateHasSyncedEvent();
            }
            socket.on('change:hasSynced', () => {
                window.onAppStateHasSyncedEvent();
            });`;

    if (src.includes(target)) {
        src = src.replace(target, replacement);
        fs.writeFileSync(clientPath, src);
        console.log('[patch-wwebjs] Client.js parcheado correctamente (hasSynced)');
    }
}

patchUtils();
patchClient();
