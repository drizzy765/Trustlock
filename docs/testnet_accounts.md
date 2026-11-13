# Testnet Accounts — TrustLock

## Deployed Contract (v2 — current)

**Contract ID:** `trustlock-v2-timi.testnet`  
**Network:** NEAR Testnet  
**Contract ID:** `trustlock-v2-timi.testnet`  
**Network:** NEAR Testnet  
**Status:** ✅ **DEPLOYED AND INITIALIZED**

v2 adds: payout/refund retry restore, owner-or-arbiter `resolve_dispute`,
buyer `claim_dispute_timeout_refund` after `DISPUTE_WINDOW_MS` (7 days),
`disputed_at_ms` tracking, and the `sha256_hex` rename. No state was
migrated: v1 (`trustlock-timi.testnet`) and its recorded tx hashes stay as
history below. The on-chain code was verified byte-identical to this branch
(sha256 matches code hash `HbubgDJrKngoPvYz76qGJDA3b6kBiDCGjY1zrSKz44hS`),
so no redeploy was needed.

### Deployment + init (single `with-init-call new` transaction)

- **Transaction:** https://testnet.nearblocks.io/txns/G5Yh8kmEDVRxNJQgPeL2eNRzA8N5GBBuSUsCahJFdG26
- **Init args:** `{"usdc": "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af", "arbiter": "timi.testnet"}`

### USDC storage deposit (escrow registered as a token holder)

- **Transaction:** https://testnet.nearblocks.io/txns/CzahibtFa1gLrMhhdXRhR82JaCNjXuWqSpvTNdUVuPcj
- **Account:** `trustlock-v2-timi.testnet` registered on the USDC token

### Rider function-call key (v2, `confirm_delivery`-only)

- **Public key:** `ed25519:9TEAAbYk8SwLf8kDaKPaFAo8VLaBbgM9QihLfGFJp1dG`
- **Transaction:** https://testnet.nearblocks.io/txns/Gm5Mf6KwtnABRKymrMf62UD81zNXCurYVzXmpdh4oeid
- **Permission:** FunctionCall, receiver `trustlock-v2-timi.testnet`,
  methods `["confirm_delivery"]`, allowance 0.25 NEAR (same shape as the
  v1 key; keys are receiver-bound so v1 keys do not carry over)

## Deployed Contract (v1 — history)

Deals 1–3 live here. Kept for history; new deals go to v2.

**Contract ID:** `trustlock-timi.testnet`  
**Network:** NEAR Testnet  
**Status:** ✅ **DEPLOYED AND INITIALIZED** (kept as history; Phase 2 runs on v2)

### Deployment
- **Transaction:** https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo
- **Block:** FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo

### Initialization
- **Transaction:** https://testnet.nearblocks.io/txns/Hxj95EAEmcNKg245LHTMfXJNJWCqzqVT6p7Ae3Cg6thG
- **Block:** Hxj95EAEmcNKg245LHTMfXJNJWCqzqVT6p7Ae3Cg6thG
- **Token Contract:** `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`
  - Symbol: USDC
  - Version: ft-1.0.0
  - Decimals: 6

## Test Accounts

| Role | Account | Status | Notes |
|------|---------|--------|-------|
| Owner | `timi.testnet` | ✅ Created | Contract owner, has full access |
| Seller | `seller-timi.testnet` | ✅ Created | Receives escrow payouts |
| Buyer | `buyer-timi.testnet` | ✅ Created | Creates deals, funds escrow. Has 20 test USDC from Circle Faucet |
| Rider | `rider-timi.testnet` | ✅ Created | Confirms delivery (needs restricted key) |

### Token Balances
- `buyer-timi.testnet`: 20 USDC (from Circle Faucet)
- `seller-timi.testnet`: 0 USDC (will receive after delivery)

## Token Contract Details

**USDC Token:** `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`

Verify metadata:
```bash
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af ft_metadata
```

Expected output:
```json
{
  "spec": "ft-1.0.0",
  "name": "USDC",
  "symbol": "USDC",
  "icon": null,
  "reference": null,
  "reference_hash": null,
  "decimals": 6
}
```

## Rider Key Setup

⚠️ **REQUIRED:** Add restricted function-call key to rider account.
Use the documented scripts (near-cli-rs, not the legacy JS CLI) — see
`scripts/add-rider-key.ps1` / `scripts/add-rider-key.sh` for the exact commands.

```powershell
# Recommended: the keypair is created on the rider device; only the PUBLIC key is supplied here.
.\scripts\add-rider-key.ps1 -PublicKey ed25519:REPLACE_WITH_RIDER_PUBLIC_KEY

# Demo fallback: generate on this machine (private key stays in your OS keychain, never in git).
.\scripts\add-rider-key.ps1 -Generate
```

Under the hood the script runs (exact near-cli-rs syntax):

```powershell
near account add-key rider-timi.testnet `
  grant-function-call-access `
    --allowance '0.25 NEAR' `
    --contract-account-id trustlock-v2-timi.testnet `
    --function-names confirm_delivery `
  use-manually-provided-public-key ed25519:REPLACE_WITH_RIDER_PUBLIC_KEY `
  network-config testnet `
  sign-with-keychain `
  send
```

Then it verifies (read-only) that the key is confined:

```powershell
near account list-keys rider-timi.testnet network-config testnet now
# Expected row for the new key (key value differs per run):
# | ed25519:... | <nonce> | only do ["confirm_delivery"] function calls
#                  on trustlock-v2-timi.testnet with an allowance of 0.250 NEAR |
```

Reference (v1): a key with exactly this permission shape was added by hand
(tx `AL3eNPhtDesAfhFBogY4w66KC4HFNzaFFNxn5exf1VE`) and confirmed live via
`view_access_key_list` on `rider-timi.testnet` (block 277532777):
public key `ed25519:FsaTX1yvCRyMRkasgrbEAhRSeY5AqUqBYd2p7ebynaNy`,
`FunctionCall: { allowance: "250000000000000000000000" (= 0.25 NEAR),
method_names: ["confirm_delivery"], receiver_id: "trustlock-timi.testnet" }`.
New v2 keys must match exactly this shape with the v2 receiver (keys are
receiver-bound, so v1 keys do not carry over).

## Environment Variables

Update your `.env` file (copy from `.env.example`):

```
# Network
NEAR_NETWORK=testnet
NEAR_NODE_URL=https://rpc.testnet.near.org

# Contract v2 - deployed (see "Deployed Contract (v2)" above)
TRUSTLOCK_CONTRACT_ID=trustlock-v2-timi.testnet
TRUSTLOCK_USDC_ACCOUNT=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af

# Accounts (your testnet accounts)
TRUSTLOCK_OWNER_ACCOUNT=timi.testnet
TRUSTLOCK_SELLER_ACCOUNT=seller-timi.testnet
TRUSTLOCK_BUYER_ACCOUNT=buyer-timi.testnet
TRUSTLOCK_RIDER_ACCOUNT=rider-timi.testnet

# Frontend
NEXT_PUBLIC_AGENT_URL=http://localhost:8080
NEXT_PUBLIC_CONTRACT_ID=trustlock-v2-timi.testnet
NEXT_PUBLIC_USDC_CONTRACT=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
NEXT_PUBLIC_NETWORK=testnet
NEXT_PUBLIC_APP_MODE=demo
```

⚠️ **IMPORTANT:** Create `.env` from `.env.example` locally. Never commit `.env` to git.

## Verification Commands

```bash
# Check contract exists and is initialized
near view trustlock-timi.testnet get_deal '{"deal_id": 0}'
# Should return: null (no deals yet, but contract responds)

# Check buyer USDC balance
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af ft_balance_of '{"account_id": "buyer-timi.testnet"}'
# Should return: "20000000" (20 USDC with 6 decimals)

# Check contract USDC balance (should be 0 initially)
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af ft_balance_of '{"account_id": "trustlock-timi.testnet"}'
```

## Next Steps

### Before Running E2E Flow:

⚠️ **CRITICAL: Check storage registration requirements**

The escrow contract and seller may need NEP-141 storage registration. Check:

```bash
# Check if seller is registered with token
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_balance_of '{"account_id": "seller-timi.testnet"}'

# If null, seller needs to register
near call 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_deposit '{"account_id": "seller-timi.testnet", "registration_only": true}' --accountId seller-timi.testnet --deposit 0.00125

# Same for escrow contract
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_balance_of '{"account_id": "trustlock-timi.testnet"}'

near call 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_deposit '{"account_id": "trustlock-timi.testnet", "registration_only": true}' --accountId trustlock-timi.testnet --deposit 0.00125
```

### End-to-End Flow (TO BE RUN):

1. [ ] Create deal
2. [ ] Fund deal with USDC
3. [ ] Verify deal is Funded
4. [ ] Rider confirms delivery with QR
5. [ ] Verify seller received USDC

**Do NOT document E2E as complete until actually run!**

## Links

- **Contract:** https://testnet.nearblocks.io/address/trustlock-timi.testnet
- **Deployment TX:** https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo
- **Initialization TX:** https://testnet.nearblocks.io/txns/Hxj95EAEmcNKg245LHTMfXJNJWCqzqVT6p7Ae3Cg6thG
- **USDC Token:** https://testnet.nearblocks.io/address/3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af

## Notes

- ✅ Contract deployed and initialized
- ✅ Test accounts created
- ✅ Buyer has 20 USDC from Circle Faucet
- ⏳ Rider key needs to be set up (restricted to confirm_delivery)
- ⏳ Storage registration may be needed (check before E2E)
- ⏳ E2E flow NOT yet run (do not claim as complete)
