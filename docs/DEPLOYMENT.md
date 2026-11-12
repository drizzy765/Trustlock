# TrustLock Testnet Deployment Guide

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
   TRUSTLOCK_USDC_ACCOUNT=usdc.fakes.testnet
   TRUSTLOCK_OWNER_ACCOUNT=timi.testnet
   ```

## Step 1: Build Contract

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

## Step 4: Initialize Contract

```powershell
near call trustlock-timi.testnet new `
  '{"usdc":"usdc.fakes.testnet"}' `
  --accountId trustlock-timi.testnet
```

## Step 5: Create Test Accounts

```powershell
# Buyer account
near create-account buyer-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 5

# Seller account
near create-account seller-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 5

# Rider account
near create-account rider-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 2
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

```powershell
near call trustlock-timi.testnet create_deal `
  '{
    "seller": "seller-timi.testnet",
    "rider": "rider-timi.testnet",
    "buyer": "buyer-timi.testnet",
    "item": "black sandal",
    "price": "2500000000",
    "deadline_ms": 86400000,
    "qr_hash": "0000000000000000000000000000000000000000000000000000000000000001"
  }' `
  --accountId buyer-timi.testnet `
  --deposit 0.1
```

### 8.2 Fund the Deal

```powershell
# First, get USDC test tokens from faucet if available
# Then fund the deal:
near call usdc.fakes.testnet ft_transfer_call `
  '{
    "receiver_id": "trustlock-timi.testnet",
    "amount": "2500000000",
    "msg": "1"
  }' `
  --accountId buyer-timi.testnet `
  --deposit 0.000000000000000000000001
```

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
# Check seller balance increased
near view usdc.fakes.testnet ft_balance_of `
  '{"account_id": "seller-timi.testnet"}'

# Check deal status is Released
near view trustlock-timi.testnet get_deal `
  '{"deal_id": 1}'
```

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

- [ ] Contract deployed and initialized
- [ ] Can create deals
- [ ] Can fund deals with USDC
- [ ] Rider key can only call `confirm_delivery`
- [ ] Rider key cannot call other methods
- [ ] Double QR scan fails with ERR_REPLAYED_QR
- [ ] Seller receives tokens after rider confirms
- [ ] All transactions visible on testnet explorer

## Explorer Links

- Testnet Explorer: https://testnet.nearblocks.io
- Search for your contract: `trustlock-timi.testnet`
- View all transactions and state
