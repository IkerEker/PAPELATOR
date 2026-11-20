# Igual que verificar_fuentes.py pero sin Python (Windows PowerShell 5.1 o 7).
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\verificar_fuentes.ps1
# Cada nombre de fuentes_id.json -> id -> TEXTURAS\indice\indice.json (archivo) -> archivo en TEXTURAS_ROOT -> md5 == el del id.
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$raiz = $env:TEXTURAS_ROOT
if (-not $raiz) { $raiz = [Environment]::GetEnvironmentVariable('TEXTURAS_ROOT', 'User') }
if (-not $raiz) { Write-Output 'Falta TEXTURAS_ROOT'; exit 1 }
Add-Type -AssemblyName System.Web.Extensions
$js = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$js.MaxJsonLength = [int]::MaxValue
$tabla = $js.DeserializeObject([IO.File]::ReadAllText((Join-Path $aqui 'fuentes_id.json'), [Text.Encoding]::UTF8))
$indice = $js.DeserializeObject([IO.File]::ReadAllText((Join-Path $raiz 'TEXTURAS\indice\indice.json'), [Text.Encoding]::UTF8))
$arch = @{}
foreach ($a in $indice['assets']) { $arch[$a['id']] = $a['archivo'] }
$vistos = @{}; $mal = 0
foreach ($nombre in $tabla.Keys) {
  $id = $tabla[$nombre]
  if ($vistos.ContainsKey($id)) { continue }
  $vistos[$id] = 1
  if (-not $arch.ContainsKey($id)) { Write-Output "NO ESTA EN EL INDICE $nombre $id"; $mal++; continue }
  $p = Join-Path $raiz ($arch[$id] -replace '/', '\')
  if (-not (Test-Path -LiteralPath $p)) { Write-Output "FALTA $p"; $mal++; continue }
  $h = (Get-FileHash -LiteralPath $p -Algorithm MD5).Hash.ToLower()
  if ($id.StartsWith('or:') -and $h -ne $id.Substring(3)) { Write-Output "MD5 DISTINTO $p"; $mal++ }
}
Write-Output "$($tabla.Count) nombres de fuente, $($vistos.Count) archivos distintos en la biblioteca, $mal problemas"
if ($mal) { exit 1 } else { exit 0 }
