# GitHub Codespaces Build Guide

## Why Use Codespaces?

- **Avoids 6.75 GB Windows C++ toolchain** installation
- **Keeps NEAR signing key on your PC** (don't upload keys to cloud)
- **Fast builds** — Codespaces has Rust pre-installed
- **Download WASM locally** — Deploy from your machine with your keys

## Steps

### 1. Push Latest Code

Your code should already be on branch `feature/phase-2-contract-tests`

Verify:
```bash
git log --oneline -3
# Should show: feat: Phase 3 - Web UI, Agent Endpoints...
```

### 2. Open Codespaces

1. Go to https://github.com/drizzy765/Trustlock
2. Click **Code** button → **Codespaces** tab → **Create codespace**
3. Wait for Codespace to initialize (~1-2 minutes)

### 3. Build WASM in Codespaces

In the Codespaces terminal:

```bash
# From repo root
cd contract
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown
```

Wait for build (~3-5 minutes).

### 4. Locate WASM File

After build completes:

```bash
ls -lh ../target/wasm32-unknown-unknown/release/trustlock.wasm
# Should show: trustlock.wasm (~335KB)
```

### 5. Download WASM to Your PC

**Option A: VS Code Download**
1. In Codespaces VS Code, open file explorer
2. Navigate to: `target/wasm32-unknown-unknown/release/`
3. Right-click `trustlock.wasm` → **Download**
4. Save to: `C:\Users\USER\Documents\trustlock\`

**Option B: Command Line**

In Codespaces, run:
```bash
cat trustlock.wasm | base64 > wasm.b64
```

Then on your PC (PowerShell):
```powershell
certutil -decode wasm.b64 trustlock.wasm
```

**Option C: GitHub CLI**
```bash
gh codespace cp -e remote:trustlock.wasm -p C:\Users\USER\Documents\trustlock\trustlock.wasm
```

### 6. Deploy Locally from Your PC

On your Windows PC (PowerShell):

```powershell
cd C:\Users\USER\Documents\trustlock

# Set your testnet account (replace 'timi')
$env:TRUSTLOCK_CONTRACT_ID="trustlock-timi.testnet"

# Create contract account (if not exists)
near create-account trustlock-timi.testnet `
  --masterAccount timi.testnet `
  --initialBalance 10

# Deploy WASM
near deploy trustlock-timi.testnet `
  target\wasm32-unknown-unknown\release\trustlock.wasm `
  --accountId trustlock-timi.testnet

# Initialize contract
near call trustlock-timi.testnet new `
  '{"usdc":"usdc.fakes.testnet"}' `
  --accountId trustlock-timi.testnet
```

### 7. Verify Deployment

```powershell
# Check contract exists
near view trustlock-timi.testnet get_deal '{"deal_id": 0}'

# Should return: null (no deals yet)
```

### 8. Update .env

```
TRUSTLOCK_CONTRACT_ID=trustlock-timi.testnet
```

## Advantages

✅ **No 6.75 GB toolchain** — Rust comes pre-installed in Codespaces  
✅ **Fast builds** — Optimized for compilation  
✅ **Keys stay local** — Only WASM moves, not your private keys  
✅ **Reproducible** — Same environment every time  

## Troubleshooting

**Build fails with "target not found":**
```bash
rustup target add wasm32-unknown-unknown
```

**Cargo not found:**
```bash
source $HOME/.cargo/env
```

**Download fails:**
- Use VS Code file explorer → Right-click → Download
- Or use `scp` from your local terminal

## Deployment Status

✅ **Build WASM in Codespaces** — Completed  
✅ **Download to PC** — Completed  
✅ **Deploy to testnet** — Completed  
📋 **Contract ID:** `trustlock-timi.testnet`  
📋 **Transaction:** https://testnet.nearblocks.io/txns/FNM2Jp6aCCFa6BR719SxACjpRGmY9gc8VQcbj8brTHgo  
⚠️ **Not Initialized** — Waiting for real NEP-141 token (usdc.fakes.testnet is placeholder)

## Next Steps

1. ⏳ Find real testnet NEP-141 token
2. ⏳ Initialize contract with real token
3. ⏳ Create test accounts (buyer, seller, rider)
4. ⏳ Run E2E tests
5. ⏳ Merge PR
6. ⏳ Record demo video
