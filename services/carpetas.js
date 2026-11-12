const { normalizarNombreGrupo } = require('./filtroGrupos');
const { MAX_CARPETA_BASE } = require('../utils/validators');

function sufijoGrupo(groupId) {
    const digitos = String(groupId || '').replace(/\D/g, '');
    return digitos.slice(-6) || '000000';
}

function recortarBase(base, sufijo) {
    const maxBase = Math.max(1, MAX_CARPETA_BASE - Array.from(sufijo).length);
    const recortado = Array.from(base)
        .slice(0, maxBase)
        .join('')
        .trim()
        .replace(/[. ]+$/g, '');
    return `${recortado || base}${sufijo}`;
}

function resolverCarpetaChat({ groupId, groupName, remitente, from, gruposPorId } = {}) {
    if (!groupId) {
        const nombre = String(remitente || '').trim();
        const numero = String(from || '').split('@')[0];
        const base = nombre || numero || 'Sin nombre';

        if (gruposPorId) {
            const normalizado = normalizarNombreGrupo(base);
            const colisiona = [...gruposPorId.values()].some(chat =>
                normalizarNombreGrupo(chat?.name || chat?.formattedTitle) === normalizado
            );
            if (colisiona && numero) {
                return recortarBase(base, ` (${numero.slice(-4)})`);
            }
        }

        return base;
    }

    const nombreGrupo = String(groupName || '').trim();
    const base = nombreGrupo || String(groupId || '').trim();
    if (!nombreGrupo || !gruposPorId) return base;

    const normalizado = normalizarNombreGrupo(nombreGrupo);
    if (!normalizado) return base;

    const ids = [...gruposPorId.entries()]
        .filter(([, chat]) => normalizarNombreGrupo(chat?.name || chat?.formattedTitle) === normalizado)
        .map(([id]) => id);

    if (ids.length <= 1) return base;

    return recortarBase(base, ` (${sufijoGrupo(groupId)})`);
}

module.exports = {
    sufijoGrupo,
    resolverCarpetaChat
};
