#!/usr/bin/env bash
# TrustLock rider key setup (near-cli-rs, NOT the legacy JS near-cli).
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
#     near account add-key rider-timi.testnet \
#       grant-function-call-access \
#         --allowance '0.25 NEAR' \
#         --contract-account-id trustlock-timi.testnet \
#         --function-names confirm_delivery \
#       use-manually-provided-public-key ed25519:REPLACE_WITH_RIDER_PUBLIC_KEY \
#       network-config testnet \
#       sign-with-keychain \
#       send
#
#   Autogenerate on this machine (fallback for demos: the private key is saved
#   to THIS machine's OS keychain by near-cli-rs, never into the repo):
#     near account add-key rider-timi.testnet \
#       grant-function-call-access \
#         --allowance '0.25 NEAR' \
#         --contract-account-id trustlock-timi.testnet \
#         --function-names confirm_delivery \
#       autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain \
#       network-config testnet \
#       sign-with-keychain \
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
# and the public key are echoed. The signer (you) authorizes the transaction in
# your OS keychain when near-cli-rs prompts.
#
# If your rider key was created with the legacy JS CLI (`near login`), replace
# sign-with-keychain with sign-with-legacy-keychain (see --sign-with).
set -euo pipefail

RIDER_ACCOUNT="${TRUSTLOCK_RIDER_ACCOUNT:-rider-timi.testnet}"
CONTRACT_ID="${TRUSTLOCK_CONTRACT_ID:-trustlock-timi.testnet}"
NETWORK="${NEAR_NETWORK:-testnet}"
ALLOWANCE="0.25 NEAR"
METHODS="confirm_delivery"
SIGN_WITH="${TRUSTLOCK_SIGN_WITH:-sign-with-keychain}"

usage() {
    cat <<EOF
Usage:
  TRUSTLOCK_RIDER_ACCOUNT=rider-timi.testnet \
  TRUSTLOCK_CONTRACT_ID=trustlock-timi.testnet \
    $0 (--public-key ed25519:... | --generate) [--sign-with sign-with-legacy-keychain]

Options:
  --public-key KEY   Add this existing rider public key (recommended: the
                     keypair lives on the rider device; only the public key
                     is supplied here). Can also be passed via RIDER_PUBLIC_KEY.
  --generate         Generate a fresh keypair with near-cli-rs and store it in
                     this machine's OS keychain (demo fallback; afterwards
                     install the private key on the rider device yourself).
  --sign-with MODE   near-cli-rs signer: sign-with-keychain (default, from
                     \`near login\`) or sign-with-legacy-keychain (old JS CLI
                     credentials in ~/.near-credentials).
  -h, --help         Show this help.
EOF
}

PUBLIC_KEY="${RIDER_PUBLIC_KEY:-}"
GENERATE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --public-key)
            PUBLIC_KEY="${2:?--public-key needs a value}"; shift 2 ;;
        --generate)
            GENERATE=1; shift ;;
        --sign-with)
            SIGN_WITH="${2:?--sign-with needs a value}"; shift 2 ;;
        -h|--help)
            usage; exit 0 ;;
        *)
            echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 1 ;;
    esac
done

if [ "$GENERATE" -eq 1 ] && [ -n "$PUBLIC_KEY" ]; then
    echo "ERROR: pass either --public-key or --generate, not both." >&2
    exit 1
fi
if [ "$GENERATE" -eq 0 ] && [ -z "$PUBLIC_KEY" ]; then
    echo "ERROR: pass --public-key ed25519:... or --generate." >&2
    usage >&2
    exit 1
fi
if [ -n "$PUBLIC_KEY" ] && [[ "$PUBLIC_KEY" != ed25519:* ]]; then
    echo "ERROR: public key must look like ed25519:... (got: $PUBLIC_KEY)" >&2
    exit 1
fi

# 1. Require near-cli-rs (the legacy JS CLI has no `account` subcommand).
if ! near account --help >/dev/null 2>&1; then
    echo "ERROR: near-cli-rs not found (this script needs the Rust CLI, not the legacy JS near-cli)." >&2
    echo "Install: https://github.com/near/near-cli-rs#install" >&2
    exit 1
fi

echo "Rider account : $RIDER_ACCOUNT"
echo "Contract      : $CONTRACT_ID"
echo "Network       : $NETWORK"
echo "Allowance     : $ALLOWANCE"
echo "Method        : $METHODS"
echo ""

if [ "$GENERATE" -eq 1 ]; then
    echo "Generating a fresh rider keypair (private key stays in your OS keychain)..."
    set +e
    ADD_OUT="$(near account add-key "$RIDER_ACCOUNT" \
        grant-function-call-access \
            --allowance "$ALLOWANCE" \
            --contract-account-id "$CONTRACT_ID" \
            --function-names "$METHODS" \
        autogenerate-new-keypair --signature-scheme ed25519 save-to-keychain \
        network-config "$NETWORK" \
        "$SIGN_WITH" \
        send 2>&1)"
    ADD_STATUS=$?
    set -e
    echo "$ADD_OUT"
    if [ "$ADD_STATUS" -ne 0 ]; then
        echo "ERROR: add-key failed with exit $ADD_STATUS (output above)." >&2
        exit "$ADD_STATUS"
    fi
    PUBLIC_KEY="$(echo "$ADD_OUT" | grep -o -m 1 'ed25519:[A-Za-z0-9]\+' || true)"
    if [ -z "$PUBLIC_KEY" ]; then
        echo "ERROR: key added but the new public key could not be read from the output above." >&2
        echo "Run the verify step manually: near account list-keys $RIDER_ACCOUNT network-config $NETWORK now" >&2
        exit 1
    fi
    echo ""
    echo "New rider public key: $PUBLIC_KEY"
    echo "WARNING: the private key is in THIS machine's OS keychain. Install it on the"
    echo "rider device before use; prefer --public-key mode so the private key never"
    echo "leaves the rider device."
else
    echo "Adding supplied public key: $PUBLIC_KEY"
    near account add-key "$RIDER_ACCOUNT" \
        grant-function-call-access \
            --allowance "$ALLOWANCE" \
            --contract-account-id "$CONTRACT_ID" \
            --function-names "$METHODS" \
        use-manually-provided-public-key "$PUBLIC_KEY" \
        network-config "$NETWORK" \
        "$SIGN_WITH" \
        send
fi

# 2. Verify: list keys and require the exact confinement on the new key.
echo ""
echo "Verifying key confinement..."
set +e
KEYS_OUT="$(near account list-keys "$RIDER_ACCOUNT" network-config "$NETWORK" now 2>&1)"
KEYS_STATUS=$?
set -e
echo "$KEYS_OUT"
if [ "$KEYS_STATUS" -ne 0 ]; then
    echo "ERROR: list-keys failed with exit $KEYS_STATUS (output above)." >&2
    exit "$KEYS_STATUS"
fi
MATCH="$(echo "$KEYS_OUT" | grep -F "$PUBLIC_KEY" | grep -F "[\"$METHODS\"]" | grep -F "$CONTRACT_ID" || true)"
if [ -z "$MATCH" ]; then
    echo "ERROR: $PUBLIC_KEY is not confined to [\"$METHODS\"] on $CONTRACT_ID." >&2
    exit 1
fi
if ! echo "$MATCH" | grep -Eq '0\.250? NEAR'; then
    echo "ERROR: $PUBLIC_KEY does not show the 0.25 NEAR allowance." >&2
    exit 1
fi
echo ""
echo "OK: $PUBLIC_KEY can only do [\"$METHODS\"] on $CONTRACT_ID with 0.25 NEAR allowance."
