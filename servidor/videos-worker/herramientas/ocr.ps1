# Lee el texto de varias imágenes con el OCR que trae Windows (Windows.Media.Ocr). No usa internet
# ni ningún servicio: corre en el propio servidor. Lo usa lib\lectura.js para ver qué escribió Captions.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File herramientas\ocr.ps1 -Lista <archivo con una ruta por línea>
#
# Escribe una línea JSON por imagen: {"i":0,"texto":"..."}. Si Windows no tiene OCR (o ningún idioma
# instalado para OCR), termina con código 3.
param([Parameter(Mandatory = $true)][string]$Lista)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
  $null = [Windows.Storage.StorageFile, Windows.Foundation, ContentType = WindowsRuntime]
  Add-Type -AssemblyName System.Runtime.WindowsRuntime
} catch {
  [Console]::Error.WriteLine("sin OCR de Windows: $($_.Exception.Message)")
  exit 3
}
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq "AsTask" -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq "IAsyncOperation``1" })[0]
function Esperar($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }

$motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $motor) {
  foreach ($idioma in @("es-ES", "es-MX", "es", "en-US")) {
    try { $motor = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new($idioma)) } catch { $motor = $null }
    if ($null -ne $motor) { break }
  }
}
if ($null -eq $motor) {
  [Console]::Error.WriteLine("sin OCR de Windows: no hay ningún idioma de OCR instalado")
  exit 3
}

$i = 0
foreach ($ruta in (Get-Content -LiteralPath $Lista -Encoding UTF8)) {
  if (-not $ruta.Trim()) { continue }
  $texto = ""
  try {
    $f = Esperar ([Windows.Storage.StorageFile]::GetFileFromPathAsync($ruta)) ([Windows.Storage.StorageFile])
    $s = Esperar ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $d = Esperar ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $b = Esperar ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $r = Esperar ($motor.RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
    $texto = $r.Text
    $s.Dispose()
  } catch {
    $texto = ""
  }
  [Console]::Out.WriteLine((@{ i = $i; texto = $texto } | ConvertTo-Json -Compress))
  $i++
}
exit 0
