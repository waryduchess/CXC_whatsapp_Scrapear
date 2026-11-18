const estadoApp = {
    estado: null,
    fechas: [],
    archivos: [],
    ultimo: null,
    fechasSeleccionadas: new Set(),
    chatsSeleccionados: new Set(),
    bancosSeleccionados: new Set(),
    estadosIaSeleccionados: new Set(),
    busqueda: '',
    pagina: 1,
    porPagina: 20,
    logs: [],
    busquedaLog: '',
    filtrosEditados: null,
    ia: null,
    datosAbiertos: null
};

const estadoPdf = {
    pdf: null,
    archivo: null,
    token: 0,
    zoom: 1,
    escalaBase: 1,
    paginaActual: 1,
    totalPaginas: 0
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
    btnGrupos: document.getElementById('btn-grupos'),
    menuGrupos: document.getElementById('menu-grupos'),
    gruposCount: document.getElementById('grupos-count'),
    filtroGrupos: document.getElementById('filtro-grupos'),
    btnBancos: document.getElementById('btn-bancos'),
    menuBancos: document.getElementById('menu-bancos'),
    bancosCount: document.getElementById('bancos-count'),
    filtroBancos: document.getElementById('filtro-bancos'),
    btnEstadosIa: document.getElementById('btn-estados-ia'),
    menuEstadosIa: document.getElementById('menu-estados-ia'),
    estadosIaCount: document.getElementById('estados-ia-count'),
    filtroEstadosIa: document.getElementById('filtro-estados-ia'),
    btnAnalizarPendientes: document.getElementById('btn-analizar-pendientes'),
    btnExportarCsv: document.getElementById('btn-exportar-csv'),
    iaResumen: document.getElementById('ia-resumen'),
    modalDatos: document.getElementById('modal-datos-ia'),
    btnCerrarDatos: document.getElementById('btn-cerrar-datos'),
    datosBackdrop: document.querySelector('#modal-datos-ia [data-cerrar-datos]'),
    datosTitulo: document.getElementById('modal-datos-titulo'),
    datosSubtitulo: document.getElementById('modal-datos-subtitulo'),
    datosEstado: document.getElementById('modal-datos-estado'),
    datosLista: document.getElementById('modal-datos-lista'),
    datosError: document.getElementById('modal-datos-error'),
    btnReanalizarDatos: document.getElementById('btn-reanalizar-datos'),
    btnVerPdfDatos: document.getElementById('btn-ver-pdf-datos'),
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
    modalPdf: document.getElementById('modal-pdf'),
    btnCerrarPdf: document.getElementById('btn-cerrar-pdf'),
    pdfBackdrop: document.querySelector('#modal-pdf [data-cerrar-pdf]'),
    pdfTitulo: document.getElementById('modal-pdf-titulo'),
    pdfSubtitulo: document.getElementById('modal-pdf-subtitulo'),
    pdfPages: document.getElementById('pdf-pages'),
    pdfPageInfo: document.getElementById('pdf-page-info'),
    pdfZoomInfo: document.getElementById('pdf-zoom-info'),
    pdfPrev: document.getElementById('pdf-prev'),
    pdfNext: document.getElementById('pdf-next'),
    pdfZoomOut: document.getElementById('pdf-zoom-out'),
    pdfZoomIn: document.getElementById('pdf-zoom-in'),
    pdfFit: document.getElementById('pdf-fit'),
    pdfPrint: document.getElementById('pdf-print'),
    pdfDescargar: document.getElementById('pdf-descargar'),
    toast: document.getElementById('toast')
};

if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/build/pdf.worker.min.js';
}

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

function urlArchivo(archivo, inline = false) {
    const base = `/api/comprobantes/${encodeURIComponent(archivo.fecha)}`;
    const ruta = archivo.grupo
        ? `${base}/${encodeURIComponent(archivo.grupo)}/${encodeURIComponent(archivo.nombre)}`
        : `${base}/${encodeURIComponent(archivo.nombre)}`;
    return inline ? `${ruta}?inline=1` : ruta;
}

function estaImpreso(archivo) {
    return Boolean(archivo?.impreso);
}

async function marcarImpreso(archivo, impreso = true) {
    if (!archivo?.rutaRelativa) return;

    archivo.impreso = impreso;
    if (impreso) marcarFilaImpresa(archivo.rutaRelativa);

    try {
        await fetchJson('/api/comprobantes/impreso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rutaRelativa: archivo.rutaRelativa, impreso })
        });
    } catch (error) {
        archivo.impreso = !impreso;
        mostrarToast('No se pudo guardar la marca de impresión.');
    }
}

function marcarFilaImpresa(rutaRelativa) {
    for (const fila of el.tablaArchivos.querySelectorAll('tr[data-ruta]')) {
        if (fila.dataset.ruta === rutaRelativa) {
            fila.classList.add('fila-impresa');
        }
    }
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

const ETIQUETAS_IA = {
    ok: 'Analizado',
    incompleto: 'Incompleto',
    error: 'Error',
    pendiente: 'Pendiente'
};

const CAMPOS_DATOS = [
    ['banco_origen', 'Banco origen'],
    ['cuenta_origen_digitos', 'Cuenta origen'],
    ['banco_destino', 'Banco destino'],
    ['cuenta_destino_digitos', 'Cuenta destino'],
    ['monto', 'Monto'],
    ['fecha', 'Fecha'],
    ['hora_operacion', 'Hora'],
    ['folio_operacion', 'Folio'],
    ['autenticacion', 'Autenticación'],
    ['referencia', 'Referencia'],
    ['clave_rastreo', 'Clave de rastreo'],
    ['concepto', 'Concepto']
];

function estadoIA(archivo) {
    return archivo?.analisis?.estado || 'pendiente';
}

function bancoIA(archivo) {
    return archivo?.analisis?.datos?.banco_origen || '';
}

function formatearMonto(valor) {
    if (valor === null || valor === undefined || valor === '') return '-';
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return String(valor);
    return numero.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        const etiqueta = ultimo.grupo ? `${ultimo.grupo}/${ultimo.nombre}` : ultimo.nombre;
        el.kpiUltimo.textContent = `${etiqueta} (${ultimo.fecha})`;
        el.kpiUltimo.title = etiqueta;
    } else {
        el.kpiUltimo.textContent = '-';
        el.kpiUltimo.title = '';
    }
}

function actualizarContadorFechas() {
    const total = estadoApp.fechasSeleccionadas.size;
    el.fechasCount.textContent = total === 0 ? 'Todas' : String(total);
}

function archivosPorFecha() {
    if (estadoApp.fechasSeleccionadas.size === 0) return estadoApp.archivos;
    return estadoApp.archivos.filter(archivo => estadoApp.fechasSeleccionadas.has(archivo.fecha));
}

function archivosPorGrupo() {
    if (estadoApp.chatsSeleccionados.size === 0) return estadoApp.archivos;
    return estadoApp.archivos.filter(archivo => estadoApp.chatsSeleccionados.has(archivo.grupo || ''));
}

function podarGruposSeleccionados() {
    const disponibles = new Set(archivosPorFecha().map(archivo => archivo.grupo || ''));
    let eliminado = false;
    for (const clave of [...estadoApp.chatsSeleccionados]) {
        if (!disponibles.has(clave)) {
            estadoApp.chatsSeleccionados.delete(clave);
            eliminado = true;
        }
    }
    return eliminado;
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

    const archivosBase = archivosPorGrupo();
    for (const fecha of estadoApp.fechas) {
        const cantidad = archivosBase.filter(archivo => archivo.fecha === fecha).length;
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
            const podado = podarGruposSeleccionados();
            if (podado) renderMenuFechas();
            renderMenuGrupos();
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

function actualizarContadorGrupos() {
    const total = estadoApp.chatsSeleccionados.size;
    el.gruposCount.textContent = total === 0 ? 'Todos' : String(total);
}

function renderMenuGrupos() {
    el.menuGrupos.replaceChildren();

    const grupos = new Map();
    for (const archivo of archivosPorFecha()) {
        const clave = archivo.grupo || '';
        const actual = grupos.get(clave) || {
            etiqueta: archivo.grupo || 'Sin grupo',
            cantidad: 0
        };
        actual.cantidad++;
        grupos.set(clave, actual);
    }

    if (grupos.size === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'muted';
        vacio.textContent = 'Sin grupos disponibles';
        el.menuGrupos.append(vacio);
        actualizarContadorGrupos();
        return;
    }

    const entradas = [...grupos.entries()].sort((a, b) => {
        if (!a[0]) return 1;
        if (!b[0]) return -1;
        return a[1].etiqueta.localeCompare(b[1].etiqueta, 'es');
    });

    for (const [clave, grupo] of entradas) {
        const etiqueta = document.createElement('label');
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = clave;
        casilla.checked = estadoApp.chatsSeleccionados.has(clave);
        casilla.addEventListener('change', () => {
            if (casilla.checked) estadoApp.chatsSeleccionados.add(clave);
            else estadoApp.chatsSeleccionados.delete(clave);
            estadoApp.pagina = 1;
            actualizarContadorGrupos();
            renderMenuFechas();
            renderArchivos();
        });

        const texto = document.createElement('span');
        texto.textContent = grupo.etiqueta;
        const conteo = document.createElement('span');
        conteo.className = 'muted';
        conteo.textContent = `${grupo.cantidad}`;

        etiqueta.append(casilla, texto, conteo);
        el.menuGrupos.append(etiqueta);
    }

    actualizarContadorGrupos();
}

function actualizarContadorBancos() {
    const total = estadoApp.bancosSeleccionados.size;
    el.bancosCount.textContent = total === 0 ? 'Todos' : String(total);
}

function actualizarContadorEstadosIa() {
    const total = estadoApp.estadosIaSeleccionados.size;
    el.estadosIaCount.textContent = total === 0 ? 'Todos' : String(total);
}

function renderMenuBancos() {
    el.menuBancos.replaceChildren();

    const bancos = new Map();
    for (const archivo of estadoApp.archivos) {
        const clave = bancoIA(archivo) || '';
        const actual = bancos.get(clave) || { etiqueta: clave || 'Sin banco', cantidad: 0 };
        actual.cantidad++;
        bancos.set(clave, actual);
    }

    if (bancos.size === 0) {
        const vacio = document.createElement('div');
        vacio.className = 'muted';
        vacio.textContent = 'Sin bancos disponibles';
        el.menuBancos.append(vacio);
        actualizarContadorBancos();
        return;
    }

    const entradas = [...bancos.entries()].sort((a, b) => {
        if (!a[0]) return 1;
        if (!b[0]) return -1;
        return a[1].etiqueta.localeCompare(b[1].etiqueta, 'es');
    });

    for (const [clave, banco] of entradas) {
        const etiqueta = document.createElement('label');
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = clave;
        casilla.checked = estadoApp.bancosSeleccionados.has(clave);
        casilla.addEventListener('change', () => {
            if (casilla.checked) estadoApp.bancosSeleccionados.add(clave);
            else estadoApp.bancosSeleccionados.delete(clave);
            estadoApp.pagina = 1;
            actualizarContadorBancos();
            renderArchivos();
        });

        const texto = document.createElement('span');
        texto.textContent = banco.etiqueta;
        const conteo = document.createElement('span');
        conteo.className = 'muted';
        conteo.textContent = `${banco.cantidad}`;

        etiqueta.append(casilla, texto, conteo);
        el.menuBancos.append(etiqueta);
    }

    actualizarContadorBancos();
}

function renderMenuEstadosIa() {
    el.menuEstadosIa.replaceChildren();

    const conteo = new Map();
    for (const archivo of estadoApp.archivos) {
        const clave = estadoIA(archivo);
        conteo.set(clave, (conteo.get(clave) || 0) + 1);
    }

    const orden = ['ok', 'incompleto', 'error', 'pendiente'];
    for (const clave of orden) {
        if (!conteo.has(clave)) continue;
        const etiqueta = document.createElement('label');
        const casilla = document.createElement('input');
        casilla.type = 'checkbox';
        casilla.value = clave;
        casilla.checked = estadoApp.estadosIaSeleccionados.has(clave);
        casilla.addEventListener('change', () => {
            if (casilla.checked) estadoApp.estadosIaSeleccionados.add(clave);
            else estadoApp.estadosIaSeleccionados.delete(clave);
            estadoApp.pagina = 1;
            actualizarContadorEstadosIa();
            renderArchivos();
        });

        const texto = document.createElement('span');
        texto.textContent = ETIQUETAS_IA[clave] || clave;
        const cantidad = document.createElement('span');
        cantidad.className = 'muted';
        cantidad.textContent = `${conteo.get(clave)}`;

        etiqueta.append(casilla, texto, cantidad);
        el.menuEstadosIa.append(etiqueta);
    }

    actualizarContadorEstadosIa();
}

function archivosFiltrados() {
    const busqueda = normalizar(estadoApp.busqueda);
    return estadoApp.archivos.filter(archivo => {
        if (estadoApp.fechasSeleccionadas.size > 0 &&
            !estadoApp.fechasSeleccionadas.has(archivo.fecha)) {
            return false;
        }
        if (estadoApp.chatsSeleccionados.size > 0 &&
            !estadoApp.chatsSeleccionados.has(archivo.grupo || '')) {
            return false;
        }
        if (estadoApp.bancosSeleccionados.size > 0 &&
            !estadoApp.bancosSeleccionados.has(bancoIA(archivo))) {
            return false;
        }
        if (estadoApp.estadosIaSeleccionados.size > 0 &&
            !estadoApp.estadosIaSeleccionados.has(estadoIA(archivo))) {
            return false;
        }
        const texto = normalizar(`${archivo.grupo || ''} ${archivo.nombre}`);
        if (busqueda && !texto.includes(busqueda)) {
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
        celda.colSpan = 9;
        celda.className = 'vacio';
        celda.textContent = 'No hay comprobantes que coincidan.';
        fila.append(celda);
        el.tablaArchivos.append(fila);
    } else {
        for (const archivo of pagina) {
            const fila = document.createElement('tr');
            fila.className = estaImpreso(archivo) ? 'fila-archivo fila-impresa' : 'fila-archivo';
            fila.dataset.ruta = archivo.rutaRelativa || '';
            fila.title = 'Doble clic para ver el PDF';
            fila.addEventListener('dblclick', evento => {
                if (evento.target.closest('a, button')) return;
                abrirPdf(archivo);
            });

            const nombre = document.createElement('td');
            nombre.className = 'nombre';
            nombre.textContent = archivo.nombre;
            nombre.title = archivo.nombre;

            const grupo = document.createElement('td');
            grupo.className = 'grupo';
            grupo.textContent = archivo.grupo || 'Sin grupo';
            grupo.title = archivo.grupo || '';

            const fecha = document.createElement('td');
            fecha.textContent = archivo.fecha;

            const datos = archivo.analisis?.datos;
            const monto = document.createElement('td');
            monto.textContent = formatearMonto(datos?.monto);
            monto.title = datos?.monto === null || datos?.monto === undefined ? '' : `$${formatearMonto(datos.monto)}`;

            const banco = document.createElement('td');
            banco.textContent = datos?.banco_origen || '-';
            banco.title = datos?.banco_origen || '';

            const estadoCelda = document.createElement('td');
            const chip = document.createElement('span');
            const claveEstado = estadoIA(archivo);
            chip.className = `ia-chip ia-${claveEstado}`;
            chip.textContent = ETIQUETAS_IA[claveEstado] || claveEstado;
            if (archivo.analisis?.error) chip.title = archivo.analisis.error;
            estadoCelda.append(chip);

            const tamano = document.createElement('td');
            tamano.textContent = formatearBytes(archivo.tamano);

            const modificado = document.createElement('td');
            modificado.textContent = formatearFechaHora(archivo.mtime);

            const acciones = document.createElement('td');
            const contenedorAcciones = document.createElement('span');
            contenedorAcciones.className = 'acciones-archivo';

            const ver = document.createElement('button');
            ver.className = 'btn btn-small btn-primary';
            ver.type = 'button';
            ver.textContent = 'Ver';
            ver.addEventListener('click', () => abrirPdf(archivo));

            const datosBtn = document.createElement('button');
            datosBtn.className = 'btn btn-small';
            datosBtn.type = 'button';
            datosBtn.textContent = 'Datos';
            datosBtn.addEventListener('click', () => abrirDatosIA(archivo));

            const analizar = document.createElement('button');
            analizar.className = 'btn btn-small';
            analizar.type = 'button';
            analizar.textContent = claveEstado === 'ok' ? 'Reanalizar' : 'Analizar';
            analizar.addEventListener('click', () => analizarArchivo(archivo, claveEstado === 'ok'));

            const enlace = document.createElement('a');
            enlace.className = 'btn btn-small';
            enlace.textContent = 'Descargar';
            enlace.href = urlArchivo(archivo);
            enlace.download = archivo.nombre;

            contenedorAcciones.append(ver, datosBtn, analizar, enlace);
            acciones.append(contenedorAcciones);

            fila.append(nombre, grupo, fecha, monto, banco, estadoCelda, tamano, modificado, acciones);
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

    podarGruposSeleccionados();
    podarSeleccionesIA();

    renderMenuFechas();
    renderMenuGrupos();
    renderMenuBancos();
    renderMenuEstadosIa();
    renderArchivos();
}

function podarSeleccionesIA() {
    const bancos = new Set(estadoApp.archivos.map(archivo => bancoIA(archivo)));
    for (const banco of [...estadoApp.bancosSeleccionados]) {
        if (!bancos.has(banco)) estadoApp.bancosSeleccionados.delete(banco);
    }

    const estados = new Set(estadoApp.archivos.map(archivo => estadoIA(archivo)));
    for (const clave of [...estadoApp.estadosIaSeleccionados]) {
        if (!estados.has(clave)) estadoApp.estadosIaSeleccionados.delete(clave);
    }
}

function buscarArchivo(rutaRelativa) {
    return estadoApp.archivos.find(archivo => archivo.rutaRelativa === rutaRelativa) || null;
}

function actualizarResumenIA(datos) {
    if (datos) estadoApp.ia = datos;
    const ia = estadoApp.ia;
    const resumen = ia?.resumen || {};
    const partes = [];

    if (ia && ia.configurada === false) {
        partes.push('Falta DEEPSEEK_API_KEY');
    }
    partes.push(`${resumen.ok || 0} analizados`);
    if (resumen.incompleto) partes.push(`${resumen.incompleto} incompletos`);
    if (resumen.error) partes.push(`${resumen.error} con error`);
    if (resumen.pendiente) partes.push(`${resumen.pendiente} pendientes`);
    if (ia?.procesando) partes.push('analizando…');
    if (ia?.enCola) partes.push(`${ia.enCola} en cola`);

    el.iaResumen.textContent = `IA: ${partes.join(' · ')}`;
}

function aplicarEstadoIA(datos) {
    estadoApp.ia = datos;
    actualizarResumenIA(datos);
}

async function cargarEstadoIA() {
    try {
        const datos = await fetchJson('/api/ia');
        aplicarEstadoIA(datos);
    } catch (error) {
        console.error('No se pudo leer el estado de IA:', error);
    }
}

async function analizarArchivo(archivo, forzar = false) {
    try {
        const datos = await fetchJson('/api/ia/analizar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rutaRelativa: archivo.rutaRelativa, forzar })
        });
        aplicarEstadoIA(datos.estado);
        mostrarToast(datos.encolado ? 'Comprobante en cola de análisis.' : datos.mensaje);
    } catch (error) {
        mostrarToast(error.message);
    }
}

async function analizarPendientes() {
    if (!confirm('¿Analizar todos los comprobantes pendientes o con error? Puede tardar varios minutos.')) return;
    el.btnAnalizarPendientes.disabled = true;
    try {
        const datos = await fetchJson('/api/ia/pendientes', { method: 'POST' });
        aplicarEstadoIA(datos.estado);
        mostrarToast(`${datos.encolados} comprobante${datos.encolados === 1 ? '' : 's'} en cola.`);
    } catch (error) {
        mostrarToast(error.message);
    } finally {
        el.btnAnalizarPendientes.disabled = false;
    }
}

function exportarCsv() {
    const archivos = archivosFiltrados();
    const columnas = [
        'Fecha carpeta', 'Grupo', 'Archivo', 'Monto', 'Banco origen', 'Cuenta origen',
        'Banco destino', 'Cuenta destino', 'Fecha operación', 'Hora', 'Folio',
        'Autenticación', 'Referencia', 'Clave de rastreo', 'Concepto', 'Estado IA'
    ];

    const escapar = valor => {
        const texto = valor === null || valor === undefined ? '' : String(valor);
        return `"${texto.replace(/"/g, '""')}"`;
    };

    const lineas = [columnas.map(escapar).join(',')];
    for (const archivo of archivos) {
        const datos = archivo.analisis?.datos || {};
        lineas.push([
            archivo.fecha,
            archivo.grupo || '',
            archivo.nombre,
            datos.monto ?? '',
            datos.banco_origen || '',
            datos.cuenta_origen_digitos || '',
            datos.banco_destino || '',
            datos.cuenta_destino_digitos || '',
            datos.fecha || '',
            datos.hora_operacion || '',
            datos.folio_operacion || '',
            datos.autenticacion || '',
            datos.referencia || '',
            datos.clave_rastreo || '',
            datos.concepto || '',
            ETIQUETAS_IA[estadoIA(archivo)] || estadoIA(archivo)
        ].map(escapar).join(','));
    }

    const blob = new Blob([`\uFEFF${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `comprobantes-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    mostrarToast(`${archivos.length} comprobante${archivos.length === 1 ? '' : 's'} exportado${archivos.length === 1 ? '' : 's'}.`);
}

function abrirDatosIA(archivo) {
    estadoApp.datosAbiertos = archivo;
    el.datosTitulo.textContent = archivo.nombre;
    el.datosSubtitulo.textContent = `${archivo.grupo || 'Sin grupo'} · ${archivo.fecha}`;

    const analisis = archivo.analisis;
    const claveEstado = estadoIA(archivo);
    el.datosEstado.className = `ia-chip ia-${claveEstado}`;
    el.datosEstado.textContent = ETIQUETAS_IA[claveEstado] || claveEstado;

    el.datosLista.replaceChildren();
    const datos = analisis?.datos;
    for (const [campo, etiqueta] of CAMPOS_DATOS) {
        const termino = document.createElement('dt');
        termino.textContent = etiqueta;
        const valor = document.createElement('dd');
        const contenido = datos?.[campo];
        const sinDato = contenido === null || contenido === undefined || contenido === '';
        valor.textContent = campo === 'monto'
            ? (sinDato ? '—' : `$${formatearMonto(contenido)}`)
            : (sinDato ? '—' : contenido);
        if (sinDato) valor.classList.add('sin-dato');
        el.datosLista.append(termino, valor);
    }

    if (analisis?.error) {
        el.datosError.textContent = analisis.error;
        el.datosError.classList.remove('hidden');
    } else {
        el.datosError.textContent = '';
        el.datosError.classList.add('hidden');
    }

    el.btnReanalizarDatos.textContent = claveEstado === 'ok' ? 'Analizar de nuevo' : 'Analizar';
    el.modalDatos.classList.remove('hidden');
}

function cerrarDatosIA() {
    el.modalDatos.classList.add('hidden');
    estadoApp.datosAbiertos = null;
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
    const etiqueta = archivo.grupo ? `${archivo.grupo}/${archivo.nombre}` : archivo.nombre;
    mostrarToast(`Nuevo comprobante: ${etiqueta}`);
    cargarComprobantes().catch(() => {});
}

async function abrirPdf(archivo) {
    const token = ++estadoPdf.token;
    estadoPdf.archivo = archivo;
    estadoPdf.paginaActual = 1;
    estadoPdf.totalPaginas = 0;
    estadoPdf.zoom = 1;

    el.pdfTitulo.textContent = archivo.nombre;
    el.pdfSubtitulo.textContent = `${archivo.grupo || 'Sin grupo'} · ${archivo.fecha}`;
    el.pdfDescargar.href = urlArchivo(archivo);
    el.pdfDescargar.download = archivo.nombre;
    el.pdfPageInfo.textContent = '- / -';
    el.pdfZoomInfo.textContent = '100%';
    el.pdfPrev.disabled = true;
    el.pdfNext.disabled = true;
    el.pdfPages.replaceChildren();

    const cargando = document.createElement('p');
    cargando.className = 'muted';
    cargando.textContent = 'Cargando PDF...';
    el.pdfPages.append(cargando);

    el.modalPdf.classList.remove('hidden');

    try {
        if (!window.pdfjsLib) {
            throw new Error('El visor PDF no está disponible. Ejecuta npm install y reinicia el servicio.');
        }

        const respuesta = await fetch(urlArchivo(archivo));
        if (!respuesta.ok) {
            throw new Error(`No se pudo cargar el PDF (${respuesta.status})`);
        }
        const datos = await respuesta.arrayBuffer();
        if (token !== estadoPdf.token) return;

        const pdf = await window.pdfjsLib.getDocument({
            data: datos,
            cMapUrl: '/vendor/pdfjs/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: '/vendor/pdfjs/standard_fonts/'
        }).promise;

        if (token !== estadoPdf.token) {
            pdf.destroy();
            return;
        }

        if (estadoPdf.pdf) {
            estadoPdf.pdf.destroy().catch(() => {});
        }

        estadoPdf.pdf = pdf;
        estadoPdf.totalPaginas = pdf.numPages;
        await renderizarPdf(token);
    } catch (error) {
        if (token !== estadoPdf.token) return;
        el.pdfPages.replaceChildren();
        const mensaje = document.createElement('p');
        mensaje.className = 'muted';
        mensaje.textContent = `No se pudo mostrar el PDF: ${error.message || error}`;
        el.pdfPages.append(mensaje);
        mostrarToast('No se pudo mostrar el PDF.');
    }
}

async function renderizarPdf(token) {
    const pdf = estadoPdf.pdf;
    if (!pdf || token !== estadoPdf.token) return;

    el.pdfPages.replaceChildren();

    const primeraPagina = await pdf.getPage(1);
    if (token !== estadoPdf.token) return;

    const viewportBase = primeraPagina.getViewport({ scale: 1 });
    const anchoDisponible = Math.max(200, el.pdfPages.clientWidth - 32);
    estadoPdf.escalaBase = anchoDisponible / viewportBase.width;
    estadoPdf.paginaActual = Math.min(Math.max(1, estadoPdf.paginaActual), pdf.numPages);
    actualizarInfoPdf();

    for (let numero = 1; numero <= pdf.numPages; numero++) {
        if (token !== estadoPdf.token) return;

        const pagina = numero === 1 ? primeraPagina : await pdf.getPage(numero);
        const viewport = pagina.getViewport({ scale: estadoPdf.escalaBase * estadoPdf.zoom });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        await pagina.render({
            canvasContext: canvas.getContext('2d'),
            viewport
        }).promise;

        if (token !== estadoPdf.token) return;

        const contenedor = document.createElement('div');
        contenedor.className = 'pdf-page';
        contenedor.dataset.pagina = String(numero);
        contenedor.append(canvas);
        el.pdfPages.append(contenedor);
    }

    actualizarInfoPdf();
    irAPagina(estadoPdf.paginaActual);
}

function actualizarInfoPdf() {
    el.pdfPageInfo.textContent = estadoPdf.totalPaginas
        ? `${estadoPdf.paginaActual} / ${estadoPdf.totalPaginas}`
        : '- / -';
    el.pdfZoomInfo.textContent = `${Math.round(estadoPdf.zoom * 100)}%`;
    el.pdfPrev.disabled = estadoPdf.paginaActual <= 1;
    el.pdfNext.disabled = estadoPdf.paginaActual >= estadoPdf.totalPaginas;
}

function irAPagina(numero) {
    if (!estadoPdf.totalPaginas) return;
    const destino = Math.min(Math.max(1, numero), estadoPdf.totalPaginas);
    const pagina = el.pdfPages.querySelector(`.pdf-page[data-pagina="${destino}"]`);
    if (pagina) {
        pagina.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    estadoPdf.paginaActual = destino;
    actualizarInfoPdf();
}

function actualizarPaginaVisible() {
    if (!estadoPdf.totalPaginas) return;

    const limite = el.pdfPages.getBoundingClientRect().top + 24;
    let visible = 1;
    for (const pagina of el.pdfPages.querySelectorAll('.pdf-page')) {
        if (pagina.getBoundingClientRect().top <= limite) {
            visible = Number(pagina.dataset.pagina);
        } else {
            break;
        }
    }

    if (visible !== estadoPdf.paginaActual) {
        estadoPdf.paginaActual = visible;
        actualizarInfoPdf();
    }
}

async function cambiarZoom(factor) {
    if (!estadoPdf.pdf) return;
    const nuevo = Math.min(3, Math.max(0.5, estadoPdf.zoom * factor));
    if (nuevo === estadoPdf.zoom) return;
    estadoPdf.zoom = nuevo;
    const pagina = estadoPdf.paginaActual;
    const token = ++estadoPdf.token;
    await renderizarPdf(token).catch(() => {});
    if (token === estadoPdf.token) {
        irAPagina(pagina);
    }
}

async function ajustarPdf() {
    if (!estadoPdf.pdf) return;
    estadoPdf.zoom = 1;
    const pagina = estadoPdf.paginaActual;
    const token = ++estadoPdf.token;
    await renderizarPdf(token).catch(() => {});
    if (token === estadoPdf.token) {
        irAPagina(pagina);
    }
}

function imprimirPdf() {
    if (!estadoPdf.pdf) return;
    window.print();
    marcarImpreso(estadoPdf.archivo);
}

function cerrarPdf() {
    estadoPdf.token++;
    if (estadoPdf.pdf) {
        estadoPdf.pdf.destroy().catch(() => {});
        estadoPdf.pdf = null;
    }
    estadoPdf.totalPaginas = 0;
    estadoPdf.paginaActual = 1;
    el.modalPdf.classList.add('hidden');
    el.pdfPages.replaceChildren();
    el.pdfPageInfo.textContent = '- / -';
    el.pdfZoomInfo.textContent = '100%';
    el.pdfPrev.disabled = true;
    el.pdfNext.disabled = true;
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

    fuente.addEventListener('ia', evento => {
        try {
            aplicarEstadoIA(JSON.parse(evento.data));
        } catch (error) {
            console.error('No se pudo leer el estado de IA:', error);
        }
    });

    fuente.addEventListener('impreso', evento => {
        try {
            const { rutaRelativa, impreso } = JSON.parse(evento.data) || {};
            const archivo = buscarArchivo(rutaRelativa);
            if (archivo) archivo.impreso = Boolean(impreso);
            renderArchivos();
        } catch (error) {
            console.error('No se pudo leer la marca de impresión:', error);
        }
    });

    fuente.addEventListener('datos', evento => {
        try {
            const { rutaRelativa, registro } = JSON.parse(evento.data) || {};
            const archivo = buscarArchivo(rutaRelativa);
            if (archivo) archivo.analisis = registro;
            renderMenuBancos();
            renderMenuEstadosIa();
            renderArchivos();
            if (estadoApp.datosAbiertos?.rutaRelativa === rutaRelativa) {
                abrirDatosIA(archivo || estadoApp.datosAbiertos);
            }
        } catch (error) {
            console.error('No se pudieron leer los datos del comprobante:', error);
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
        el.menuGrupos.classList.add('hidden');
        el.menuBancos.classList.add('hidden');
        el.menuEstadosIa.classList.add('hidden');
    });

    el.btnGrupos.addEventListener('click', () => {
        el.menuGrupos.classList.toggle('hidden');
        el.menuFechas.classList.add('hidden');
        el.menuBancos.classList.add('hidden');
        el.menuEstadosIa.classList.add('hidden');
    });

    el.btnBancos.addEventListener('click', () => {
        el.menuBancos.classList.toggle('hidden');
        el.menuFechas.classList.add('hidden');
        el.menuGrupos.classList.add('hidden');
        el.menuEstadosIa.classList.add('hidden');
    });

    el.btnEstadosIa.addEventListener('click', () => {
        el.menuEstadosIa.classList.toggle('hidden');
        el.menuFechas.classList.add('hidden');
        el.menuGrupos.classList.add('hidden');
        el.menuBancos.classList.add('hidden');
    });

    document.addEventListener('click', evento => {
        if (!el.filtroFechas.contains(evento.target)) {
            el.menuFechas.classList.add('hidden');
        }
        if (!el.filtroGrupos.contains(evento.target)) {
            el.menuGrupos.classList.add('hidden');
        }
        if (!el.filtroBancos.contains(evento.target)) {
            el.menuBancos.classList.add('hidden');
        }
        if (!el.filtroEstadosIa.contains(evento.target)) {
            el.menuEstadosIa.classList.add('hidden');
        }
    });

    el.btnLimpiarFiltros.addEventListener('click', () => {
        estadoApp.fechasSeleccionadas.clear();
        estadoApp.chatsSeleccionados.clear();
        estadoApp.bancosSeleccionados.clear();
        estadoApp.estadosIaSeleccionados.clear();
        estadoApp.busqueda = '';
        estadoApp.pagina = 1;
        el.buscarArchivo.value = '';
        renderMenuFechas();
        renderMenuGrupos();
        renderMenuBancos();
        renderMenuEstadosIa();
        renderArchivos();
    });

    el.btnAnalizarPendientes.addEventListener('click', analizarPendientes);
    el.btnExportarCsv.addEventListener('click', exportarCsv);

    el.btnCerrarDatos.addEventListener('click', cerrarDatosIA);
    el.datosBackdrop.addEventListener('click', cerrarDatosIA);
    el.btnVerPdfDatos.addEventListener('click', () => {
        const archivo = estadoApp.datosAbiertos;
        cerrarDatosIA();
        if (archivo) abrirPdf(archivo);
    });
    el.btnReanalizarDatos.addEventListener('click', () => {
        const archivo = estadoApp.datosAbiertos;
        if (!archivo) return;
        cerrarDatosIA();
        analizarArchivo(archivo, estadoIA(archivo) === 'ok');
    });
    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && !el.modalDatos.classList.contains('hidden')) {
            cerrarDatosIA();
        }
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

function initModalPdf() {
    el.btnCerrarPdf.addEventListener('click', cerrarPdf);
    el.pdfBackdrop.addEventListener('click', cerrarPdf);
    el.pdfPrev.addEventListener('click', () => irAPagina(estadoPdf.paginaActual - 1));
    el.pdfNext.addEventListener('click', () => irAPagina(estadoPdf.paginaActual + 1));
    el.pdfZoomOut.addEventListener('click', () => cambiarZoom(0.8));
    el.pdfZoomIn.addEventListener('click', () => cambiarZoom(1.25));
    el.pdfFit.addEventListener('click', ajustarPdf);
    el.pdfPrint.addEventListener('click', imprimirPdf);
    el.pdfPages.addEventListener('scroll', actualizarPaginaVisible, { passive: true });
    document.addEventListener('keydown', evento => {
        if (evento.key === 'Escape' && !el.modalPdf.classList.contains('hidden')) {
            cerrarPdf();
        }
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
    initModalPdf();

    cargarEstado().catch(() => setBadge('error', 'No se pudo conectar con el servicio'));
    cargarComprobantes().catch(() => {});
    cargarEstadoIA();
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
