# Runs the iPhotos ML service natively on the Windows host with DirectML
# (any DirectX 12 GPU — the working AMD GPU path when ROCm is unavailable,
# e.g. RDNA2 cards like the RX 6700 XT under WSL2, doc 18 §4.2/§14).
#
#   powershell -ExecutionPolicy Bypass -File ml\start-host-directml.ps1
#
# First run creates .venv and installs dependencies (insightface builds a small
# Cython extension — needs "Desktop development with C++" from Visual Studio
# Build Tools if not already installed). The service listens on 0.0.0.0:5207.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

# Python 3.12: onnxruntime-directml and insightface wheels are solid there;
# newer hosts (3.13/3.14) may not have wheels yet.
if (-not (Test-Path "$root\.venv")) {
    py -3.12 -m venv "$root\.venv"
}

& "$root\.venv\Scripts\python.exe" -m pip install --upgrade pip
& "$root\.venv\Scripts\pip.exe" install -r "$root\requirements-directml.txt"

$env:ML_EXECUTION_PROVIDER = if ($env:ML_EXECUTION_PROVIDER) { $env:ML_EXECUTION_PROVIDER } else { "auto" }
$env:ML_API_KEY = if ($env:ML_API_KEY) { $env:ML_API_KEY } else { "change-me-ml-api-key" }
$env:ML_MODEL = "buffalo_l"

# insightface resolves <root>/models/<name>/*.onnx — reuse a local model cache;
# first download happens automatically into $root\.models on first start.
New-Item -ItemType Directory -Force -Path "$root\.models" | Out-Null
$env:INSIGHTFACE_ROOT = "$root\.models"

& "$root\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 5207 --app-dir "$root\app"
