# Runs the iPhotos ML service natively on the Windows host with DirectML
# (any DirectX 12 GPU — the working AMD GPU path when ROCm is unavailable,
# e.g. RDNA2 cards like the RX 6700 XT under WSL2, doc 18 §4.2/§14).
#
#   powershell -ExecutionPolicy Bypass -File ml\start-host-directml.ps1
#
# First run creates .venv and installs dependencies (insightface builds a small
# Cython extension — needs "Desktop development with C++" from Visual Studio
# Build Tools if not already installed). The service listens on 0.0.0.0:5207.
#
# Supervisor loop: the AMD DirectML driver has been crashing the process with
# access violations (0xC0000005 in amdxc64.dll, see Windows Event Log). The
# loop restarts the service a few seconds after every death and appends each
# exit code to ml\crash-log.txt, so driver crashes cost seconds of downtime
# instead of a dead service. Ctrl+C stops the loop.

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

$crashLog = "$root\crash-log.txt"
$crashLimit = 3
$consecutiveCrashes = 0
while ($true) {
    & "$root\.venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 5207 --app-dir "$root\app"
    $code = $LASTEXITCODE
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $crashLog -Value ("[$stamp] uvicorn exited with code $code (0x{0:X}) - restarting in 5s" -f $code)
    # Access violations (0xC0000005 in amdxc64.dll) kill the process before the
    # in-service CPU fallback can react. After a few in a row, give up on
    # DirectML for this supervisor run and serve on CPU until it is restarted.
    if ($code -eq -1073741819) {
        $consecutiveCrashes++
        if ($consecutiveCrashes -ge $crashLimit -and $env:ML_EXECUTION_PROVIDER -ne "cpu") {
            $env:ML_EXECUTION_PROVIDER = "cpu"
            Add-Content -Path $crashLog -Value "[$stamp] $consecutiveCrashes consecutive driver crashes - falling back to ML_EXECUTION_PROVIDER=cpu"
        }
    } else {
        $consecutiveCrashes = 0
    }
    Start-Sleep -Seconds 5
}
