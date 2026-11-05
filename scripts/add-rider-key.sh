#!/usr/bin/env bash
# Attach a function-call access key that can ONLY call confirm_delivery.
# https://docs.near.org/protocol/accounts-contracts/access-keys
set -euo pipefail
: "${TRUSTLOCK_RIDER_ACCOUNT:?}"
: "${TRUSTLOCK_CONTRACT_ID:?}"
echo "Adding a confirm_delivery-only key on ${TRUSTLOCK_RIDER_ACCOUNT}"
echo "The public key should be created on the rider phone / near CLI, not pasted into git."
cat <<'EOF'
near add-key "$TRUSTLOCK_RIDER_ACCOUNT" <PUBLIC_KEY> \
  --allowance 0.25 \
  --receiverId "$TRUSTLOCK_CONTRACT_ID" \
  --methodNames confirm_delivery \
  --accountId "$TRUSTLOCK_RIDER_ACCOUNT"
EOF
