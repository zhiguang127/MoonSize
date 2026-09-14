param([string]$Gcc = '')
$ErrorActionPreference = 'Stop'
$originalCompiler = $env:MOON_CC
$originalNativePath = $env:PATH
try {
  if (-not $Gcc) {
    $foundGcc = Get-Command gcc -ErrorAction SilentlyContinue
    if ($foundGcc) { $Gcc = $foundGcc.Source }
  }
  if ($Gcc) {
    $gccPath = (Resolve-Path -LiteralPath $Gcc).Path
    $arPath = Join-Path (Split-Path $gccPath) 'ar.exe'
    if (-not (Test-Path -LiteralPath $arPath)) { throw "Missing MinGW archiver: $arPath" }
    $shimDir = Join-Path (Split-Path $PSScriptRoot) '.local\native-cc'
    New-Item -ItemType Directory -Path $shimDir -Force | Out-Null
    # The bundled runtime includes stdlib.h before its _CRT_RAND_S define.
    # Define it at compilation so MinGW declares rand_s; runtime is unmodified.
    Set-Content -LiteralPath (Join-Path $shimDir 'gcc.cmd') -Value "@`"$gccPath`" -D_CRT_RAND_S %*" -Encoding ascii
    Set-Content -LiteralPath (Join-Path $shimDir 'ar.cmd') -Value "@`"$arPath`" %*" -Encoding ascii
    $env:MOON_CC = Join-Path $shimDir 'gcc.cmd'
    $env:PATH = "$(Split-Path $gccPath);$env:PATH"
  }
  moon test --target native --deny-warn
  if ($LASTEXITCODE -ne 0) { throw 'Native tests failed' }
} finally {
  $env:MOON_CC = $originalCompiler
  $env:PATH = $originalNativePath
}
