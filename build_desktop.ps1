param(
  [switch]$Clean
)

# Ensure venv
if (-not (Test-Path ".\.venv\Scripts\Activate.ps1")) {
  Write-Host "Python venv not found. Please create it first (python -m venv .venv) and install requirements." -ForegroundColor Yellow
  exit 1
}

. .\.venv\Scripts\Activate.ps1

# Optional clean
if ($Clean) {
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue dist, build, *.spec
}

# Install pyinstaller if missing
if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
  pip install --upgrade pip
  pip install pyinstaller
}

# Common PyInstaller args
$specName = "ChatUI"
$iconArg = @()
if (Test-Path ".\assets\icon.ico") {
  $iconArg = @("--icon", "assets/icon.ico")
}

# Data files to bundle (frontend and optional assets)
# Format: SRC;DEST (DEST is relative inside the app bundle)
$dataArgs = @("--add-data", "frontend;frontend")
if (Test-Path ".\assets") {
  $dataArgs += @("--add-data", "assets;assets")
}

# Build
pyinstaller --noconfirm --windowed --onefile `
  --name $specName `
  @iconArg `
  @dataArgs `
  desktop.py

if ($LASTEXITCODE -eq 0) {
  Write-Host "Build successful. Output file: dist\$specName.exe" -ForegroundColor Green
} else {
  Write-Host "Build failed with exit code $LASTEXITCODE." -ForegroundColor Red
  exit $LASTEXITCODE
}
