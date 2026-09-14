param(
  [ValidateSet('check', 'test', 'native', 'demo', 'cases', 'serve', 'info')]
  [string]$Task = 'demo'
)
$ErrorActionPreference = 'Stop'
$originalPath = $env:PATH
$originalMoonHome = $env:MOON_HOME
$portableMoon = Join-Path $PSScriptRoot '.tools\moonbit'
Push-Location $PSScriptRoot
try {
  if (Test-Path -LiteralPath (Join-Path $portableMoon 'bin\moon.exe')) {
    $env:MOON_HOME = $portableMoon
    $env:PATH = "$portableMoon\bin;$env:PATH"
  }
  if (-not (Get-Command moon -ErrorAction SilentlyContinue)) {
    throw 'MoonBit not found. See README.md for installation instructions.'
  }
  switch ($Task) {
    'check' { moon check --target all --deny-warn }
    'test' {
      foreach ($moonTarget in @('wasm', 'wasm-gc', 'js')) {
        moon test --target $moonTarget --deny-warn
        if ($LASTEXITCODE -ne 0) { throw "MoonBit tests failed: $moonTarget" }
      }
      & (Join-Path $PSScriptRoot 'scripts\test-native.ps1')
      moon build --target js --release --deny-warn
      if ($LASTEXITCODE -ne 0) { throw 'JS build failed' }
      node --test --test-isolation=none tests/integration.test.mjs tests/worker.test.mjs
    }
    'demo' { node scripts/build-demo.mjs }
    'native' { & (Join-Path $PSScriptRoot 'scripts\test-native.ps1') }
    'cases' { python scripts/build-cases.py }
    'serve' { node scripts/serve.mjs }
    'info' { moon version --all }
  }
  if ($LASTEXITCODE -ne 0) { throw "Task $Task failed (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
  $env:PATH = $originalPath
  $env:MOON_HOME = $originalMoonHome
}
