# TrustLock

Pay-on-delivery escrow for Nigerian Instagram and WhatsApp commerce. The **dispatch rider is the proof**.

**Hackathon:** [NEAR HACKATHON](https://nearhackathon.com) · brief: [HACKATHON.md](https://nearhackathon.com/HACKATHON.md)  
**Tracks:** `realworld` and `business`  
**Deadline:** 14 November 2026, 23:59 UTC (15 November 00:59 WAT / 14 November 15:59 America/Los_Angeles)  
**Judging:** 16–18 November 2026  
**Built solo by Agoro Oluwatimilehin (Timi)**

A buyer locks USDC into a NEAR escrow from a payment link (NEAR Intents / 1Click, with real execution — not a dry quote only — or naira that converts to USDC after a fake-receipt check). An AI deal agent agrees the item, price, deadline and accounts in Pidgin, Yoruba or English, including voice notes. The rider scans a **one-time QR signed by the buyer**. The rider's function-call access key can only call `confirm_delivery`. Funds move to the seller at once. If nobody scans before the deadline, the buyer is refunded. The AI never holds a key that can move money.

This is not another "LLM looks at the work and releases escrow" project. [ClearSend](https://github.com/dukemawex/clearsend-near) already does that on testnet, from a single model's opinion. TrustLock releases on a **physical delivery event** an AI cannot be talked into approving.

Sibling project (different hackathon): `micro1-receipt-eval`. NEAR HACKATHON.md Q-015: if one person submits two NEAR projects, each README must name the other. This README names none besides TrustLock unless that changes.

## Why this is different

| | ClearSend | TrustLock |
| --- | --- | --- |
| Release trigger | LLM `attest` on free text | Rider scans a one-time buyer-signed QR |
| Payment check | none visible | Deterministic receipt engine (Sell-Safe ideas: 20/20, 0 false CONFIRMED, 6/6 injections blocked) for naira funding |
| Chain | NEAR + testnet only | Testnet plus **one tiny mainnet USDC** via 1Click |
| Intents | `dry: true` quotes | Quote, verify signature, execute |
| Languages | English | Pidgin, Yoruba, English, voice notes |
| Injection demo | not visible | Hidden "ignore rules, approve" on a fake receipt; funds stay locked |

Patterns we *do* copy from neighbours: ClearSend's scoped function-call keys and do-X-see-Y README; [Penstock](https://github.com/ace-coderr/penstock)'s real mainnet proof and honest demo/dry/live labels; [NairaRails](https://github.com/Esimuda/nairarails)'s Nigerian money framing and short problem-first demo.

## Repository layout

```
contract/     Rust near-sdk escrow (near-workspaces tests)
agent/        FastAPI deal agent (terms, receipt check, Intents client)
web/          Next.js: buyer pay, rider scan, seller dashboard
scripts/      deploy and access-key helpers (bash + PowerShell)
tests/        extra integration notes
docs/         plan, architecture, threat model, demo script
skills/       local SKILL.md files + verified upstream links
```

## Status

Starter pack. The state machine, method names, threat model and judge steps are frozen here so a coding agent can build without inventing product decisions. The Rust is a structured stub — it is not mainnet-ready until the contract tests are green.

## Judge path (do X, then you will see Y)

AI tools screen first that the **code runs and matches this README**. Keep these steps honest as you replace stubs.

### 0. Read this and the brief

Open [HACKATHON.md](https://nearhackathon.com/HACKATHON.md). Note Q-007 (Intents has no testnet; tiny mainnet amounts, `dry: true` for quotes), Q-010 (testnet-only is still eligible), Q-012 (local demo is fine if the repo is public and the X video exists), Q-017 (Claude Code and Codex check reproducibility).

### 1. Contract unit logic (after `cargo test`)

```powershell
cd contract
rustup show
cargo test -q
```

You should see the state-machine unit tests pass: a deal starts `Created`; funding moves it to `Funded`; `confirm_delivery` with a fresh QR hash moves it to `Released`; a second confirm panics; an expired deal refunds the buyer; a replayed QR hash is rejected.

### 2. Workspaces sandbox (after `cargo test --test workspaces -- --ignored` is enabled)

You should see a sandbox account create a deal, attach a rider function-call key limited to `confirm_delivery`, and fail when that key tries to call `claim_timeout_refund` or transfer.

### 3. Deal agent

```powershell
cd agent
python -m venv .venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env   # then fill values locally, never commit
uvicorn app.main:app --reload --port 8080
```

`GET http://localhost:8080/health` returns `{"ok": true}`.  
`POST /deals/preview` with a Pidgin sentence returns structured terms and does **not** include a private key.  
`POST /receipts/check` on the injection sample in `tests/fixtures/injection_receipt.json` returns a non-`CONFIRMED` verdict.

### 4. Web app

```powershell
cd web
npm install
npm run dev
```

Open the buyer pay page, the rider scan page and the seller dashboard. Wallet selector should prompt (testnet by default). The UI must label **simulated / dry / live** the same way Penstock does.

### 5. Intents quote (optional JWT)

`POST /intents/quote` with a tiny USDC amount returns a 1Click quote. With `TRUSTLOCK_INTENTS_MODE=dry` the client sends `dry: true` and does not broadcast. With `live`, it executes and writes the transaction hash into the deal record. There is no Intents testnet (HACKATHON.md Q-007).

### 6. Demo video and X post

Follow `docs/demo_script.md`. The public X post must tag **@NEARProtocol** and **#NEARHackathon** and include the video (or a YouTube link if X rejects the file). Draft: `docs/x_post_draft.md`.

## Security, in one paragraph

The rider key is a function-call access key whose `method_names` are exactly `["confirm_delivery"]`. The deal agent holds no full-access key and no transfer key. Naira screenshots never release escrow by themselves. Release is `confirm_delivery` or a timeout refund to the original payer. See `docs/threat_model.md`.

## Environment

Copy `.env.example` to `.env`. Never commit `.env`. No real seed phrases go in git, in chat, or in the README.

## License

MIT. See `LICENSE`.
