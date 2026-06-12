$ErrorActionPreference = "Stop"

$port = if ($env:VOXCPM_PORT) { $env:VOXCPM_PORT } else { "8000" }

Set-Location -LiteralPath $PSScriptRoot
$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
$python = if (Test-Path -LiteralPath $venvPython) { $venvPython } else { "python" }
& $python -m uvicorn server:app --host 0.0.0.0 --port $port
