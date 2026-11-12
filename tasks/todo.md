# TrustLock Phase 3 Build Tasks

## ✅ COMPLETED

### Task 1: Wire wallet selector in web app
**Status:** ✅ COMPLETE
**Files Modified:**
- `web/lib/wallet.ts` - Wallet selector integration
- `web/lib/wallet-provider.tsx` - React context
- `web/app/layout.tsx` - Provider wrapper
- `web/app/pay/page.tsx` - Full pay page
- `web/app/scan/page.tsx` - Full scan page
- `web/app/dashboard/page.tsx` - Full dashboard

**Verification:**
- [x] Wallet selector installed and configured
- [x] Can connect testnet wallet
- [x] All three pages render with mode badges

---

### Task 2: Complete agent endpoints
**Status:** ✅ COMPLETE
**Files Modified:**
- `agent/app/main.py` - All endpoints implemented

**Verification:**
- [x] `POST /deals/draft` persists drafts with QR hash
- [x] `GET /deals/{id}` returns deal with metadata
- [x] `POST /intents/quote` with dry/live mode
- [x] `POST /intents/execute` with mode protection

---

### Task 3: Build /scan page
**Status:** ✅ COMPLETE
**Verification:**
- [x] QR input (text area for demo)
- [x] Rider wallet connection
- [x] Mode selection (demo/dry/live)
- [x] Transaction result display

---

### Task 4: Build /dashboard page
**Status:** ✅ COMPLETE
**Verification:**
- [x] Stats cards (total, funded, released, disputed)
- [x] Deal list with status badges
- [x] Filter buttons (all/funded/released/disputed)
- [x] Explorer links

---

### Task 5: Add rider function-call key
**Status:** ✅ COMPLETE
**Files Modified:**
- `scripts/add-rider-key.ps1` - PowerShell script created
- `docs/DEPLOYMENT.md` - Deployment guide with rider key steps

---

## ✅ COMPLETED (Deployed to Testnet)

### Task 6: Deploy contract to NEAR testnet
**Status:** ✅ COMPLETE
**Priority:** HIGH

**Deployment Details:**
- ✅ Contract ID: `trustlock-timi.testnet`
- ✅ Transaction: https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo
- ✅ Built in Codespaces, downloaded, deployed locally
- ⚠️ **NOT INITIALIZED** — waiting for real NEP-141 token (usdc.fakes.testnet is placeholder)

**Files ready:**
- ✅ Contract built: `target/wasm32-unknown-unknown/release/trustlock.wasm` (335KB)
- ✅ Deployment guide: `docs/DEPLOYMENT.md`
- ✅ Testnet accounts doc: `docs/testnet_accounts.md` (updated)

---

## ⏳ PENDING

### Task 7: Initialize contract with real NEP-141 token
**Status:** ⏳ BLOCKED - Need real testnet token
**Priority:** HIGH

**What we need:**
- Real testnet NEP-141 token contract (usdc.fakes.testnet is placeholder)
- Options:
  1. Find existing testnet USDC
  2. Deploy simple test token
  3. Ask NEAR community for test tokens

**Then:**
```powershell
near call trustlock-timi.testnet new `
  '{"usdc":"REAL_TOKEN.testnet"}' `
  --accountId trustlock-timi.testnet
```

---

### Task 8: Run end-to-end testnet flow
**Status:** ⏳ BLOCKED - Needs contract initialized first
**Priority:** HIGH

**Steps to test after deployment:**
1. Create deal via `create_deal`
2. Fund via `ft_transfer_call`
3. Rider confirms via `confirm_delivery`
4. Verify seller received tokens

---

### Task 8: Record demo video
**Status:** ⏳ BLOCKED - Needs E2E flow working
**Priority:** HIGH

**Reference:** `docs/demo_script.md`

---

## Summary

**Phase 3 Code Complete:** All web UI, agent endpoints, and scripts are done.
**Build Status:** Web builds successfully, all 21 contract tests pass.
**Contract Deployed:** `trustlock-timi.testnet` (not yet initialized)
**Next Step:** Find real testnet NEP-141 token → Initialize → E2E test

**Quick Start:**
```powershell
# Check deployed contract
near view trustlock-timi.testnet get_deal '{"deal_id": 0}'
# Should fail (not initialized yet)

# Initialize (when token found)
near call trustlock-timi.testnet new `
  '{"usdc":"REAL_TOKEN.testnet"}' `
  --accountId trustlock-timi.testnet
```
