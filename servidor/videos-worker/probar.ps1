# Prueba el trabajador de videos sin gastar un centavo.
#
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1                  todas las pruebas locales (no toca el CRM)
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -Etapa imagenes  solo el proyecto por escenas, hasta esa etapa:
#                                                    -Etapa clips          imagenes | clips | armado (armado = recorrido completo)
#                                                    -Etapa armado
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -ConCrm          además atiende la cola real del CRM una vez (solo con el simulado)
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -PlantillasCaptions   lista las plantillas de subtítulos de la cuenta de Captions
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnaImagen       UNA imagen base con el proveedor REAL de imagen (gasta lo mínimo)
#   powershell -ExecutionPolicy Bypass -File .\probar.ps1 -UnClip          UN clip corto con el proveedor REAL del .env (gasta lo mínimo)
#
#   -Prompt "texto"     el texto para -UnaImagen o -UnClip
#   -Foto https://…     con -UnaImagen: una foto real del producto como referencia (enlace público)
#
# Pruebas locales: no necesitan .env, ni claves, ni internet. Usan el proveedor
#   simulado y un CRM de mentira. Dejan:
#     datos\prueba-local\entregados\        el video completo «de los de antes»
#     datos\prueba-etapas\entregados\       los videos del proyecto por escenas
#     ..\..\qa-capturas\trabajador-etapas\  fotogramas del cierre (rótulo + subtítulos) en vertical y horizontal
# -ConCrm: revisa el .env y la conexión con el CRM y atiende lo que haya en la
#   cola UNA vez. Solo se permite con PROVEEDOR=simulado (y PROVEEDOR_IMAGEN vacío
#   o simulado), para que una prueba nunca gaste por accidente.
param(
  [switch]$ConCrm,
  [switch]$UnClip,
  [switch]$UnaImagen,
  [switch]$PlantillasCaptions,
  [ValidateSet("", "imagenes", "clips", "armado")][string]$Etapa = "",
  [string]$Prompt = "",
  [string]$Foto = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Write-Host "No se encontró Node.js (versión 20 o superior): https://nodejs.org" -ForegroundColor Red
  exit 1
}

if ($PlantillasCaptions) {
  # Lista las plantillas de subtítulos de la cuenta de Captions (nombre e id). No genera nada ni toca el CRM.
  if (-not (Test-Path ".env")) {
    Write-Host "Falta el archivo .env con CAPTIONS_API_KEY." -ForegroundColor Red
    exit 1
  }
  & $node trabajador.js --plantillas-captions
  exit $LASTEXITCODE
}

if ($UnClip -or $UnaImagen) {
  if (-not (Test-Path ".env")) {
    Write-Host "Falta el archivo .env (copia .env.ejemplo como .env y llénalo)." -ForegroundColor Red
    exit 1
  }
}

if ($UnaImagen) {
  # Primera llamada real de imagen: UNA imagen base, 9:16, sin CRM ni video.
  # Usa PROVEEDOR_IMAGEN del .env (kie, salvo que diga otra cosa) y SÍ gasta: una imagen.
  Write-Host "== Prueba de UNA imagen base con el proveedor de imagen del .env (gasta lo mínimo) ==" -ForegroundColor Cyan
  $argumentos = @("trabajador.js", "--una-imagen")
  if ($Prompt) { $argumentos += $Prompt }
  if ($Foto) { $argumentos += @("--foto", $Foto) }
  & $node @argumentos
  if ($LASTEXITCODE -ne 0) { exit 1 }
  Write-Host "Imagen en datos\una-imagen\ . Mírala (¿el producto se parece al real?) y anota los créditos que cobró." -ForegroundColor Green
  exit 0
}

if ($UnClip) {
  # Primera llamada real de video: una sola escena de 4 segundos, solo texto, 720p, sin CRM ni montaje.
  # Usa el PROVEEDOR del .env (kie, veo o fal) y SÍ gasta: lo mínimo que se puede pedir.
  Write-Host "== Prueba de UN clip con el proveedor del .env (gasta lo mínimo) ==" -ForegroundColor Cyan
  if ($Prompt) { & $node trabajador.js --un-clip $Prompt } else { & $node trabajador.js --un-clip }
  if ($LASTEXITCODE -ne 0) { exit 1 }
  Write-Host "Clip en datos\un-clip\ . Míralo antes de pasar a videos completos." -ForegroundColor Green
  exit 0
}

if ($Etapa) {
  Write-Host "== Proyecto por escenas con el simulado, hasta la etapa «$Etapa» (sin CRM, sin claves) ==" -ForegroundColor Cyan
  if ($Etapa -eq "armado") { & $node pruebas/etapas.js } else { & $node pruebas/etapas.js "--hasta=$Etapa" }
  if ($LASTEXITCODE -ne 0) {
    Write-Host "La prueba falló. Lo más común: ffmpeg no está instalado o no está en el PATH." -ForegroundColor Red
    exit 1
  }
  Write-Host "Archivos de la prueba: datos\prueba-etapas\ . Fotogramas del cierre: ..\..\qa-capturas\trabajador-etapas\" -ForegroundColor Green
  exit 0
}

Write-Host "== 1. Pruebas locales (sin CRM, sin claves) ==" -ForegroundColor Cyan
& $node pruebas/pruebas.js
if ($LASTEXITCODE -ne 0) {
  Write-Host "Las pruebas locales fallaron. Lo más común: ffmpeg no está instalado o no está en el PATH." -ForegroundColor Red
  exit 1
}
$video = Get-ChildItem "datos\prueba-local\entregados\*.mp4" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($video) { Write-Host "Video de prueba (completo): $($video.FullName)" -ForegroundColor Green }
Write-Host "Videos del proyecto por escenas: datos\prueba-etapas\entregados\ · fotogramas del cierre: ..\..\qa-capturas\trabajador-etapas\" -ForegroundColor Green

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
$proveedorImagen = (Select-String -Path ".env" -Pattern '^\s*PROVEEDOR_IMAGEN\s*=\s*(\S*)' | Select-Object -First 1).Matches.Groups[1].Value
if (($proveedor -and $proveedor -ne "simulado") -or ($proveedorImagen -and $proveedorImagen -ne "simulado")) {
  Write-Host "El .env tiene PROVEEDOR=$proveedor y PROVEEDOR_IMAGEN=$proveedorImagen. Esta prueba solo corre con el simulado, para no gastar." -ForegroundColor Yellow
  Write-Host "Pon PROVEEDOR=simulado (y PROVEEDOR_IMAGEN vacío o simulado) para probar, o arranca el trabajador normal con:  node trabajador.js"
  exit 1
}
& $node trabajador.js --comprobar
if ($LASTEXITCODE -ne 0) { exit 1 }
& $node trabajador.js --una-vez
Write-Host ""
Write-Host "Si había trabajos en cola (imágenes, clips, armado o un video completo), ya deben verse en el CRM como «Por aprobar»." -ForegroundColor Green
