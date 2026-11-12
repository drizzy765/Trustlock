# Testnet Accounts — TrustLock

## Deployed Contract

**Contract ID:** `trustlock-timi.testnet`  
**Network:** NEAR Testnet  
**Status:** ✅ **DEPLOYED AND INITIALIZED**

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

⚠️ **REQUIRED:** Add restricted function-call key to rider account

```powershell
# Generate key (if not already done)
near generate-key rider-timi.testnet

# Get the public key
near keys rider-timi.testnet

# Add restricted key - REPLACE <PUBLIC_KEY> with actual key from above
near add-key rider-timi.testnet <PUBLIC_KEY> `
  --allowance 0.25 `
  --receiverId trustlock-timi.testnet `
  --methodNames confirm_delivery `
  --accountId rider-timi.testnet
```

## Environment Variables

Update your `.env` file (copy from `.env.example`):

```
# Network
NEAR_NETWORK=testnet
NEAR_NODE_URL=https://rpc.testnet.near.org

# Contract - DEPLOYED AND INITIALIZED
TRUSTLOCK_CONTRACT_ID=trustlock-timi.testnet
TRUSTLOCK_USDC_ACCOUNT=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af

# Accounts (your testnet accounts)
TRUSTLOCK_OWNER_ACCOUNT=timi.testnet
TRUSTLOCK_SELLER_ACCOUNT=seller-timi.testnet
TRUSTLOCK_BUYER_ACCOUNT=buyer-timi.testnet
TRUSTLOCK_RIDER_ACCOUNT=rider-timi.testnet

# Frontend
NEXT_PUBLIC_AGENT_URL=http://localhost:8080
NEXT_PUBLIC_CONTRACT_ID=trustlock-timi.testnet
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
