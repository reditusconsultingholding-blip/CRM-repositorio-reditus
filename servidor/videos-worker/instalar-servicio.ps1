# Deja el trabajador de videos arrancando solo con Windows (tarea programada).
#
#   Clic derecho → «Ejecutar con PowerShell» como ADMINISTRADOR, o:
#     powershell -ExecutionPolicy Bypass -File .\instalar-servicio.ps1
#
#   Quitarlo:   powershell -ExecutionPolicy Bypass -File .\instalar-servicio.ps1 -Quitar
#
# La tarea arranca al encender el equipo (sin que nadie inicie sesión), corre
# con la cuenta SYSTEM y, si el proceso se cae, Windows lo vuelve a levantar.
# Además se relanza cada 10 minutos por si acaso: si ya hay uno corriendo, el
# segundo se da cuenta y se cierra solo.
param(
  [switch]$Quitar,
  [string]$Nombre = "Reditus - Trabajador de videos"
)

$ErrorActionPreference = "Stop"
$carpeta = $PSScriptRoot

$esAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $esAdmin) {
  Write-Host "Abre PowerShell como ADMINISTRADOR y vuelve a correr este script." -ForegroundColor Yellow
  exit 1
}

if ($Quitar) {
  if (Get-ScheduledTask -TaskName $Nombre -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $Nombre -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false
    Write-Host "Tarea «$Nombre» quitada." -ForegroundColor Green
  } else {
    Write-Host "No había ninguna tarea llamada «$Nombre»."
  }
  exit 0
}

# --- comprobaciones antes de instalar ---
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "No se encontró Node.js. Instálalo (versión 20 o superior) desde https://nodejs.org y vuelve a correr esto." -ForegroundColor Red
  exit 1
}
$version = [int]((& $node -v) -replace '^v(\d+)\..*', '$1')
if ($version -lt 20) {
  Write-Host "Node.js es la versión $version; se necesita la 20 o superior." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path (Join-Path $carpeta ".env"))) {
  Write-Host "Falta el archivo .env. Copia .env.ejemplo como .env, llénalo y vuelve a correr esto." -ForegroundColor Red
  exit 1
}

Write-Host "Comprobando configuración, ffmpeg y conexión con el CRM..."
Push-Location $carpeta
try {
  & $node trabajador.js --comprobar
  $bien = ($LASTEXITCODE -eq 0)
} finally {
  Pop-Location
}
if (-not $bien) {
  Write-Host "La comprobación falló (mira el mensaje de arriba). No se instaló nada." -ForegroundColor Red
  exit 1
}

# --- la tarea ---
$accion = New-ScheduledTaskAction -Execute $node -Argument "trabajador.js" -WorkingDirectory $carpeta
$alArrancar = New-ScheduledTaskTrigger -AtStartup
$cada10 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
$ajustes = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$cuenta = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

if (Get-ScheduledTask -TaskName $Nombre -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $Nombre -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false
}
Register-ScheduledTask -TaskName $Nombre -Action $accion -Trigger @($alArrancar, $cada10) -Settings $ajustes -Principal $cuenta `
  -Description "Genera los videos que pide el CRM de Reditus. Carpeta: $carpeta" | Out-Null
Start-ScheduledTask -TaskName $Nombre

Start-Sleep -Seconds 4
$estado = (Get-ScheduledTask -TaskName $Nombre).State
Write-Host ""
Write-Host "Tarea «$Nombre» instalada. Estado: $estado" -ForegroundColor Green
Write-Host "Registro:  $carpeta\datos\registro\trabajador.log"
Write-Host "Costos:    $carpeta\datos\registro\costos.csv"
Write-Host "Ver en vivo:  Get-Content '$carpeta\datos\registro\trabajador.log' -Tail 30 -Wait"
Write-Host ""
Write-Host "Nota: la tarea corre con la cuenta SYSTEM. Si ffmpeg se instaló solo para tu usuario (por ejemplo con winget)," -ForegroundColor Yellow
Write-Host "pon su ruta completa en FFMPEG y FFPROBE dentro del .env; el registro lo dirá si no lo encuentra." -ForegroundColor Yellow
