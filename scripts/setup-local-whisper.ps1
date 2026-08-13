$ErrorActionPreference = 'Stop'

$installedPython = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
$pythonLookup = Get-Command python -ErrorAction SilentlyContinue
$pythonCommand = if (Test-Path -LiteralPath $installedPython) { $installedPython } elseif ($pythonLookup) { $pythonLookup.Source } else { $null }
if (-not $pythonCommand) {
  throw 'Install Python 3.10+ from python.org, then run this script again.'
}

& $pythonCommand -m venv .venv
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r scripts\requirements.txt
Write-Host 'Local Whisper is ready. Its model is downloaded on the first transcription.'
