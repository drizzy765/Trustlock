# TrustLock Rider Key Setup (PowerShell)
# Run this script to add a function-call access key for the rider

param(
    [Parameter(Mandatory=$true)]
    [string]$RiderAccount,
    
    [Parameter(Mandatory=$true)]
    [string]$ContractId,
    
    [Parameter(Mandatory=$false)]
    [string]$Allowance = "0.25"
)

Write-Host "TrustLock Rider Function-Call Key Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "This script will create a restricted access key for the rider." -ForegroundColor Yellow
Write-Host "The rider key can ONLY call 'confirm_delivery' on the contract." -ForegroundColor Yellow
Write-Host ""

# Validate NEAR CLI is available
$near = Get-Command near -ErrorAction SilentlyContinue
if (-not $near) {
    Write-Host "ERROR: near CLI not found. Please install near-cli:" -ForegroundColor Red
    Write-Host "  npm install -g near-cli" -ForegroundColor Gray
    exit 1
}

Write-Host "Step 1: The rider needs to generate a key pair" -ForegroundColor Green
Write-Host "Run this on the rider's device:" -ForegroundColor Gray
Write-Host "  near generate-key $RiderAccount" -ForegroundColor White
Write-Host ""

Write-Host "Step 2: Get the public key" -ForegroundColor Green
Write-Host "  near keys $RiderAccount" -ForegroundColor White
Write-Host ""

Write-Host "Step 3: Add the restricted key to the rider account" -ForegroundColor Green
Write-Host "Copy the public key and run:" -ForegroundColor Gray
Write-Host @"
  near add-key $RiderAccount <PUBLIC_KEY> `
    --allowance $Allowance `
    --receiverId $ContractId `
    --methodNames confirm_delivery `
    --accountId $RiderAccount
"@ -ForegroundColor White
Write-Host ""

Write-Host "Step 4: Verify the key restriction" -ForegroundColor Green
Write-Host "Try calling another method (should fail):" -ForegroundColor Gray
Write-Host "  near call $ContractId get_deal '{""deal_id"": 1}' " -ForegroundColor White
Write-Host "    --accountId $RiderAccount" -ForegroundColor White
Write-Host ""

Write-Host "Step 5: Test confirm_delivery (should work with valid QR)" -ForegroundColor Green
Write-Host "  near call $ContractId confirm_delivery '{""deal_id"": 1, ""qr_preimage_hex"": "..."}' " -ForegroundColor White
Write-Host "    --accountId $RiderAccount" -ForegroundColor White
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Security Notes:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "- Key allowance: $Allowance NEAR for gas only" -ForegroundColor Gray
Write-Host "- Method restriction: confirm_delivery ONLY" -ForegroundColor Gray
Write-Host "- The rider CANNOT:" -ForegroundColor Gray
Write-Host "  - Call any other contract method" -ForegroundColor Gray
Write-Host "  - Transfer funds directly" -ForegroundColor Gray
Write-Host "  - Access other riders' deals" -ForegroundColor Gray
Write-Host ""

Write-Host "Reference: https://docs.near.org/protocol/accounts-contracts/access-keys" -ForegroundColor Blue
