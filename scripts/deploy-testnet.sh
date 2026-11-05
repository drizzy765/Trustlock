#!/usr/bin/env bash
# Deploy the TrustLock contract to NEAR testnet.
# Requires cargo-near and a logged-in near CLI. Never echo a private key.
set -euo pipefail
cd "$(dirname "$0")/../contract"
: "${TRUSTLOCK_CONTRACT_ID:?set TRUSTLOCK_CONTRACT_ID}"
: "${TRUSTLOCK_USDC_ACCOUNT:?set TRUSTLOCK_USDC_ACCOUNT}"
echo "Building wasm (this is slow on a weak laptop)..."
cargo near build --release
echo "Deploying to ${TRUSTLOCK_CONTRACT_ID} (you will be prompted to sign)."
cargo near deploy "${TRUSTLOCK_CONTRACT_ID}" init '{}' -- \
  || echo "If init failed because the contract is already live, call new() once manually:"
echo "near call ${TRUSTLOCK_CONTRACT_ID} new '{\"usdc\":\"${TRUSTLOCK_USDC_ACCOUNT}\"}' --accountId ${TRUSTLOCK_CONTRACT_ID}"
