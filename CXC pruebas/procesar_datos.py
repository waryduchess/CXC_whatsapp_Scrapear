import io
import re
import pandas as pd

ARCHIVO_CSV = 'Detalledeventas-AnalisisIA809 (copia 1).csv'

print("Procesando y reparando líneas del CSV...")

lineas_reparadas = []
with open(ARCHIVO_CSV, 'r', encoding='utf-8', errors='ignore') as f:
    for line in f:
        # Repara comillas pegadas a porcentajes sin coma (ejemplo: "27391.15"10.4% -> "27391.15",10.4%)
        linea_fix = re.sub(r'"([0-9.,]+)"([0-9.]+%)', r'"\1",\2', line)
        lineas_reparadas.append(linea_fix)

contenido = "".join(lineas_reparadas)

# 1. Cargar en Pandas con low_memory=False para evitar advertencias de tipo
df = pd.read_csv(
    io.StringIO(contenido),
    sep=',',
    low_memory=False,
    on_bad_lines='skip'
)

# 2. Limpiar nombres de columnas
df.columns = df.columns.str.strip()

# 3. Limpiar y convertir TOTAL a número flotante seguro (ignora % o texto no numérico)
df['TOTAL_NUMERICO'] = pd.to_numeric(
    df['TOTAL']
    .astype(str)
    .str.replace('$', '', regex=False)
    .str.replace(',', '', regex=False)
    .str.strip(),
    errors='coerce'  # Si encuentra un valor inválido como '100.0%', lo convierte a NaN sin fallar
).fillna(0.0)

# 4. Métricas y consolidación
print("\n=== ESTADÍSTICAS DEL ARCHIVO COMPLETO ===")
print(f"-> Total de filas (artículos/partidas) leídas: {len(df):,}")

resumen = df.groupby(['CLIENTE', 'FACTURA','FECHA DE VENTA'])['TOTAL_NUMERICO'].sum().reset_index()

print(f"-> Total de facturas únicas consolidadas: {len(resumen):,}")
print(f"-> GRAN TOTAL REAL: ${df['TOTAL_NUMERICO'].sum():,.2f}")

# 5. Exportar CSV listo para la conciliación
ARCHIVO_SALIDA = 'facturas_consolidadas_completas.csv'
resumen.to_csv(ARCHIVO_SALIDA, index=False)
print(f"\n[✓] Se exportaron exitosamente las facturas consolidadas a: {ARCHIVO_SALIDA}")

#
#3,418,256.8885	$377,993,906.62