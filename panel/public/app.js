const estadoApp = {
    estado: null,
    fechas: [],
    archivos: [],
    ultimo: null,
    fechasSeleccionadas: new Set(),
    busqueda: '',
    pagina: 1,
    porPagina: 20,
    logs: [],
    busquedaLog: ''
};

const el = {
    badge: document.getElementById('estado-badge'),
    detalle: document.getElementById('estado-detalle'),
    kpiCuenta: document.getElementById('kpi-cuenta'),
    kpiInicio: document.getElementById('kpi-inicio'),
    kpiUptime: document.getElementById('kpi-uptime'),
    kpiUltimo: document.getElementById('kpi-ultimo'),
    qrWrap: document.getElementById('qr-wrap'),
    qrImg: document.getElementById('qr-img'),
    cuentaWrap: document.getElementById('cuenta-wrap'),
    cuentaNombre: document.getElementById('cuenta-nombre'),
    cuentaNumero: document.getElementById('cuenta-numero'),
    cuentaPlataforma: document.getElementById('cuenta-plataforma'),
    errorWrap: document.getElementById('error-wrap'),
    errorTexto: document.getElementById('error-texto'),
    filtros: document.getElementById('filtros'),
    btnReiniciar: document.getElementById('btn-reiniciar'),
    btnAbrirCarpeta: document.getElementById('btn-abrir-carpeta'),
    buscarArchivo: document.getElementById('buscar-archivo'),
    btnFechas: document.getElementById('btn-fechas'),
    menuFechas: document.getElementById('menu-fechas'),
    fechasCount: document.getElementById('fechas-count'),
    filtroFechas: document.getElementById('filtro-fechas'),
    btnLimpiarFiltros: document.getElementById('btn-limpiar-filtros'),
    tablaArchivos: document.getElementById('tabla-archivos'),
    pagPrev: document.getElementById('pag-prev'),
    pagNext: document.getElementById('pag-next'),
    pagInfo: document.getElementById('pag-info'),
    buscarLog: document.getElementById('buscar-log'),
    btnLimpiarLogs: document.getElementById('btn-limpiar-logs'),
    logs: document.getElementById('logs'),
    toast: document.getElementById('toast')
};

let toastTimer = null;

async function fetchJson(url, opciones = {}) {
    const respuesta = await fetch(url, opciones);
    const tipo = respuesta.headers.get('content-type') || '';
    const datos = tipo.includes('application/json') ? await respuesta.json() : null;
    if (!respuesta.ok) {
        throw new Error(datos?.error || `Error ${respuesta.status}`);
    }
    return datos;
}

function normalizar(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function formatearBytes(bytes) {
    if (!Number.isFinite(bytes)) return '-';
    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    let valor = bytes;
    let indice = 0;
    while (valor >= 1024 && indice < unidades.length - 1) {
        valor /= 1024;
        indice++;
    }
    return `${valor.toFixed(indice === 0 ? 0 : 1)} ${unidades[indice]}`;
}

function formatearFechaHora(valor) {
    if (!valor) return '-';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '-';
    return fecha.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function formatearInicio(valor) {
    if (!valor) return '-';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '-';
    return fecha.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatearUptime(segundos) {
    if (!Number.isFinite(segundos) || segundos < 0) return '-';
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const segundosRestantes = Math.floor(segundos % 60);
    if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
    if (horas > 0) return `${horas}h ${minutos}m`;
    if (minutos > 0) return `${minutos}m ${segundosRestantes}s`;
    return `${segundosRestantes}s`;
}

function mostrarToast(mensaje) {
    el.toast.textContent = mensaje;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3500);
}

function setBadge(fase, detalle) {
    const etiquetas = {
        iniciando: 'Iniciando',
        esperando_qr: 'Esperando QR',
        autenticando: 'Autenticando',
        listo: 'Conectado',
        desconectado: 'Desconectado',
        error: 'Error',
        reiniciando: 'Reiniciando'
    };
    const clases = {
        iniciando: 'badge-iniciando',
        esperando_qr: 'badge-esperando',
        autenticando: 'badge-iniciando',
        listo: 'badge-listo',
        desconectado: 'badge-desconectado',
        error: 'badge-error',
        reiniciando: 'badge-reiniciando'
    };
    el.badge.textContent = etiquetas[fase] || fase || 'Desconocido';
    el.badge.className = `badge ${clases[fase] || 'badge-iniciando'}`;
    el.detalle.textContent = detalle || '';
}

function crearFiltro(etiqueta, valor) {
    const contenedor = document.createElement('div');
    contenedor.className = 'filtro-item';
    const nombre = document.createElement('span');
    nombre.textContent = etiqueta;
    const contenido = document.createElement('strong');
    contenido.textContent = valor;
    contenedor.append(nombre, contenido);
    return contenedor;
}

function renderFiltros(filtros) {
    el.filtros.replaceChildren();
    if (!filtros) {
        el.filtros.append(crearFiltro('Filtros', 'No disponible'));
        return;
    }

    const listas = [
        ['Modo', filtros.modo],
        ['Números permitidos', filtros.numerosPermitidos],
        ['Números bloqueados', filtros.numerosBloqueados],
        ['Grupos permitidos', filtros.gruposPermitidos],
        ['Grupos bloqueados', filtros.gruposBloqueados]
    ];

    for (const [etiqueta, valor] of listas) {
        const texto = Array.isArray(valor)
            ? (valor.length ? valor.join(', ') : 'Ninguno')
            : (valor || 'Ninguno');
        el.filtros.append(crearFiltro(etiqueta, texto));
    }
}

function aplicarEstado(datos) {
    estadoApp.estado = datos;
    setBadge(datos.fase, datos.detalle);

    const cuenta = datos.cuenta;
    if (cuenta) {
        const nombre = cuenta.nombre || 'Cuenta conectada';
        const numero = cuenta.numero ? `+${cuenta.numero}` : '';
        el.kpiCuenta.textContent = numero ? `${nombre} (${numero})` : nombre;
        el.kpiCuenta.title = el.kpiCuenta.textContent;
        el.cuentaNombre.textContent = nombre;
        el.cuentaNumero.textContent = numero || 'Número no disponible';
        el.cuentaPlataforma.textContent = cuenta.plataforma ? `Plataforma: ${cuenta.plataforma}` : '';
    } else {
        el.kpiCuenta.textContent = '-';
        el.kpiCuenta.title = '';
    }

    el.kpiInicio.textContent = formatearInicio(datos.inicio);
    el.kpiUptime.textContent = formatearUptime(datos.uptime);
    renderFiltros(datos.filtros);

    el.btnReiniciar.disabled = !datos.pm2;
    el.btnReiniciar.title = datos.pm2 ? '' : 'Disponible cuando el servicio corre con PM2';

    const mostrarQr = datos.fase === 'esperando_qr' && datos.qr;
    el.qrWrap.classList.toggle('hidden', !mostrarQr);
    if (mostrarQr) {
        el.qrImg.src = datos.qr;
    }

    const mostrarCuenta = datos.fase === 'listo' && cuenta;
    el.cuentaWrap.classList.toggle('hidden', !mostrarCuenta);

    const mostrarError = datos.fase === 'error' || datos.fase === 'desconectado';
    el.errorWrap.classList.toggle('hidden', !mostrarError);
    if (mostrarError) {
        el.errorTexto.textContent = datos.ultimoError || datos.detalle || 'Ocurrió un error.';
    }
}

async function cargarEstado() {
    const datos = await fetchJson('/api/estado');
    aplicarEstado(datos);
}

function actualizarUltimo(ultimo) {
    estadoApp.ultimo = ultimo;
    if (ultimo) {
        el.kpiUltimo.textContent = `${ultimo.nombre} (${ultimo.fecha})`;
        el.kpiUltimo.title = ultimo.nombre;
    } else {
        el.kpiUltimo.textContent = '-';
        el.kpiUltimo.title = '';
    }
}

function actualizarContadorFechas() {
    const total = estadoApp.fechasSeleccionadas.size;
    el.fechasCount.textContent = total === 0 ? 'Todas' : String(total);
}

function renderMenuFechas() {
    el.menuFechas.replaceChildren();

    if (estadoApp.fechas.length === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'muted';
        vacio.textContent = 'Sin fechas disponibles';
        el.menuFechas.append(vacio);
        actualizarContadorFechas();
        return;
    }

    for (const fecha of estadoApp.fechas) {
        const cantidad = estadoApp.archivos.filter(archivo => archivo.fecha === fecha).length;
        const etiqueta = document.createElement('label');
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = fecha;
        casilla.checked = estadoApp.fechasSeleccionadas.has(fecha);
        casilla.addEventListener('change', () => {
            if (casilla.checked) estadoApp.fechasSeleccionadas.add(fecha);
            else estadoApp.fechasSeleccionadas.delete(fecha);
            estadoApp.pagina = 1;
            actualizarContadorFechas();
            renderArchivos();
        });

        const texto = document.createElement('span');
        texto.textContent = fecha;
        const conteo = document.createElement('span');
        conteo.className = 'muted';
        conteo.textContent = `${cantidad}`;

        etiqueta.append(casilla, texto, conteo);
        el.menuFechas.append(etiqueta);
    }

    actualizarContadorFechas();
}

function archivosFiltrados() {
    const busqueda = normalizar(estadoApp.busqueda);
    return estadoApp.archivos.filter(archivo => {
        if (estadoApp.fechasSeleccionadas.size > 0 &&
            !estadoApp.fechasSeleccionadas.has(archivo.fecha)) {
            return false;
        }
        if (busqueda && !normalizar(archivo.nombre).includes(busqueda)) {
            return false;
        }
        return true;
    });
}

function renderArchivos() {
    const filtrados = archivosFiltrados();
    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / estadoApp.porPagina));
    estadoApp.pagina = Math.min(Math.max(1, estadoApp.pagina), totalPaginas);

    const inicio = (estadoApp.pagina - 1) * estadoApp.porPagina;
    const pagina = filtrados.slice(inicio, inicio + estadoApp.porPagina);

    el.tablaArchivos.replaceChildren();

    if (pagina.length === 0) {
        const fila = document.createElement('tr');
        const celda = document.createElement('td');
        celda.colSpan = 5;
        celda.className = 'vacio';
        celda.textContent = 'No hay comprobantes que coincidan.';
        fila.append(celda);
        el.tablaArchivos.append(fila);
    } else {
        for (const archivo of pagina) {
            const fila = document.createElement('tr');

            const nombre = document.createElement('td');
            nombre.className = 'nombre';
            nombre.textContent = archivo.nombre;
            nombre.title = archivo.nombre;

            const fecha = document.createElement('td');
            fecha.textContent = archivo.fecha;

            const tamano = document.createElement('td');
            tamano.textContent = formatearBytes(archivo.tamano);

            const modificado = document.createElement('td');
            modificado.textContent = formatearFechaHora(archivo.mtime);

            const acciones = document.createElement('td');
            const enlace = document.createElement('a');
            enlace.className = 'btn btn-small';
            enlace.textContent = 'Descargar';
            enlace.href = `/api/comprobantes/${encodeURIComponent(archivo.fecha)}/${encodeURIComponent(archivo.nombre)}`;
            enlace.download = archivo.nombre;
            acciones.append(enlace);

            fila.append(nombre, fecha, tamano, modificado, acciones);
            el.tablaArchivos.append(fila);
        }
    }

    el.pagInfo.textContent = `${filtrados.length} archivo${filtrados.length === 1 ? '' : 's'} · Página ${estadoApp.pagina} de ${totalPaginas}`;
    el.pagPrev.disabled = estadoApp.pagina <= 1;
    el.pagNext.disabled = estadoApp.pagina >= totalPaginas;
}

async function cargarComprobantes() {
    const datos = await fetchJson('/api/comprobantes');
    estadoApp.fechas = datos.fechas || [];
    estadoApp.archivos = datos.archivos || [];
    actualizarUltimo(datos.ultimo || null);

    for (const fecha of [...estadoApp.fechasSeleccionadas]) {
        if (!estadoApp.fechas.includes(fecha)) {
            estadoApp.fechasSeleccionadas.delete(fecha);
        }
    }

    renderMenuFechas();
    renderArchivos();
}

function renderLogs() {
    const busqueda = normalizar(estadoApp.busquedaLog);
    const lineas = busqueda
        ? estadoApp.logs.filter(linea => normalizar(linea).includes(busqueda))
        : estadoApp.logs;

    const cercaDelFinal = el.logs.scrollHeight - el.logs.scrollTop - el.logs.clientHeight < 80;
    el.logs.textContent = lineas.join('\n');
    if (cercaDelFinal || estadoApp.logs.length <= estadoApp.porPagina) {
        el.logs.scrollTop = el.logs.scrollHeight;
    }
}

async function cargarLogs() {
    const datos = await fetchJson('/api/logs');
    estadoApp.logs = datos.lineas || [];
    renderLogs();
}

function manejarArchivoNuevo(archivo) {
    mostrarToast(`Nuevo comprobante: ${archivo.nombre}`);
    cargarComprobantes().catch(() => {});
}

function conectarEventos() {
    const fuente = new EventSource('/api/eventos');

    fuente.addEventListener('estado', evento => {
        try {
            aplicarEstado(JSON.parse(evento.data));
        } catch (error) {
            console.error('No se pudo leer el estado:', error);
        }
    });

    fuente.addEventListener('logs', evento => {
        try {
            estadoApp.logs = JSON.parse(evento.data) || [];
            renderLogs();
        } catch (error) {
            console.error('No se pudieron leer los registros:', error);
        }
    });

    fuente.addEventListener('log', evento => {
        try {
            estadoApp.logs.push(JSON.parse(evento.data));
            if (estadoApp.logs.length > 500) estadoApp.logs.shift();
            renderLogs();
        } catch (error) {
            console.error('No se pudo leer la línea de registro:', error);
        }
    });

    fuente.addEventListener('archivo', evento => {
        try {
            manejarArchivoNuevo(JSON.parse(evento.data));
        } catch (error) {
            console.error('No se pudo leer el archivo nuevo:', error);
        }
    });

    fuente.onerror = () => {
        setBadge('desconectado', 'Reconectando con el panel...');
    };
}

function initTabs() {
    const tabs = [...document.querySelectorAll('.tab')];
    const paneles = [...document.querySelectorAll('.tab-panel')];

    for (const tab of tabs) {
        tab.addEventListener('click', () => {
            for (const otro of tabs) {
                otro.classList.toggle('active', otro === tab);
                otro.setAttribute('aria-selected', otro === tab ? 'true' : 'false');
            }
            for (const panel of paneles) {
                panel.classList.toggle('active', panel.id === `tab-${tab.dataset.tab}`);
            }
            if (tab.dataset.tab === 'registros') {
                el.logs.scrollTop = el.logs.scrollHeight;
            }
        });
    }
}

function initAcciones() {
    el.btnReiniciar.addEventListener('click', async () => {
        if (!confirm('¿Reiniciar el servicio? El panel se reconectará en unos segundos.')) return;
        el.btnReiniciar.disabled = true;
        try {
            await fetchJson('/api/reiniciar', { method: 'POST' });
            mostrarToast('Reiniciando servicio...');
        } catch (error) {
            mostrarToast(error.message);
            el.btnReiniciar.disabled = false;
        }
    });

    el.btnAbrirCarpeta.addEventListener('click', async () => {
        try {
            await fetchJson('/api/abrir-carpeta', { method: 'POST' });
            mostrarToast('Carpeta abierta.');
        } catch (error) {
            mostrarToast(error.message);
        }
    });

    el.btnFechas.addEventListener('click', () => {
        el.menuFechas.classList.toggle('hidden');
    });

    document.addEventListener('click', evento => {
        if (!el.filtroFechas.contains(evento.target)) {
            el.menuFechas.classList.add('hidden');
        }
    });

    el.btnLimpiarFiltros.addEventListener('click', () => {
        estadoApp.fechasSeleccionadas.clear();
        estadoApp.busqueda = '';
        estadoApp.pagina = 1;
        el.buscarArchivo.value = '';
        renderMenuFechas();
        renderArchivos();
    });

    el.btnLimpiarLogs.addEventListener('click', () => {
        estadoApp.logs = [];
        renderLogs();
    });

    const buscarArchivo = debounce(() => {
        estadoApp.busqueda = el.buscarArchivo.value;
        estadoApp.pagina = 1;
        renderArchivos();
    }, 180);

    const buscarLog = debounce(() => {
        estadoApp.busquedaLog = el.buscarLog.value;
        renderLogs();
    }, 180);

    el.buscarArchivo.addEventListener('input', buscarArchivo);
    el.buscarLog.addEventListener('input', buscarLog);

    el.pagPrev.addEventListener('click', () => {
        if (estadoApp.pagina > 1) {
            estadoApp.pagina--;
            renderArchivos();
        }
    });

    el.pagNext.addEventListener('click', () => {
        estadoApp.pagina++;
        renderArchivos();
    });
}

function debounce(fn, ms) {
    let temporizador = null;
    return (...args) => {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => fn(...args), ms);
    };
}

function init() {
    initTabs();
    initAcciones();

    cargarEstado().catch(() => setBadge('error', 'No se pudo conectar con el servicio'));
    cargarComprobantes().catch(() => {});
    cargarLogs().catch(() => {});
    conectarEventos();

    setInterval(() => {
        if (estadoApp.estado?.inicio) {
            const segundos = Math.floor((Date.now() - estadoApp.estado.inicio) / 1000);
            el.kpiUptime.textContent = formatearUptime(segundos);
        }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', init);
