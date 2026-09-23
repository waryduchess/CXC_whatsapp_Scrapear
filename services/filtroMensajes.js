/**
 * filtroMensajes.js
 * Módulo de filtrado de números de teléfono y grupos de WhatsApp.
 * Permite controlar qué remitentes o grupos tienen permitido enviar comprobantes.
 * 
 * Se evalúa al inicio del flujo de mensajes en index.js.
 */

const { FiltroGrupos } = require('./filtroGrupos');
const { FiltroNumeros } = require('./filtroNumeros');

class FiltroMensajes {
    /**
     * @param {Object} config - Opciones iniciales de configuración
     * @param {'todos'|'whitelist'|'blacklist'|'solo_privados'|'solo_grupos'} [config.modo='todos'] - Modo de filtrado
     * @param {string[]} [config.numerosPermitidos=[]] - Números autorizados (whitelist)
     * @param {string[]} [config.numerosBloqueados=[]] - Números bloqueados (blacklist)
     * @param {string[]} [config.gruposPermitidos=[]] - IDs o nombres exactos de grupos autorizados
     * @param {string[]} [config.gruposBloqueados=[]] - IDs o nombres exactos de grupos bloqueados
     * @param {boolean} [config.permitirGrupos=true] - Si false, descarta cualquier grupo
     * @param {boolean} [config.permitirPrivados=true] - Si false, descarta chats individuales
     */
    constructor(config = {}) {
        this.modo = config.modo || 'todos';

        this.filtroNumeros = new FiltroNumeros(
            config.numerosPermitidos || [],
            config.numerosBloqueados || []
        );

        this.filtroGrupos = new FiltroGrupos(
            config.gruposPermitidos || [],
            config.gruposBloqueados || []
        );

        this.permitirGrupos = config.permitirGrupos !== false;
        this.permitirPrivados = config.permitirPrivados !== false;
    }

    /**
     * Normaliza un número telefónico quitando caracteres especiales, espacios y prefijos.
     * Ejemplo: "+52 1 999 123-4567" -> "529991234567"
     * 
     * @param {string} raw - Número o WID (ej: '5219991234567@c.us')
     * @returns {string} Solo dígitos normalizados
     */
    normalizarNumero(raw) {
        return this.filtroNumeros.normalizar(raw);
    }

    /**
     * Identifica si un chat ID corresponde a un grupo de WhatsApp.
     * @param {string} chatId - ID del chat (ej: '120363...@g.us')
     * @returns {boolean}
     */
    esGrupo(chatId) {
        return this.filtroGrupos.esGrupo(chatId);
    }

    /**
     * Evalúa si un mensaje de WhatsApp debe ser procesado según las reglas configuradas.
     * 
     * @param {Object} msg - Objeto mensaje de whatsapp-web.js
     * @param {string} msg.from - Chat ID de origen
     * @param {string} [msg.author] - Remitente específico dentro de un grupo
     * @returns {{ permitido: boolean, razon: string }}
     */
    evaluarMensaje(msg) {
        if (!msg) {
            return { permitido: false, razon: 'Mensaje nulo o no definido' };
        }

        const chatId = msg.groupId || msg.from;
        const esGrupo = this.esGrupo(chatId);
        const nombreGrupo = msg.groupName;

        // Remitente real: en grupos es msg.author, en chats individuales es msg.from
        const remitenteId = esGrupo ? (msg.author || msg.from) : msg.from;
        const numeroRemitente = this.normalizarNumero(remitenteId);

        // ── 1. Filtros estructurales (tipo de chat) ──
        if (esGrupo && !this.permitirGrupos) {
            return { permitido: false, razon: `Grupos desactivados globalmente (${chatId})` };
        }

        if (!esGrupo && !this.permitirPrivados) {
            return { permitido: false, razon: `Chats privados desactivados globalmente (${chatId})` };
        }

        // ── 2. Filtro de Grupo específico ──
        if (esGrupo) {
            if (this.filtroGrupos.bloqueado(chatId, nombreGrupo)) {
                return { permitido: false, razon: `Grupo en lista negra (${chatId})` };
            }
            if (this.modo === 'whitelist' &&
                (this.filtroGrupos.gruposPermitidos.size > 0) &&
                !this.filtroGrupos.permitido(chatId, nombreGrupo)) {
                return { permitido: false, razon: `Grupo no está en lista blanca (${chatId})` };
            }
        }

        // ── 3. Filtro por Remitente / Número ──
        if (this.filtroNumeros.estaBloqueado(numeroRemitente)) {
            return { permitido: false, razon: `Número en lista negra (${numeroRemitente})` };
        }

        // ── 4. Evaluación según el Modo principal ──
        switch (this.modo) {
            case 'todos':
                return { permitido: true, razon: 'Modo todos activo' };

            case 'solo_privados':
                if (esGrupo) {
                    return { permitido: false, razon: 'Modo solo privados (se descartan grupos)' };
                }
                return { permitido: true, razon: 'Mensaje privado permitido' };

            case 'solo_grupos':
                if (!esGrupo) {
                    return { permitido: false, razon: 'Modo solo grupos (se descartan privados)' };
                }
                return { permitido: true, razon: 'Mensaje de grupo permitido' };

            case 'blacklist':
                // Si no fue bloqueado antes, está permitido
                return { permitido: true, razon: 'No figura en lista negra' };

            case 'whitelist':
                // En modo whitelist, debe estar explícitamente en numerosPermitidos o gruposPermitidos
                const estaEnNumeros = this.filtroNumeros.estaPermitido(numeroRemitente);
                const estaEnGrupos = esGrupo && this.filtroGrupos.permitido(chatId, nombreGrupo);

                if (estaEnNumeros || estaEnGrupos) {
                    return { permitido: true, razon: 'Autorizado por lista blanca' };
                }
                return { permitido: false, razon: `Remitente (${numeroRemitente || remitenteId}) no autorizado en lista blanca` };

            default:
                return { permitido: true, razon: 'Modo por defecto permitido' };
        }
    }

    // ── Métodos para manipulación dinámica en tiempo de ejecución ──

    agregarNumeroPermitido(numero) {
        this.filtroNumeros.agregarPermitido(numero);
    }

    quitarNumeroPermitido(numero) {
        this.filtroNumeros.quitarPermitido(numero);
    }

    agregarNumeroBloqueado(numero) {
        this.filtroNumeros.agregarBloqueado(numero);
    }

    quitarNumeroBloqueado(numero) {
        this.filtroNumeros.quitarBloqueado(numero);
    }

    agregarGrupoPermitido(grupoId) {
        this.filtroGrupos.agregarPermitido(grupoId);
    }

    agregarGrupoBloqueado(grupoId) {
        this.filtroGrupos.agregarBloqueado(grupoId);
    }

    registrarNombreGrupo(chatId, nombre) {
        this.filtroGrupos.registrarNombre(chatId, nombre);
    }

    setModo(nuevoModo) {
        const modosValidos = ['todos', 'whitelist', 'blacklist', 'solo_privados', 'solo_grupos'];
        if (modosValidos.includes(nuevoModo)) {
            this.modo = nuevoModo;
        }
    }
}

// Exportar la clase y una instancia por defecto
const filtroMensajes = new FiltroMensajes();

module.exports = {
    filtroMensajes,
    FiltroMensajes
};
