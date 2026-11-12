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
    busquedaLog: '',
    filtrosEditados: null
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
    btnEditarFiltros: document.getElementById('btn-editar-filtros'),
    modalFiltros: document.getElementById('modal-filtros'),
    btnCerrarFiltros: document.getElementById('btn-cerrar-filtros'),
    btnCancelarFiltros: document.getElementById('btn-cancelar-filtros'),
    btnGuardarFiltros: document.getElementById('btn-guardar-filtros'),
    filtroModo: document.getElementById('filtro-modo'),
    filtroModoAyuda: document.getElementById('filtro-modo-ayuda'),
    filtrosAdvertencia: document.getElementById('filtros-advertencia'),
    chipsNumerosPermitidos: document.getElementById('chips-numeros-permitidos'),
    chipsNumerosBloqueados: document.getElementById('chips-numeros-bloqueados'),
    chipsGruposPermitidos: document.getElementById('chips-grupos-permitidos'),
    chipsGruposBloqueados: document.getElementById('chips-grupos-bloqueados'),
    inputNumeroPermitido: document.getElementById('input-numero-permitido'),
    inputNumeroBloqueado: document.getElementById('input-numero-bloqueado'),
    inputGrupoPermitido: document.getElementById('input-grupo-permitido'),
    inputGrupoBloqueado: document.getElementById('input-grupo-bloqueado'),
    btnAgregarNumeroPermitido: document.getElementById('btn-agregar-numero-permitido'),
    btnAgregarNumeroBloqueado: document.getElementById('btn-agregar-numero-bloqueado'),
    btnAgregarGrupoPermitido: document.getElementById('btn-agregar-grupo-permitido'),
    btnAgregarGrupoBloqueado: document.getElementById('btn-agregar-grupo-bloqueado'),
    listaGrupos: document.getElementById('lista-grupos'),
    toast: document.getElementById('toast')
};

const MODO_AYUDA = {
    todos: 'Se procesan todos los mensajes, sin importar el remitente.',
    whitelist: 'Solo se procesan los números y grupos de las listas permitidas.',
    blacklist: 'Se procesan todos los mensajes excepto los números y grupos bloqueados.',
    solo_privados: 'Solo se procesan chats individuales; los grupos se descartan.',
    solo_grupos: 'Solo se procesan mensajes de grupos; los chats individuales se descartan.'
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

function mostrarAdvertencia(texto) {
    el.filtrosAdvertencia.textContent = texto;
    el.filtrosAdvertencia.classList.remove('hidden');
}

function limpiarAdvertencia() {
    el.filtrosAdvertencia.textContent = '';
    el.filtrosAdvertencia.classList.add('hidden');
}

function actualizarAyudaModo() {
    el.filtroModoAyuda.textContent = MODO_AYUDA[el.filtroModo.value] || '';
}

function renderChips(contenedor, valores, campo) {
    contenedor.replaceChildren();

    if (!valores.length) {
        const vacio = document.createElement('span');
        vacio.className = 'muted';
        vacio.textContent = 'Ninguno';
        contenedor.append(vacio);
        return;
    }

    for (const valor of valores) {
        const chip = document.createElement('span');
        chip.className = 'chip';

        const texto = document.createElement('span');
        texto.textContent = valor;

        const quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.className = 'chip-quitar';
        quitar.textContent = '×';
        quitar.setAttribute('aria-label', `Quitar ${valor}`);
        quitar.addEventListener('click', () => {
            if (!estadoApp.filtrosEditados) return;
            const lista = estadoApp.filtrosEditados[campo];
            const indice = lista.indexOf(valor);
            if (indice >= 0) lista.splice(indice, 1);
            renderChipsFiltros();
        });

        chip.append(texto, quitar);
        contenedor.append(chip);
    }
}

function renderChipsFiltros() {
    if (!estadoApp.filtrosEditados) return;

    renderChips(el.chipsNumerosPermitidos, estadoApp.filtrosEditados.numerosPermitidos, 'numerosPermitidos');
    renderChips(el.chipsNumerosBloqueados, estadoApp.filtrosEditados.numerosBloqueados, 'numerosBloqueados');
    renderChips(el.chipsGruposPermitidos, estadoApp.filtrosEditados.gruposPermitidos, 'gruposPermitidos');
    renderChips(el.chipsGruposBloqueados, estadoApp.filtrosEditados.gruposBloqueados, 'gruposBloqueados');
}

function agregarValoresFiltro(campo, texto) {
    if (!estadoApp.filtrosEditados) return;

    const lista = estadoApp.filtrosEditados[campo];
    const esGrupo = campo.startsWith('grupos');
    const valores = String(texto || '')
        .split(/[\n,]+/)
        .map(valor => valor.trim())
        .filter(Boolean);

    for (const valor of valores) {
        if (esGrupo) {
            const existe = lista.some(item => item.toLocaleLowerCase('es-MX') === valor.toLocaleLowerCase('es-MX'));
            if (!existe) lista.push(valor);
        } else {
            const digitos = valor.replace(/\D/g, '');
            if (!digitos) continue;
            const existe = lista.some(item => item.replace(/\D/g, '') === digitos);
            if (!existe) lista.push(valor);
        }
    }

    renderChipsFiltros();
}

function renderGruposDisponibles() {
    const grupos = estadoApp.filtrosEditados?.gruposDisponibles || [];
    el.listaGrupos.replaceChildren();
    const vistos = new Set();

    for (const grupo of grupos) {
        const valor = grupo.nombre || grupo.id;
        if (!valor || vistos.has(valor)) continue;
        vistos.add(valor);

        const opcion = document.createElement('option');
        opcion.value = valor;
        if (grupo.nombre && grupo.id) opcion.label = grupo.id;
        el.listaGrupos.append(opcion);
    }
}

async function cargarGruposModal() {
    try {
        const datos = await fetchJson('/api/grupos');
        if (!estadoApp.filtrosEditados) return;
        estadoApp.filtrosEditados.gruposDisponibles = datos.grupos || [];
        renderGruposDisponibles();
    } catch (error) {
        console.error('No se pudieron cargar los grupos:', error);
    }
}

function activarTabModal(nombre) {
    for (const tab of el.modalFiltros.querySelectorAll('.modal-tab')) {
        const activo = tab.dataset.filtroTab === nombre;
        tab.classList.toggle('active', activo);
        tab.setAttribute('aria-selected', activo ? 'true' : 'false');
    }

    for (const panel of el.modalFiltros.querySelectorAll('.filtro-panel')) {
        panel.classList.toggle('active', panel.dataset.filtroPanel === nombre);
    }
}

async function abrirModalFiltros() {
    let filtros = estadoApp.estado?.filtros;

    if (!filtros) {
        try {
            const datos = await fetchJson('/api/filtros');
            filtros = datos.filtros;
        } catch (error) {
            mostrarToast(error.message);
            return;
        }
    }

    estadoApp.filtrosEditados = {
        modo: filtros?.modo || 'todos',
        numerosPermitidos: [...(filtros?.numerosPermitidos || [])],
        numerosBloqueados: [...(filtros?.numerosBloqueados || [])],
        gruposPermitidos: [...(filtros?.gruposPermitidos || [])],
        gruposBloqueados: [...(filtros?.gruposBloqueados || [])],
        permitirGrupos: filtros?.permitirGrupos !== false,
        permitirPrivados: filtros?.permitirPrivados !== false,
        gruposDisponibles: estadoApp.filtrosEditados?.gruposDisponibles || []
    };

    el.filtroModo.value = estadoApp.filtrosEditados.modo;
    actualizarAyudaModo();
    limpiarAdvertencia();
    renderChipsFiltros();
    renderGruposDisponibles();
    activarTabModal('general');
    el.modalFiltros.classList.remove('hidden');
    cargarGruposModal();
}

function cerrarModalFiltros() {
    el.modalFiltros.classList.add('hidden');
    limpiarAdvertencia();
    estadoApp.filtrosEditados = null;
}

async function guardarFiltros() {
    if (!estadoApp.filtrosEditados) return;

    const config = {
        modo: estadoApp.filtrosEditados.modo,
        numerosPermitidos: estadoApp.filtrosEditados.numerosPermitidos,
        numerosBloqueados: estadoApp.filtrosEditados.numerosBloqueados,
        gruposPermitidos: estadoApp.filtrosEditados.gruposPermitidos,
        gruposBloqueados: estadoApp.filtrosEditados.gruposBloqueados,
        permitirGrupos: estadoApp.filtrosEditados.permitirGrupos,
        permitirPrivados: estadoApp.filtrosEditados.permitirPrivados
    };

    el.btnGuardarFiltros.disabled = true;
    limpiarAdvertencia();

    try {
        const datos = await fetchJson('/api/filtros', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });

        const filtros = datos.filtros || config;
        if (estadoApp.estado) estadoApp.estado.filtros = filtros;
        renderFiltros(filtros);

        estadoApp.filtrosEditados = {
            modo: filtros.modo,
            numerosPermitidos: [...(filtros.numerosPermitidos || [])],
            numerosBloqueados: [...(filtros.numerosBloqueados || [])],
            gruposPermitidos: [...(filtros.gruposPermitidos || [])],
            gruposBloqueados: [...(filtros.gruposBloqueados || [])],
            permitirGrupos: filtros.permitirGrupos !== false,
            permitirPrivados: filtros.permitirPrivados !== false,
            gruposDisponibles: estadoApp.filtrosEditados.gruposDisponibles
        };

        el.filtroModo.value = filtros.modo;
        actualizarAyudaModo();
        renderChipsFiltros();

        const advertencias = datos.advertencias || [];
        if (advertencias.length) {
            mostrarAdvertencia(advertencias.join(' '));
            mostrarToast('Filtros guardados con advertencias.');
        } else {
            mostrarToast('Filtros guardados.');
            cerrarModalFiltros();
        }
    } catch (error) {
        mostrarAdvertencia(error.message);
        mostrarToast(error.message);
    } finally {
        el.btnGuardarFiltros.disabled = false;
    }
}

function conectarAgregar(boton, input, campo) {
    const agregar = () => {
        if (!estadoApp.filtrosEditados) return;
        agregarValoresFiltro(campo, input.value);
        input.value = '';
        input.focus();
    };

    boton.addEventListener('click', agregar);
    input.addEventListener('keydown', evento => {
        if (evento.key === 'Enter') {
            evento.preventDefault();
            agregar();
        }
    });
}

function initModalFiltros() {
    el.btnEditarFiltros.addEventListener('click', abrirModalFiltros);
    el.btnCerrarFiltros.addEventListener('click', cerrarModalFiltros);
    el.btnCancelarFiltros.addEventListener('click', cerrarModalFiltros);
    el.btnGuardarFiltros.addEventListener('click', guardarFiltros);

    for (const cerrar of el.modalFiltros.querySelectorAll('[data-cerrar-filtros]')) {
        cerrar.addEventListener('click', cerrarModalFiltros);
    }

    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && !el.modalFiltros.classList.contains('hidden')) {
            cerrarModalFiltros();
        }
    });

    el.filtroModo.addEventListener('change', () => {
        if (estadoApp.filtrosEditados) estadoApp.filtrosEditados.modo = el.filtroModo.value;
        actualizarAyudaModo();
    });

    for (const tab of el.modalFiltros.querySelectorAll('.modal-tab')) {
        tab.addEventListener('click', () => activarTabModal(tab.dataset.filtroTab));
    }

    conectarAgregar(el.btnAgregarNumeroPermitido, el.inputNumeroPermitido, 'numerosPermitidos');
    conectarAgregar(el.btnAgregarNumeroBloqueado, el.inputNumeroBloqueado, 'numerosBloqueados');
    conectarAgregar(el.btnAgregarGrupoPermitido, el.inputGrupoPermitido, 'gruposPermitidos');
    conectarAgregar(el.btnAgregarGrupoBloqueado, el.inputGrupoBloqueado, 'gruposBloqueados');
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
    initModalFiltros();

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
