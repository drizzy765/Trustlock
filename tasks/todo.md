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

## ⏳ PENDING (Requires Timi's Testnet Accounts)

### Task 6: Deploy contract to NEAR testnet
**Status:** ⏳ BLOCKED - Needs Timi's testnet accounts
**Priority:** HIGH

**What Timi needs to do:**
1. Create testnet account (e.g., `timi.testnet`)
2. Run: `near create-account trustlock-timi.testnet --masterAccount timi.testnet`
3. Run: `near deploy trustlock-timi.testnet target/wasm32-unknown-unknown/release/trustlock.wasm`
4. Run: `near call trustlock-timi.testnet new '{"usdc":"usdc.fakes.testnet"}'`

**Files ready:**
- ✅ Contract built: `target/wasm32-unknown-unknown/release/trustlock.wasm` (335KB)
- ✅ Deployment guide: `docs/DEPLOYMENT.md`
- ✅ PowerShell script: `scripts/make.ps1 contract-deploy`

---

### Task 7: Run end-to-end testnet flow
**Status:** ⏳ BLOCKED - Needs contract deployed first
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
**Next Step:** Timi deploys to testnet and runs the E2E flow.

**Quick Start:**
```powershell
# Test agent
.\scripts\make.ps1 agent-smoke

# Build web
.\scripts\make.ps1 contract-build
cd web; npm run dev

# Deploy contract (Timi only)
# See docs/DEPLOYMENT.md
```
