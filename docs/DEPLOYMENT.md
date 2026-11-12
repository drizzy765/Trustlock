# TrustLock Testnet Deployment Guide

## Status

✅ **Contract Deployed:** `trustlock-timi.testnet`  
✅ **Contract Initialized:** With real NEP-141 USDC token  
✅ **Test Accounts Created:** buyer-timi, seller-timi, rider-timi  
✅ **Buyer Funded:** 20 USDC from Circle Faucet  
⏳ **Next:** Rider key setup → Storage registration → Run E2E

**Deployment Transaction:** https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo  
**Initialization Transaction:** https://testnet.nearblocks.io/txns/Hxj95EAEmcNKg245LHTMfXJNJWCqzqVT6p7Ae3Cg6thG

**USDC Token:** `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` (USDC, 6 decimals)

---

## Prerequisites

1. **NEAR CLI installed:**
   ```powershell
   npm install -g near-cli
   near --version
   ```

2. **Testnet account:**
   - Go to https://wallet.testnet.near.org
   - Create account (e.g., `timi.testnet`)
   - Save recovery phrase securely

3. **Environment variables** in `.env`:
   ```
   NEAR_NETWORK=testnet
   TRUSTLOCK_CONTRACT_ID=trustlock-timi.testnet
   TRUSTLOCK_USDC_ACCOUNT=3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af
   TRUSTLOCK_OWNER_ACCOUNT=timi.testnet
   TRUSTLOCK_SELLER_ACCOUNT=seller-timi.testnet
   TRUSTLOCK_BUYER_ACCOUNT=buyer-timi.testnet
   TRUSTLOCK_RIDER_ACCOUNT=rider-timi.testnet
   ```

## Step 1: Build Contract (Skip if Using Pre-built WASM)

```powershell
cd C:\path\to\trustlock
.\scripts\make.ps1 contract-build
```

Verify output:
- `target/wasm32-unknown-unknown/release/trustlock.wasm` should exist (~335KB)

## Step 2: Create Contract Account

```powershell
# Replace 'timi' with your testnet account name
near create-account trustlock-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 10
```

## Step 3: Deploy Contract

```powershell
near deploy trustlock-timi.testnet `
  target\wasm32-unknown-unknown\release\trustlock.wasm `
  --accountId trustlock-timi.testnet
```

## Step 4: Initialize Contract (DONE - Skip This)

⚠️ **ALREADY COMPLETED** - Contract initialized with real USDC token.

For reference only:
```powershell
# Initialize with real USDC token contract
near call trustlock-timi.testnet new `
  '{"usdc":"3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af"}' `
  --accountId trustlock-timi.testnet
```

## Step 5: Create Test Accounts (DONE)

✅ Accounts already created:
- `buyer-timi.testnet` - Has 20 USDC from Circle Faucet
- `seller-timi.testnet` - Will receive payouts
- `rider-timi.testnet` - Will confirm deliveries

For reference:
```powershell
near create-account buyer-timi.testnet --masterAccount timi.testnet --initialBalance 5
near create-account seller-timi.testnet --masterAccount timi.testnet --initialBalance 5
near create-account rider-timi.testnet --masterAccount timi.testnet --initialBalance 2
```

## Step 6: Add Rider Function-Call Key

```powershell
# Generate key for rider
near generate-key rider-timi.testnet

# Get the public key
near keys rider-timi.testnet

# Add restricted key (replace <PUBLIC_KEY> with actual key)
near add-key rider-timi.testnet <PUBLIC_KEY> `
  --allowance 0.25 `
  --receiverId trustlock-timi.testnet `
  --methodNames confirm_delivery `
  --accountId rider-timi.testnet
```

## Step 7: Update Environment

Edit `.env`:
```
TRUSTLOCK_CONTRACT_ID=trustlock-timi.testnet
TRUSTLOCK_SELLER_ACCOUNT=seller-timi.testnet
TRUSTLOCK_BUYER_ACCOUNT=buyer-timi.testnet
TRUSTLOCK_RIDER_ACCOUNT=rider-timi.testnet
```

## Step 8: Test the Flow

### 8.1 Create a Deal

⚠️ **Note:** `deadline_ms` must be **milliseconds since Unix epoch** (e.g., `1731432000000` for Nov 12 2024).

```powershell
# Calculate deadline: current time + 24 hours in milliseconds
# Use: (Get-Date).AddHours(24).ToUniversalTime().Ticks / 10000
# Or: [DateTimeOffset]::UtcNow.AddHours(24).ToUnixTimeMilliseconds()

$deadline = [DateTimeOffset]::UtcNow.AddHours(24).ToUnixTimeMilliseconds()

near call trustlock-timi.testnet create_deal `
  '{
    "seller": "seller-timi.testnet",
    "rider": "rider-timi.testnet",
    "buyer": "buyer-timi.testnet",
    "item": "black sandal",
    "price": "2500000",
    "deadline_ms": '"$deadline"',
    "qr_hash_hex": "0000000000000000000000000000000000000000000000000000000000000001"
  }' `
  --accountId buyer-timi.testnet `
  --deposit 0.1
```

**JSON Field Names (must match contract):**
- `seller` - Seller account ID
- `rider` - Rider account ID
- `buyer` - Buyer account ID
- `item` - Item description
- `price` - Price in token smallest units (USDC has 6 decimals, so 2.5 USDC = 2500000)
- `deadline_ms` - Unix timestamp in milliseconds
- `qr_hash_hex` - Hex string of 32-byte QR hash

### 8.2 Fund the Deal

⚠️ **Storage Registration Required:** Both seller and escrow contract may need storage registration first.

```powershell
# Check storage registration
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_balance_of '{"account_id": "seller-timi.testnet"}'
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_balance_of '{"account_id": "trustlock-timi.testnet"}'

# If null, register storage (do this once)
near call 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_deposit `
  '{"account_id": "seller-timi.testnet", "registration_only": true}' `
  --accountId buyer-timi.testnet `
  --deposit 0.00125

near call 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af storage_deposit `
  '{"account_id": "trustlock-timi.testnet", "registration_only": true}' `
  --accountId buyer-timi.testnet `
  --deposit 0.00125

# Now fund the deal (2.5 USDC = 2500000 with 6 decimals)
near call 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af ft_transfer_call `
  '{
    "receiver_id": "trustlock-timi.testnet",
    "amount": "2500000",
    "msg": "1"
  }' `
  --accountId buyer-timi.testnet `
  --deposit 0.000000000000000000000001
```

**USDC Token Contract:** `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`
**Price:** 2.5 USDC = 2500000 (6 decimals)

### 8.3 Check Deal Status

```powershell
near view trustlock-timi.testnet get_deal `
  '{"deal_id": 1}'
```

### 8.4 Rider Confirms Delivery

```powershell
near call trustlock-timi.testnet confirm_delivery `
  '{
    "deal_id": 1,
    "qr_preimage_hex": "0000000000000000000000000000000000000000000000000000000000000001"
  }' `
  --accountId rider-timi.testnet
```

### 8.5 Verify Payout

```powershell
# Check seller USDC balance increased
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af ft_balance_of `
  '{"account_id": "seller-timi.testnet"}'

# Check escrow contract USDC balance decreased
near view 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af ft_balance_of `
  '{"account_id": "trustlock-timi.testnet"}'

# Check deal status is Released
near view trustlock-timi.testnet get_deal `
  '{"deal_id": 1}'
```

Expected results:
- Seller balance: Should increase by 2500000
- Escrow balance: Should decrease by 2500000
- Deal status: Should be "Released"

## Troubleshooting

### "Contract method is not initialized"
Run Step 4 (Initialize) again.

### "Insufficient balance"
Add more NEAR to the account:
```powershell
near send timi.testnet buyer-timi.testnet 5
```

### "Invalid transaction"
Check JSON formatting - use single quotes on outside, double quotes inside.

### "Access key not found"
The rider key may not be properly added. Run Step 6 again.

## Verification Checklist

### Completed ✅
- [x] Contract deployed: `trustlock-timi.testnet`
- [x] Contract initialized with real USDC token
- [x] Test accounts created: buyer-timi, seller-timi, rider-timi
- [x] Buyer has 20 USDC from Circle Faucet

### Pending E2E Test ⏳
**DO NOT MARK AS COMPLETE UNTIL ACTUALLY RUN**

- [ ] Storage registration (if needed)
- [ ] Create deal with correct JSON field names
- [ ] Fund deal with correct amount (6 decimals)
- [ ] Verify deal status is Funded
- [ ] Rider key can only call `confirm_delivery`
- [ ] Rider confirms delivery
- [ ] Verify seller received tokens
- [ ] Verify deal status is Released
- [ ] Test: Double QR scan fails with ERR_REPLAYED_QR
- [ ] Test: Wrong rider key fails
- [ ] All transactions visible on testnet explorer

**Status:** E2E flow NOT yet run. Documentation prepared but not verified.

## Explorer Links

- Testnet Explorer: https://testnet.nearblocks.io
- Search for your contract: `trustlock-timi.testnet`
- View all transactions and state
