# TrustLock PowerShell Helper Script
# Run this at the start of each PowerShell session to set up the environment

Write-Host "TrustLock Environment Setup" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# Add Rust to PATH if installed
$rustPath = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $rustPath) {
    $env:PATH = "$rustPath;$env:PATH"
    Write-Host "✓ Rust/Cargo added to PATH" -ForegroundColor Green
}

# Check tool versions
Write-Host ""
Write-Host "Checking installed tools:" -ForegroundColor Yellow

# Python
try {
    $v = python --version 2>&1
    Write-Host "✓ Python: $v" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found" -ForegroundColor Red
}

# Node.js
try {
    $v = node --version
    Write-Host "✓ Node.js: $v" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found" -ForegroundColor Red
}

# npm
try {
    $v = npm --version
    Write-Host "✓ npm: $v" -ForegroundColor Green
} catch {
    Write-Host "✗ npm not found" -ForegroundColor Red
}

# Rust
try {
    $v = rustc --version
    Write-Host "✓ Rust: $v" -ForegroundColor Green
} catch {
    Write-Host "✗ Rust not found" -ForegroundColor Red
}

# Cargo
try {
    $v = cargo --version
    Write-Host "✓ Cargo: $v" -ForegroundColor Green
} catch {
    Write-Host "✗ Cargo not found" -ForegroundColor Red
}

# near-cli
try {
    $v = near --version
    Write-Host "✓ near-cli: $v" -ForegroundColor Green
} catch {
    Write-Host "✗ near-cli not found" -ForegroundColor Red
}

Write-Host ""
Write-Host "Environment ready!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Working commands:" -ForegroundColor Yellow
Write-Host "  - cargo check --target wasm32-unknown-unknown" -ForegroundColor White
Write-Host "  - cargo test" -ForegroundColor White
Write-Host "  - near --help" -ForegroundColor White
Write-Host "  - node --version" -ForegroundColor White
Write-Host "  - python --version" -ForegroundColor White
