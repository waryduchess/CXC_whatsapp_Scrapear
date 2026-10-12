// Si la página se abre desde el propio servidor (vista/server.js, puerto 3001)
// se usa la misma URL (relativa). Si se abre con Live Server u otro origen,
// se usa la URL absoluta de la API.
const API_ORIGIN = window.location.port === '3001' ? '' : 'http://localhost:3001';

function escapeCsv(valor) {
    if (valor == null) return '';
    const s = String(valor);
    if (/[;"\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

const COLUMNAS = [
    { campo: 'fecha_recepcion', etiqueta: 'Fecha recepción' },
    { campo: 'banco_origen', etiqueta: 'Banco origen' },
    { campo: 'cuenta_origen_digitos', etiqueta: 'Cuenta origen' },
    { campo: 'banco_destino', etiqueta: 'Banco destino' },
    { campo: 'cuenta_destino_digitos', etiqueta: 'Cuenta destino' },
    { campo: 'monto', etiqueta: 'Monto' },
    { campo: 'fecha', etiqueta: 'Fecha operación' },
    { campo: 'hora_operacion', etiqueta: 'Hora' },
    { campo: 'folio', etiqueta: 'Folio' },
    { campo: 'referencia', etiqueta: 'Referencia' },
    { campo: 'autenticacion', etiqueta: 'Autenticación' },
    { campo: 'clave_rastreo', etiqueta: 'Clave rastreo' },
    { campo: 'concepto', etiqueta: 'Concepto' },
    { campo: 'cliente', etiqueta: 'Cliente' },
    { campo: 'nombre_archivo', etiqueta: 'Archivo' },
    { campo: 'ruta_archivo', etiqueta: 'Ruta' }
];

const estado = {
    periodo: 'dia',
    fecha: new Date().toISOString().slice(0, 10),
    datos: [],
    rango: null
};

const $ = (id) => document.getElementById(id);

function formatearFechaES(iso) {
    if (!iso) return '';
    const [anio, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${anio}`;
}

function formatearMonto(valor) {
    if (valor == null || valor === '') return '';
    const n = Number(valor);
    if (isNaN(n)) return String(valor);
    return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function renderTabla(comprobantes) {
    const cuerpo = $('tabla-cuerpo');
    const vacio = $('fila-vacia');
    cuerpo.innerHTML = '';

    if (!comprobantes || comprobantes.length === 0) {
        vacio.style.display = '';
        return;
    }
    vacio.style.display = 'none';

    for (const fila of comprobantes) {
        const tr = document.createElement('tr');
        for (const col of COLUMNAS) {
            const td = document.createElement('td');
            let valor = fila[col.campo];
            if (col.campo === 'monto') valor = formatearMonto(valor);
            if (col.campo === 'fecha_recepcion' || col.campo === 'fecha') valor = formatearFechaES(valor);
            td.textContent = valor ?? '';
            tr.appendChild(td);
        }
        cuerpo.appendChild(tr);
    }
}

function generarCsv() {
    if (!estado.datos || estado.datos.length === 0) return;

    const lineas = [COLUMNAS.map(c => escapeCsv(c.etiqueta)).join(';')];
    for (const fila of estado.datos) {
        lineas.push(COLUMNAS.map(c => escapeCsv(fila[c.campo])).join(';'));
    }

    const contenido = '\uFEFF' + lineas.join('\r\n');
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobantes_${estado.periodo}_${estado.rango?.desde || estado.fecha}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function cargarDatos() {
    const params = new URLSearchParams({ periodo: estado.periodo, fecha: estado.fecha });
    const res = await fetch(`${API_ORIGIN}/api/comprobantes?${params}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al consultar');
    }
    return res.json();
}

async function refrescar() {
    $('estado-carga').textContent = 'Cargando…';
    $('cargar-error').textContent = '';
    try {
        const data = await cargarDatos();
        estado.datos = data.comprobantes;
        estado.rango = { desde: data.desde, hasta: data.hasta };
        renderTabla(data.comprobantes);
        const etiquetas = { dia: 'Día', semana: 'Semana', mes: 'Mes' };
        $('txt-rango').textContent = `${etiquetas[data.periodo]}: ${formatearFechaES(data.desde)} al ${formatearFechaES(data.hasta)}`;
        $('txt-total').textContent = `${data.total} comprobante(s)`;
        $('btn-csv').disabled = data.total === 0;
    } catch (error) {
        $('cargar-error').textContent = error.message;
        renderTabla(null);
    } finally {
        $('estado-carga').textContent = '';
    }
}

function setPeriodo(periodo) {
    estado.periodo = periodo;
    document.querySelectorAll('.btn-periodo').forEach(b => {
        b.classList.toggle('activo', b.dataset.periodo === periodo);
    });
    $('input-fecha').disabled = false;
    if (periodo === 'mes') {
        $('input-fecha').value = estado.fecha.slice(0, 7) + '-01';
    }
    refrescar();
}

async function inicializar() {
    document.querySelectorAll('.btn-periodo').forEach(b => {
        b.addEventListener('click', () => setPeriodo(b.dataset.periodo));
    });

    const fechaInput = $('input-fecha');
    fechaInput.value = estado.fecha;
    fechaInput.addEventListener('change', () => {
        estado.fecha = fechaInput.value;
        refrescar();
    });

    $('btn-csv').addEventListener('click', generarCsv);

    try {
        const res = await fetch(`${API_ORIGIN}/api/fechas`);
        const data = await res.json();
        if (data.fechas && data.fechas.length > 0) {
            fechaInput.max = data.fechas[data.fechas.length - 1];
            fechaInput.min = data.fechas[0];
        }
    } catch {
        // el rango de fechas es opcional
    }

    setPeriodo('dia');
}

inicializar();