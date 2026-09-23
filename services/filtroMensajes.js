/**
 * filtroMensajes.js
 * Módulo de filtrado de números de teléfono y grupos de WhatsApp.
 * Permite controlar qué remitentes o grupos tienen permitido enviar comprobantes.
 * 
 * NOTA: Diseñado de forma aislada. No está conectado a index.js todavía.
 */

class FiltroMensajes {
    /**
     * @param {Object} config - Opciones iniciales de configuración
     * @param {'todos'|'whitelist'|'blacklist'|'solo_privados'|'solo_grupos'} [config.modo='todos'] - Modo de filtrado
     * @param {string[]} [config.numerosPermitidos=[]] - Números autorizados (whitelist)
     * @param {string[]} [config.numerosBloqueados=[]] - Números bloqueados (blacklist)
     * @param {string[]} [config.gruposPermitidos=[]] - IDs de grupos autorizados
     * @param {string[]} [config.gruposBloqueados=[]] - IDs de grupos bloqueados
     * @param {boolean} [config.permitirGrupos=true] - Si false, descarta cualquier grupo
     * @param {boolean} [config.permitirPrivados=true] - Si false, descarta chats individuales
     */
    constructor(config = {}) {
        this.modo = config.modo || 'todos';

        // Sets para búsquedas O(1) con números normalizados
        this.numerosPermitidos = new Set((config.numerosPermitidos || []).map(n => this.normalizarNumero(n)));
        this.numerosBloqueados = new Set((config.numerosBloqueados || []).map(n => this.normalizarNumero(n)));

        // Sets para IDs de grupos (ej: '120363028123456789@g.us')
        this.gruposPermitidos = new Set(config.gruposPermitidos || []);
        this.gruposBloqueados = new Set(config.gruposBloqueados || []);

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
        if (!raw || typeof raw !== 'string') return '';

        // Extraer la parte antes del @ si viene como WID de WhatsApp (ej: '521999...@c.us')
        const parteNumero = raw.split('@')[0];

        // Remover todo lo que no sea dígito
        let limpio = parteNumero.replace(/\D/g, '');

        // Normalización para números de México: eliminar el '1' móvil internacional (521XXXXXXXXXX -> 52XXXXXXXXXX)
        if (limpio.startsWith('521') && limpio.length === 13) {
            limpio = '52' + limpio.slice(3);
        }

        return limpio;
    }

    /**
     * Identifica si un chat ID corresponde a un grupo de WhatsApp.
     * @param {string} chatId - ID del chat (ej: '120363...@g.us')
     * @returns {boolean}
     */
    esGrupo(chatId) {
        return Boolean(chatId && chatId.endsWith('@g.us'));
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

        const chatId = msg.from;
        const esGrupo = this.esGrupo(chatId);

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
            if (this.gruposBloqueados.has(chatId)) {
                return { permitido: false, razon: `Grupo en lista negra (${chatId})` };
            }
            if (this.modo === 'whitelist' && this.gruposPermitidos.size > 0 && !this.gruposPermitidos.has(chatId)) {
                return { permitido: false, razon: `Grupo no está en lista blanca (${chatId})` };
            }
        }

        // ── 3. Filtro por Remitente / Número ──
        if (numeroRemitente && this.numerosBloqueados.has(numeroRemitente)) {
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
                const estaEnNumeros = numeroRemitente && this.numerosPermitidos.has(numeroRemitente);
                const estaEnGrupos = esGrupo && this.gruposPermitidos.has(chatId);

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
        const norm = this.normalizarNumero(numero);
        if (norm) this.numerosPermitidos.add(norm);
    }

    quitarNumeroPermitido(numero) {
        const norm = this.normalizarNumero(numero);
        if (norm) this.numerosPermitidos.delete(norm);
    }

    agregarNumeroBloqueado(numero) {
        const norm = this.normalizarNumero(numero);
        if (norm) this.numerosBloqueados.add(norm);
    }

    quitarNumeroBloqueado(numero) {
        const norm = this.normalizarNumero(numero);
        if (norm) this.numerosBloqueados.delete(norm);
    }

    agregarGrupoPermitido(grupoId) {
        if (grupoId) this.gruposPermitidos.add(grupoId);
    }

    agregarGrupoBloqueado(grupoId) {
        if (grupoId) this.gruposBloqueados.add(grupoId);
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
