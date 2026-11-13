# TrustLock Rider Key Setup (PowerShell, near-cli-rs -- NOT the legacy JS near-cli)
#
# Attaches a function-call access key on the rider account that can ONLY call
# `confirm_delivery` on the escrow contract, with a 0.25 NEAR allowance.
# Matches the hand-added key (tx AL3eNPhtDesAfhFBogY4w66KC4HFNzaFFNxn5exf1fVE):
#   permission.FunctionCall = { allowance: "250000000000000000000000",
#                               method_names: ["confirm_delivery"],
#                               receiver_id: "trustlock-timi.testnet" }
#
# Exact commands this script runs (near-cli-rs syntax --
# https://github.com/near/near-cli-rs/blob/main/docs/GUIDE.en.md):
#
#   Manual public key (recommended: the keypair is created on the rider device
#   and only the PUBLIC key ever touches this machine):
#     near account add-key rider-timi.testnet `
#       grant-function-call-access `
#         --allowance '0.25 NEAR' `
#         --contract-account-id trustlock-timi.testnet `
#         --function-names confirm_delivery `
#       use-manually-provided-public-key ed25519:REPLACE_WITH_RIDER_PUBLIC_KEY `
#       network-config testnet `
#       sign-with-keychain `
#       send
#
#   Autogenerate on this machine (fallback for demos: the private key is saved
#   to THIS machine's OS keychain by near-cli-rs, never into the repo):
#     near account add-key rider-timi.testnet `
#       grant-function-call-access `
#         --allowance '0.25 NEAR' `
#         --contract-account-id trustlock-timi.testnet `
#         --function-names confirm_delivery `
#       autogenerate-new-keypair save-to-keychain `
#       network-config testnet `
#       sign-with-keychain `
#       send
#
#   Verify (read-only, no signature needed):
#     near account list-keys rider-timi.testnet network-config testnet now
#   Expected row for the new key (key value differs per run):
#     | ed25519:... | <nonce> | only do ["confirm_delivery"] function calls
#                      on trustlock-timi.testnet with an allowance of 0.250 NEAR |
#
# The script never writes a private key, seed phrase, or .near-credentials
# file into the repo. Nothing secret is committed or printed: only account IDs
# and the public key are echoed. You authorize the transaction in your OS
# keychain when near-cli-rs prompts.
#
# If your rider key was created with the legacy JS CLI (near login), pass
# -SignWith sign-with-legacy-keychain (old credentials in .near-credentials).
#
# Examples:
#   .\scripts\add-rider-key.ps1 -PublicKey ed25519:ABC...xyz
#   .\scripts\add-rider-key.ps1 -Generate
#   $env:TRUSTLOCK_RIDER_ACCOUNT = "rider-timi.testnet"; .\scripts\add-rider-key.ps1 -PublicKey ed25519:ABC...xyz -SignWith sign-with-legacy-keychain

param(
    [Parameter(Mandatory = $false)]
    [string]$RiderAccount = $(if ($env:TRUSTLOCK_RIDER_ACCOUNT) { $env:TRUSTLOCK_RIDER_ACCOUNT } else { "rider-timi.testnet" }),

    [Parameter(Mandatory = $false)]
    [string]$ContractId = $(if ($env:TRUSTLOCK_CONTRACT_ID) { $env:TRUSTLOCK_CONTRACT_ID } else { "trustlock-timi.testnet" }),

    [Parameter(Mandatory = $false)]
    [string]$Network = $(if ($env:NEAR_NETWORK) { $env:NEAR_NETWORK } else { "testnet" }),

    [Parameter(Mandatory = $false)]
    [string]$PublicKey = $env:RIDER_PUBLIC_KEY,

    [Parameter(Mandatory = $false)]
    [switch]$Generate,

    [Parameter(Mandatory = $false)]
    [string]$SignWith = $(if ($env:TRUSTLOCK_SIGN_WITH) { $env:TRUSTLOCK_SIGN_WITH } else { "sign-with-keychain" })
)

$ErrorActionPreference = "Stop"
$Allowance = "0.25 NEAR"
$Methods = "confirm_delivery"

if ($Generate -and $PublicKey) {
    Write-Host "ERROR: pass either -PublicKey or -Generate, not both." -ForegroundColor Red
    exit 1
}
if (-not $Generate -and -not $PublicKey) {
    Write-Host "ERROR: pass -PublicKey ed25519:... or -Generate." -ForegroundColor Red
    Write-Host 'Example: .\scripts\add-rider-key.ps1 -PublicKey ed25519:ABC...xyz'
    exit 1
}
if ($PublicKey -and -not $PublicKey.StartsWith("ed25519:")) {
    Write-Host "ERROR: public key must look like ed25519:... (got: $PublicKey)" -ForegroundColor Red
    exit 1
}

# 1. Require near-cli-rs (the legacy JS CLI has no `account` subcommand).
& near account --help > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: near-cli-rs not found (this script needs the Rust CLI, not the legacy JS near-cli)." -ForegroundColor Red
    Write-Host "Install on Windows: irm https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.ps1 | iex"
    Write-Host "Docs: https://github.com/near/near-cli-rs#install"
    exit 1
}

Write-Host "Rider account : $RiderAccount"
Write-Host "Contract      : $ContractId"
Write-Host "Network       : $Network"
Write-Host "Allowance     : $Allowance"
Write-Host "Method        : $Methods"
Write-Host ""

if ($Generate) {
    Write-Host "Generating a fresh rider keypair (private key stays in your OS keychain)..."
    $addArgs = @("account", "add-key", $RiderAccount,
        "grant-function-call-access",
            "--allowance", $Allowance,
            "--contract-account-id", $ContractId,
            "--function-names", $Methods,
        "autogenerate-new-keypair", "save-to-keychain",
        "network-config", $Network,
        $SignWith,
        "send")
    $addOut = (& near @addArgs 2>&1) -join "`n"
    Write-Host $addOut
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $m = [regex]::Match($addOut, "ed25519:[A-Za-z0-9]+")
    if (-not $m.Success) {
        Write-Host "ERROR: key added but the new public key could not be read from the output above." -ForegroundColor Red
        Write-Host "Run the verify step manually: near account list-keys $RiderAccount network-config $Network now"
        exit 1
    }
    $PublicKey = $m.Value
    Write-Host ""
    Write-Host "New rider public key: $PublicKey"
    Write-Host "WARNING: the private key is in THIS machine's OS keychain. Install it on the"
    Write-Host "rider device before use; prefer -PublicKey mode so the private key never"
    Write-Host "leaves the rider device."
}
else {
    Write-Host "Adding supplied public key: $PublicKey"
    $addArgs = @("account", "add-key", $RiderAccount,
        "grant-function-call-access",
            "--allowance", $Allowance,
            "--contract-account-id", $ContractId,
            "--function-names", $Methods,
        "use-manually-provided-public-key", $PublicKey,
        "network-config", $Network,
        $SignWith,
        "send")
    & near @addArgs
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

# 2. Verify: list keys and require the exact confinement on the new key.
Write-Host ""
Write-Host "Verifying key confinement..."
$keysOut = (& near account list-keys $RiderAccount network-config $Network now 2>&1) -join "`n"
Write-Host $keysOut
if ($LASTEXITCODE -ne 0) { exit 1 }
$row = $keysOut -split "`n" | Where-Object { $_.Contains($PublicKey) }
$ok = $false
foreach ($line in $row) {
    # NOTE: -like treats [ ] as wildcards, so use Contains for the literal '["confirm_delivery"]'.
    if ($line.Contains('["confirm_delivery"]') -and $line.Contains($ContractId) -and $line -match "0\.250? NEAR") {
        $ok = $true
    }
}
if (-not $ok) {
    Write-Host "ERROR: $PublicKey is not confined to [`"confirm_delivery`"] on $ContractId with 0.25 NEAR." -ForegroundColor Red
    exit 1
}
Write-Host ""
Write-Host "OK: $PublicKey can only do [`"confirm_delivery`"] on $ContractId with 0.25 NEAR allowance." -ForegroundColor Green
