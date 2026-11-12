# Testnet Accounts — TrustLock

## Deployed Contract

**Contract ID:** `trustlock-timi.testnet`  
**Network:** NEAR Testnet  
**Status:** ✅ Deployed (not yet initialized)  
**Deployment Transaction:** `FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo`

**Explorer:** https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo

## Contract Initialization (PENDING)

⚠️ **DO NOT INITIALIZE YET** — `usdc.fakes.testnet` is a placeholder. Need to identify a real testnet NEP-141 token contract first.

### Real Testnet Tokens to Consider

| Token | Contract ID | Notes |
|-------|-------------|-------|
| USDC (testnet) | `usdc.testnet` | Check if exists |
| NEAR | `wrap.near` | wNEAR on testnet |
| Custom | Deploy own | Create simple NEP-141 |

### Initialization Command (When Ready)

```powershell
near call trustlock-timi.testnet new `
  '{"usdc":"REAL_TOKEN_CONTRACT.testnet"}' `
  --accountId trustlock-timi.testnet
```

## Required Test Accounts

Create these accounts for E2E testing:

| Role | Account | Purpose |
|------|---------|---------|
| Owner | `timi.testnet` | Contract owner, has full access |
| Seller | `seller-timi.testnet` | Receives escrow payouts |
| Buyer | `buyer-timi.testnet` | Creates deals, funds escrow |
| Rider | `rider-timi.testnet` | Confirms delivery (restricted key) |

### Create Accounts

```powershell
# Seller
near create-account seller-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 5

# Buyer
near create-account buyer-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 5

# Rider
near create-account rider-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 2
```

## Rider Key Setup

After rider account created, add restricted function-call key:

```powershell
# Generate key
near generate-key rider-timi.testnet

# Get public key
near keys rider-timi.testnet

# Add restricted key (replace <PUBLIC_KEY>)
near add-key rider-timi.testnet <PUBLIC_KEY> `
  --allowance 0.25 `
  --receiverId trustlock-timi.testnet `
  --methodNames confirm_delivery `
  --accountId rider-timi.testnet
```

## Environment Variables

Update your `.env` file:

```
TRUSTLOCK_CONTRACT_ID=trustlock-timi.testnet
TRUSTLOCK_USDC_ACCOUNT=usdc.fakes.testnet  # TODO: Replace with real token
TRUSTLOCK_OWNER_ACCOUNT=timi.testnet
TRUSTLOCK_SELLER_ACCOUNT=seller-timi.testnet
TRUSTLOCK_BUYER_ACCOUNT=buyer-timi.testnet
TRUSTLOCK_RIDER_ACCOUNT=rider-timi.testnet
```

## Next Steps

1. [ ] Find real testnet NEP-141 token
2. [ ] Initialize contract with real token
3. [ ] Create test accounts (buyer, seller, rider)
4. [ ] Add rider restricted key
5. [ ] Test end-to-end flow

## Links

- **Contract:** https://testnet.nearblocks.io/address/trustlock-timi.testnet
- **Deployment TX:** https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo
