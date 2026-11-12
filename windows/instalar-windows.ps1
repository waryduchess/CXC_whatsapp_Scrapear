$ErrorActionPreference = 'Stop'

function Escribir($texto, $color = 'White') {
    Write-Host $texto -ForegroundColor $color
}

try {
    $project = Split-Path -Parent $PSScriptRoot
    Set-Location $project

    Escribir "=== Instalador CXC WhatsApp ===" 'Cyan'
    Escribir "Carpeta: $project"

    if ($project -match ' ') {
        Escribir "Aviso: la ruta contiene espacios. Se recomienda usar C:\CXC_WhatsApp." 'Yellow'
    }

    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        throw "Node.js no esta instalado. Instala Node.js LTS y vuelve a ejecutar."
    }

    $version = (& node --version).TrimStart('v')
    $mayor = [int]($version.Split('.')[0])
    if ($mayor -lt 18) {
        throw "Se requiere Node.js 18 o superior. Version actual: $version"
    }
    Escribir "Node.js: $version" 'Green'

    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        throw "Git no esta instalado. Es necesario para descargar whatsapp-web.js."
    }
    Escribir "Git: $(& git --version)" 'Green'

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
    }
    if (-not $npm) {
        throw "No se encontro npm. Reinstala Node.js LTS."
    }

    $envPath = Join-Path $project '.env'
    if (-not (Test-Path $envPath)) {
        Copy-Item (Join-Path $project '.env.example') $envPath
        Escribir "Se creo .env desde .env.example." 'Yellow'
    }

    Escribir "Instalando dependencias..."
    & $npm.Source install
    if ($LASTEXITCODE -ne 0) {
        throw "npm install fallo. Revisa el mensaje anterior."
    }

    $pm2 = Join-Path $project 'node_modules\.bin\pm2.cmd'
    if (-not (Test-Path $pm2)) {
        throw "No se encontro PM2 local. Revisa la instalacion de dependencias."
    }

    $logs = Join-Path $project 'logs'
    New-Item -ItemType Directory -Force -Path $logs | Out-Null

    Escribir "Iniciando servicio con PM2..."
    & $pm2 startOrReload (Join-Path $project 'ecosystem.config.js')
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 no pudo iniciar el servicio."
    }
    & $pm2 save

    $puerto = 3001
    if (Test-Path $envPath) {
        $linea = Get-Content $envPath | Where-Object { $_ -match '^\s*PANEL_PORT\s*=' } | Select-Object -First 1
        if ($linea) {
            $valor = ($linea -split '=', 2)[1].Trim().Trim('"')
            if ($valor -match '^\d+$') {
                $puerto = [int]$valor
            }
        }
    }

    $url = "http://127.0.0.1:$puerto"
    $ok = $false
    for ($i = 0; $i -lt 40; $i++) {
        try {
            $resp = Invoke-WebRequest -UseBasicParsing -Uri "$url/api/salud" -TimeoutSec 2
            if ($resp.StatusCode -eq 200) {
                $ok = $true
                break
            }
        } catch {
        }
        Start-Sleep -Milliseconds 500
    }

    if (-not $ok) {
        Escribir "El servicio no respondio. Revisa logs\error.log." 'Yellow'
    }

    $wscript = Join-Path $env:WINDIR 'System32\wscript.exe'
    $lanzador = Join-Path $project 'windows\lanzador.vbs'
    $shell = New-Object -ComObject WScript.Shell

    function Crear-Acceso($ruta, $argumentos, $descripcion) {
        $acceso = $shell.CreateShortcut($ruta)
        $acceso.TargetPath = $wscript
        $acceso.Arguments = $argumentos
        $acceso.WorkingDirectory = $project
        $acceso.Description = $descripcion
        $acceso.IconLocation = "$env:WINDIR\System32\imageres.dll,109"
        $acceso.Save()
    }

    $escritorio = [Environment]::GetFolderPath('Desktop')
    $inicio = [Environment]::GetFolderPath('Startup')

    Crear-Acceso (Join-Path $escritorio 'CXC WhatsApp.lnk') "`"$lanzador`"" 'Abrir panel de CXC WhatsApp'
    Crear-Acceso (Join-Path $inicio 'CXC WhatsApp.lnk') "`"$lanzador`"" 'Iniciar CXC WhatsApp y abrir el panel al iniciar sesion'

    Escribir ""
    Escribir "Instalacion completa." 'Green'
    Escribir "Panel: $url"
    Escribir "Se crearon accesos en el Escritorio y en Inicio."

    if ($ok) {
        Start-Process $wscript -ArgumentList "`"$lanzador`""
    }
} catch {
    Escribir ""
    Escribir "Error: $($_.Exception.Message)" 'Red'
    exit 1
}
