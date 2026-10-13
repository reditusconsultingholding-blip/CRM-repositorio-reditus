# Prueba el trabajador de videos sin gastar un centavo.
#
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1            prueba local (no toca el CRM)
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -ConCrm    además atiende la cola real del CRM una vez
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnClip    UN clip corto con el proveedor REAL del .env (gasta lo mínimo)
#
# Paso 1 (siempre): pruebas locales. Hace un video de mentira con el proveedor
#   simulado y lo deja en datos\prueba-local\entregados\. No necesita .env.
# Paso 2 (-ConCrm): revisa el .env y la conexión con el CRM y atiende lo que
#   haya pendiente en la cola UNA vez. Solo se permite con PROVEEDOR=simulado,
#   para que una prueba nunca gaste en fal por accidente.
param([switch]$ConCrm, [switch]$UnClip, [string]$Prompt = "")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "No se encontró Node.js (versión 20 o superior): https://nodejs.org" -ForegroundColor Red
  exit 1
}

if ($UnClip) {
  # Primera llamada real: una sola escena de 4 segundos, solo texto, 720p, sin CRM ni montaje.
  # Usa el PROVEEDOR del .env (kie, veo o fal) y SÍ gasta: lo mínimo que se puede pedir.
  if (-not (Test-Path ".env")) {
    Write-Host "Falta el archivo .env (copia .env.ejemplo como .env y llénalo)." -ForegroundColor Red
    exit 1
  }
  Write-Host "== Prueba de UN clip con el proveedor del .env (gasta lo mínimo) ==" -ForegroundColor Cyan
  if ($Prompt) { & $node trabajador.js --un-clip $Prompt } else { & $node trabajador.js --un-clip }
  if ($LASTEXITCODE -ne 0) { exit 1 }
  Write-Host "Clip en datos\un-clip\ . Míralo antes de pasar a videos completos." -ForegroundColor Green
  exit 0
}

Write-Host "== 1. Pruebas locales (sin CRM, sin claves) ==" -ForegroundColor Cyan
& $node pruebas/pruebas.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "Las pruebas locales fallaron. Lo más común: ffmpeg no está instalado o no está en el PATH." -ForegroundColor Red
  exit 1
}
$video = Get-ChildItem "datos\prueba-local\entregados\*.mp4" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($video) { Write-Host "Video de prueba: $($video.FullName)" -ForegroundColor Green }

if (-not $ConCrm) {
  Write-Host ""
  Write-Host "Listo. Para probar contra el CRM: pide un video en /videos y corre  .\probar.ps1 -ConCrm"
  exit 0
}

Write-Host ""
Write-Host "== 2. Contra el CRM ==" -ForegroundColor Cyan
if (-not (Test-Path ".env")) {
  Write-Host "Falta el archivo .env (copia .env.ejemplo como .env y llénalo)." -ForegroundColor Red
  exit 1
}
$proveedor = (Select-String -Path ".env" -Pattern '^\s*PROVEEDOR\s*=\s*(\S*)' | Select-Object -First 1).Matches.Groups[1].Value
if ($proveedor -and $proveedor -ne "simulado") {
  Write-Host "El .env tiene PROVEEDOR=$proveedor. Esta prueba solo corre con PROVEEDOR=simulado, para no gastar." -ForegroundColor Yellow
  Write-Host "Cámbialo a simulado para probar, o arranca el trabajador normal con:  node trabajador.js"
  exit 1
}
& $node trabajador.js --comprobar
if ($LASTEXITCODE -ne 0) { exit 1 }
& $node trabajador.js --una-vez
Write-Host ""
Write-Host "Si había un video en cola, ya debe verse en el CRM (/videos) como «Por aprobar»." -ForegroundColor Green
