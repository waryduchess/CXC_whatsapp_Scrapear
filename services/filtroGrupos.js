/**
 * filtroGrupos.js
 * Resolución y validación de grupos de WhatsApp.
 *
 * Acepta IDs @g.us o nombres visibles configurados en las listas.
 */

class FiltroGrupos {
    constructor(gruposPermitidos = [], gruposBloqueados = []) {
        this.gruposPermitidos = new Set(gruposPermitidos);
        this.gruposBloqueados = new Set(gruposBloqueados);
        this.nombresGruposAmbiguos = new Set();
        this.gruposPorNombre = new Map();
    }

    esGrupo(chatId) {
        return Boolean(chatId && chatId.endsWith('@g.us'));
    }

    normalizarNombre(nombre) {
        if (typeof nombre !== 'string') return '';

        return nombre
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim()
            .toLocaleLowerCase('es-MX')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    registrarNombre(chatId, nombre) {
        const nombreNormalizado = this.normalizarNombre(nombre);
        if (!this.esGrupo(chatId) || !nombreNormalizado) return;

        const ids = this.gruposPorNombre.get(nombreNormalizado) || new Set();
        ids.add(chatId);
        this.gruposPorNombre.set(nombreNormalizado, ids);

        if (ids.size > 1) {
            this.nombresGruposAmbiguos.add(nombreNormalizado);
            console.warn(`[filtroGrupos] El nombre "${nombre}" es ambiguo; usa el ID @g.us.`);
        }
    }

    estaEnLista(lista, chatId, nombreGrupo) {
        if (lista.has(chatId)) return true;

        const nombreNormalizado = this.normalizarNombre(nombreGrupo);
        if (!nombreNormalizado || this.nombresGruposAmbiguos.has(nombreNormalizado)) {
            return false;
        }

        return [...lista].some(valor =>
            !valor.endsWith('@g.us') &&
            this.normalizarNombre(valor) === nombreNormalizado
        );
    }

    permitido(chatId, nombreGrupo) {
        return this.estaEnLista(this.gruposPermitidos, chatId, nombreGrupo);
    }

    bloqueado(chatId, nombreGrupo) {
        return this.estaEnLista(this.gruposBloqueados, chatId, nombreGrupo);
    }

    agregarPermitido(grupo) {
        if (grupo) this.gruposPermitidos.add(grupo.trim());
    }

    agregarBloqueado(grupo) {
        if (grupo) this.gruposBloqueados.add(grupo.trim());
    }
}

async function obtenerGruposBasicos(client) {
    if (!client?.pupPage) return [];

    return client.pupPage.evaluate(() => {
        const chats = window.require('WAWebCollections').Chat.getModelsArray();
        return chats
            .map(chat => ({
                id: chat?.id?._serialized || chat?.id?.$1,
                name: chat?.formattedTitle || chat?.name || '',
                isGroup: Boolean(chat?.groupMetadata)
            }))
            .filter(chat => chat.isGroup && typeof chat.id === 'string');
    });
}

async function resolverNombreGrupo(msg) {
    const posiblesIds = [
        msg?.from,
        msg?.id?.remote?._serialized || msg?.id?.remote,
        msg?._data?.id?.remote?._serialized || msg?._data?.id?.remote,
        msg?._data?.from?._serialized || msg?._data?.from
    ].filter(id => typeof id === 'string');
    const grupoId = posiblesIds.find(id => id.endsWith('@g.us'));

    if (!grupoId) return msg;

    try {
        let chat = msg.client?.__gruposPorId?.get(grupoId);
        if (msg.from === grupoId && typeof msg.getChat === 'function') {
            chat = chat || await msg.getChat();
        } else if (typeof msg.client?.getChatById === 'function') {
            try {
                chat = chat || await msg.client.getChatById(grupoId);
            } catch (error) {
                // Algunas versiones de WhatsApp Web fallan con grupos cuando
                // el mensaje original llega con un identificador @lid. La
                // lista de chats suele conservar el ID y el nombre correctos.
                let chats;
                try {
                    chats = typeof msg.client.getChats === 'function'
                        ? await msg.client.getChats()
                        : await obtenerGruposBasicos(msg.client);
                } catch (getChatsError) {
                    chats = await obtenerGruposBasicos(msg.client);
                }
                chat = chats.find(item => {
                    const id = item?.id?._serialized || item?.id?.$1 ||
                        item?.id?.toString?.() || item?.id;
                    return id === grupoId;
                });
            }
        }
        if (!chat?.name) {
            console.warn(`[filtroGrupos] No se encontró nombre para ${grupoId}; usa el ID o revisa los grupos cargados.`);
        } else {
            console.log(`[filtroGrupos] Grupo detectado: ${grupoId} → "${chat.name}"`);
        }
        return { ...msg, groupId: grupoId, groupName: chat?.name };
    } catch (error) {
        console.warn(`[filtroGrupos] No se pudo resolver el grupo ${grupoId}:`, error.message || error);
        // El ID sigue siendo confiable aunque WhatsApp no entregue el nombre.
        return { ...msg, groupId: grupoId };
    }
}

module.exports = {
    FiltroGrupos,
    obtenerGruposBasicos,
    resolverNombreGrupo
};
