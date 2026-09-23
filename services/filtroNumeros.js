/**
 * filtroNumeros.js
 * Normalización y validación de números de WhatsApp.
 */

class FiltroNumeros {
    constructor(numerosPermitidos = [], numerosBloqueados = []) {
        this.numerosPermitidos = new Set(
            numerosPermitidos.map(numero => this.normalizar(numero)).filter(Boolean)
        );
        this.numerosBloqueados = new Set(
            numerosBloqueados.map(numero => this.normalizar(numero)).filter(Boolean)
        );
    }

    normalizar(raw) {
        if (!raw || typeof raw !== 'string') return '';

        let limpio = raw.split('@')[0].replace(/\D/g, '');
        if (limpio.startsWith('521') && limpio.length === 13) {
            limpio = `52${limpio.slice(3)}`;
        }
        return limpio;
    }

    estaPermitido(numero) {
        return this.numerosPermitidos.has(this.normalizar(numero));
    }

    estaBloqueado(numero) {
        const normalizado = this.normalizar(numero);
        return Boolean(normalizado && this.numerosBloqueados.has(normalizado));
    }

    agregarPermitido(numero) {
        const normalizado = this.normalizar(numero);
        if (normalizado) this.numerosPermitidos.add(normalizado);
    }

    quitarPermitido(numero) {
        const normalizado = this.normalizar(numero);
        if (normalizado) this.numerosPermitidos.delete(normalizado);
    }

    agregarBloqueado(numero) {
        const normalizado = this.normalizar(numero);
        if (normalizado) this.numerosBloqueados.add(normalizado);
    }

    quitarBloqueado(numero) {
        const normalizado = this.normalizar(numero);
        if (normalizado) this.numerosBloqueados.delete(normalizado);
    }
}

module.exports = {
    FiltroNumeros
};
