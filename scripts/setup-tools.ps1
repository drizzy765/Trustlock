# Setup script for TrustLock development environment
# Run this in PowerShell
# This laptop is weak - installs are minimal

Write-Host "=== TrustLock Development Environment Setup ===" -ForegroundColor Cyan
Write-Host "This is a SOLO project by Agoro Oluwatimilehin (Timi)" -ForegroundColor Yellow
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")
if (-not $isAdmin) {
    Write-Host "WARNING: Not running as Administrator. Some installs may fail." -ForegroundColor Yellow
}

# 1. Check Python (should already be installed)
Write-Host ""
Write-Host "[1/5] Checking Python..." -ForegroundColor Green
try {
    $pyVersion = python --version 2>&1
    Write-Host "Found: $pyVersion" -ForegroundColor Green
} catch {
    Write-Host "Python not found. Installing via winget..." -ForegroundColor Yellow
    winget install Python.Python.3.11
}

# 2. Check Node.js (should already be installed)
Write-Host ""
Write-Host "[2/5] Checking Node.js..." -ForegroundColor Green
try {
    $nodeVersion = node --version
    $npmVersion = npm --version
    Write-Host "Found: Node $nodeVersion, npm $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "Node.js not found. Please install from https://nodejs.org/ (LTS version)" -ForegroundColor Red
    exit 1
}

# 3. Install Rust
Write-Host ""
Write-Host "[3/5] Installing Rust..." -ForegroundColor Green
$rustupPath = "$env:USERPROFILE\.cargo\bin\rustc.exe"
if (Test-Path $rustupPath) {
    Write-Host "Rust already installed. Checking version..." -ForegroundColor Green
    & "$env:USERPROFILE\.cargo\bin\rustc.exe" --version
} else {
    Write-Host "Downloading rustup..." -ForegroundColor Yellow
    $rustupUrl = "https://win.rustup.rs/x86_64"
    $rustupInstaller = "$env:TEMP\rustup-init.exe"
    
    try {
        Invoke-WebRequest -Uri $rustupUrl -OutFile $rustupInstaller -UseBasicParsing
        Write-Host "Installing Rust (this may take a while on a weak laptop)..." -ForegroundColor Yellow
        & $rustupInstaller -y --default-toolchain stable
        
        # Add to PATH for current session
        $env:PATH = "$env:PATH;$env:USERPROFILE\.cargo\bin"
        
        Write-Host "Rust installed successfully!" -ForegroundColor Green
    } catch {
        Write-Host "Failed to download/install Rust. Please install manually from https://rustup.rs/" -ForegroundColor Red
        exit 1
    }
}

# 4. Add wasm32 target for NEAR contracts
Write-Host ""
Write-Host "[4/5] Adding wasm32-unknown-unknown target..." -ForegroundColor Green
try {
    rustup target add wasm32-unknown-unknown
    Write-Host "wasm32 target added!" -ForegroundColor Green
} catch {
    Write-Host "Failed to add wasm32 target. You may need to restart PowerShell and run: rustup target add wasm32-unknown-unknown" -ForegroundColor Yellow
}

# 5. Install cargo-near
Write-Host ""
Write-Host "[5/5] Installing cargo-near..." -ForegroundColor Green
try {
    cargo install cargo-near
    Write-Host "cargo-near installed!" -ForegroundColor Green
} catch {
    Write-Host "Failed to install cargo-near. Will retry after restart." -ForegroundColor Yellow
}

# 6. Install near-cli via npm (easier than building from source)
Write-Host ""
Write-Host "[6/5] Installing near-cli via npm..." -ForegroundColor Green
try {
    npm install -g near-cli
    Write-Host "near-cli installed!" -ForegroundColor Green
} catch {
    Write-Host "Failed to install near-cli. You may need to run: npm install -g near-cli" -ForegroundColor Yellow
}

# Verify installation
Write-Host ""
Write-Host "=== Verification ===" -ForegroundColor Cyan
Write-Host "Checking installed versions..." -ForegroundColor Yellow

# Python
try {
    $v = python --version 2>&1
    Write-Host "OK Python: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING Python" -ForegroundColor Red
}

# Node
try {
    $v = node --version
    Write-Host "OK Node: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING Node" -ForegroundColor Red
}

# npm
try {
    $v = npm --version
    Write-Host "OK npm: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING npm" -ForegroundColor Red
}

# Rust
try {
    $v = rustc --version
    Write-Host "OK Rust: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING Rust" -ForegroundColor Red
}

# Cargo
try {
    $v = cargo --version
    Write-Host "OK Cargo: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING Cargo" -ForegroundColor Red
}

# cargo-near
try {
    $v = cargo near --version
    Write-Host "OK cargo-near: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING cargo-near" -ForegroundColor Red
}

# near-cli
try {
    $v = near --version
    Write-Host "OK near-cli: $v" -ForegroundColor Green
} catch {
    Write-Host "MISSING near-cli" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Setup Complete ===" -ForegroundColor Cyan
Write-Host "If any tools show MISSING, restart PowerShell and run this script again." -ForegroundColor Yellow
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Green
Write-Host "  1. cd contract; cargo check --quiet" -ForegroundColor White
Write-Host "  2. cd agent; python -m venv .venv; .venv\Scripts\Activate.ps1; pip install -r requirements.txt" -ForegroundColor White
Write-Host "  3. cd web; npm install" -ForegroundColor White
