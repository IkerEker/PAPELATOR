# Prueba exacta de PAPELATOR sin Python: md5 de los BYTES de cada archivo de plugin\assets (828) = assets_md5.json.
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\test\verificar_assets.ps1
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$A = Join-Path $aqui '..\..\plugin\assets'
$ref = Get-Content (Join-Path $aqui 'assets_md5.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$mal = 0; $n = 0
foreach ($p in $ref.archivos.PSObject.Properties) {
  $n++; $f = Join-Path $A ($p.Name -replace '/', '\')
  if (-not (Test-Path -LiteralPath $f)) { Write-Output "FALTA $($p.Name)"; $mal++; continue }
  $h = (Get-FileHash -LiteralPath $f -Algorithm MD5).Hash.ToLower()
  if ($h -ne $p.Value) { Write-Output "CAMBIA $($p.Name)"; $mal++ }
}
Write-Output "$n archivos de plugin\assets comprobados, $mal distintos"
if ($mal) { exit 1 } else { exit 0 }
