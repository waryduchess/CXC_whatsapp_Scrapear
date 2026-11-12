@echo off
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-windows.ps1"
if errorlevel 1 (
    echo.
    echo La instalacion fallo. Revisa el mensaje anterior.
)
pause
