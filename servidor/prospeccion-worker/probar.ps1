# Prueba el trabajador de prospección sin enviar ningún correo.
#
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1            pruebas locales (no toca el CRM ni Gmail)
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -ConCrm    además da 3 vueltas en SIMULACIÓN contra el CRM
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -Acceso    solo comprueba .env, CRM y el acceso a Gmail (no envía)
#
# -ConCrm fuerza MODO=simulacion aunque el .env diga «real»: nada sale. Ojo:
#   los correos que el CRM entregue en esa prueba quedan marcados como
#   enviados en el CRM, así que úsalo solo con una campaña de prueba.
param([switch]$ConCrm, [switch]$Acceso)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "No se encontró Node.js (versión 20 o superior): https://nodejs.org" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path "node_modules\nodemailer")) {
  Write-Host "Instalando las bibliotecas (npm install)..."
  & npm.cmd install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { exit 1 }
}

if ($Acceso) {
  if (-not (Test-Path ".env")) { Write-Host "Falta el archivo .env (copia .env.ejemplo como .env y llénalo)." -ForegroundColor Red; exit 1 }
  & $node trabajador.js --comprobar
  exit $LASTEXITCODE
}

Write-Host "== 1. Pruebas locales (sin CRM, sin Gmail) ==" -ForegroundColor Cyan
& $node pruebas/pruebas.js
if ($LASTEXITCODE -ne 0) { Write-Host "Las pruebas locales fallaron." -ForegroundColor Red; exit 1 }

if (-not $ConCrm) {
  Write-Host ""
  Write-Host "Listo. Para probar contra el CRM en simulación:  .\probar.ps1 -ConCrm"
  exit 0
}

Write-Host ""
Write-Host "== 2. Tres vueltas en SIMULACIÓN contra el CRM ==" -ForegroundColor Cyan
if (-not (Test-Path ".env")) { Write-Host "Falta el archivo .env (copia .env.ejemplo como .env y llénalo)." -ForegroundColor Red; exit 1 }
$env:MODO = "simulacion"
$env:CARPETA_DATOS = "datos\prueba"
& $node trabajador.js --comprobar
if ($LASTEXITCODE -ne 0) { exit 1 }
& $node trabajador.js --ciclos 3
Write-Host ""
Write-Host "Lo que se habría enviado quedó en datos\prueba\simulacion\enviados\ (no salió ningún correo)." -ForegroundColor Green
