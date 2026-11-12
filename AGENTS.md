# AGENTS.md

Instructions for the coding agent (opencode / Cursor running Kimi) helping the TrustLock team (Timi, Brayan Sorgho, Mikezx8) build TrustLock.

## Person

- **Timi** (Agoro Oluwatimilehin) — AI/ML engineer, Lagos. Deal agent, receipt check, demo, X post, submission. Never call him a student.

The team is Timi (drizzy765), Brayan Sorgho (Sorghobrayan-dotcom) and Mikezx8. Do not add or remove teammates; owners are listed in the README.

## Product decisions that are already made

Do not reopen these without Timi:

1. Release is a **rider QR scan**, not an LLM opinion. That is how we differ from ClearSend.
2. The rider access key can call **only** `confirm_delivery`.
3. The AI **never** holds a key that can move funds.
4. One-time QR, signed (or pre-committed) by the buyer. Replay is a hard fail.
5. Deadline with no scan → automatic refund to the buyer.
6. Naira funding goes through the deterministic receipt checker first. A screenshot alone never sets "paid."
7. NEAR Intents / 1Click must support **real execution**, clearly labelled `dry` vs `live`. Quotes-only is a ClearSend gap we do not copy.
8. Goal: testnet plus **one tiny mainnet USDC** transfer. Label it. A fake "mainnet" hash is cheating.
9. Languages: Pidgin, Yoruba, English, including voice notes (Intron Sahara for STT when wired; Muse or a documented fallback if Sahara is down).
10. Tracks: `realworld` and `business`.

## Security

- Never commit `.env`, seed phrases, private keys, JWT partner tokens, or `.near-credentials`.
- `.gitignore` covers those paths. Only `.env.example` belongs in git.
- Never print a secret. If a command would dump `NEAR_PRIVATE_KEY`, refuse and use a file the user keeps locally.
- Never request mainnet funds larger than a "coffee" test (well under $1 USDC).
- Never invent a payout account. Timi supplies `TRUSTLOCK_SELLER_ACCOUNT` and friends.
- Function-call keys: follow https://docs.near.org/protocol/accounts-contracts/access-keys
- Submission API: print the JSON payload and wait for a human "yes". **Never add a `website` field** — HACKATHON.md marks it as a spam trap. Do not POST the application unless Timi explicitly says to submit that payload.

## PowerShell first

This laptop is Windows + PowerShell and it is slow. Prefer:

```powershell
# contract (once rustup is installed)
cd contract
cargo test -q

# agent
cd agent
python -m venv .venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --port 8080

# web
cd web
npm install
npm run dev
```

PowerShell 5 often breaks on `&&`. Use `;` or separate lines. Do not assume WSL, Docker Desktop, or a fast linker. `cargo` builds will be slow — keep the contract small, avoid extra crates, and do not add WASM pipelines that need nightly unless `near-sdk` requires them.

`scripts/make.ps1` mirrors common targets.

## Build order

### Phase 1: Foundation ✅ (Complete)
1. ✅ Read `docs/architecture.md` and `docs/threat_model.md`.
2. ✅ Set up tooling (Rust, Python, Node.js)

### Phase 2: Contract Development ✅ (Complete)
3. ✅ Finish `contract/src/lib.rs` state machine and its unit tests (`Created → Funded → Released | Refunded | Disputed`).
   - ✅ `create_deal` - Creates deals
   - ✅ `ft_on_transfer` - Funds deals
   - ✅ `confirm_delivery` - Releases funds via Promise + callback
   - ✅ `claim_timeout_refund` - Refunds via Promise + callback  
   - ✅ `open_dispute` - Opens disputes
   - ✅ Promise + callback pattern (ClearSend style)
   - ✅ All unit tests passing (21 tests)
4. ✅ Add near-workspaces tests for the rider key restriction, QR replay, double release, and timeout refund.

### Phase 3: Integration & Web UI ✅ (Complete)
5. ✅ Deploy to testnet WASM build ready (`cargo build --release --target wasm32-unknown-unknown`)
6. ✅ Add the rider function-call key script (`scripts/add-rider-key.ps1` created)
7. ✅ Implement `agent/` against `docs/api.md`:
   - ✅ `POST /deals/preview` - Preview terms
   - ✅ `POST /deals/draft` - Persist draft
   - ✅ `GET /deals/{deal_id}` - Get deal with metadata
   - ✅ `POST /receipts/check` - Receipt verification
   - ✅ `POST /intents/quote` - 1Click quote (dry/live mode)
   - ✅ `POST /intents/execute` - 1Click execute
8. ✅ Scaffold `web/` pages:
   - ✅ `/pay` - Wallet selector, deal preview, mode badges
   - ✅ `/scan` - QR input, rider confirmation
   - ✅ `/dashboard` - Deal list, stats, status badges

### Phase 4-5: Testnet Deployment & Demo (Pending Timi)
9. ⏳ Deploy contract to testnet (needs testnet accounts from Timi)
10. ⏳ Wire one end-to-end testnet path: create → fund → scan → seller payout
11. ⏳ Safety battery in `docs/benchmark.md`. All must pass before the video.
12. ⏳ Dry-run a 1Click quote. Only then a live tiny mainnet USDC execute.
13. ⏳ Record the 60–90s video (`docs/demo_script.md`). Draft the X post (`docs/x_post_draft.md`, 280 characters).
14. ⏳ Public repo + X post + application payload. Humans approve the POST.

Do not start with the Next.js visual polish. Judges' AI screen looks at whether `cargo test` and the README agree.

## What to steal (and what not to)

Read, do not vend:

- ClearSend `contracts/escrow/src/lib.rs` — `#[near]` module layout, status enum, storage reservation, `Promise` + callback, scoped `attest` key (ours is `confirm_delivery`).
- Penstock — 1Click quote verification, JWT as `X-API-KEY`, demo/dry/live modes, an honest "limits" section.
- NairaRails — African real-world framing, short problem-first demo.

Do not copy their code verbatim into this repo. Do not copy their credentials, account names, or JWT.

## Style

- Rust: no `unwrap` on user input; `require!` / `env::panic_str` with a clear code (`ERR_REPLAYED_QR`, `ERR_NOT_RIDER`, `ERR_ALREADY_RELEASED`, `ERR_NOT_EXPIRED`).
- Python: FastAPI, type hints, no hidden key loading from random files.
- TypeScript: App Router, no secrets in client bundles (`NEXT_PUBLIC_*` is public).

## Out of scope

- Shipping a production WhatsApp Business integration (Meta error 131031 still blocks Sell-Safe). Instagram-first, WhatsApp waitlist is fine to mention.
- Replacing the receipt engine with "ask Muse whether this looks paid."
- A second token besides USDC on NEAR for v1 (Intents may *take* another asset; the escrow itself holds USDC).
