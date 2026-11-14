# Implementation plan — TrustLock (NEAR HACKATHON)

Deadline: **14 November 2026, 23:59 UTC** (15 November 00:59 WAT). Judging 16–18 November.  
Tracks: `realworld`, `business`.

This is a team project by Agoro Oluwatimilehin (Timi), Brayan Sorgho and Ajiboye Toluwalase (see README, Team and responsibilities).

## micro1 first (5–7 November)

- **Wednesday 5 November**: micro1 suite (sibling repo). Read HACKATHON.md and ClearSend `contracts/escrow/src/lib.rs`, Penstock and NairaRails READMEs.
- **Thursday 6 November**: micro1 frontier runs.
- **Friday 7 November**: Submit micro1, then start TrustLock.

## TrustLock (8–14 November)

### Saturday 8 November

- Turn `contract/src/lib.rs` from a stub into compiling code with the status enum.
- `create_deal`, `ft_on_transfer` / `fund`, storage reservation, unit tests for `Created → Funded`.
- QR payload format (buyer-signed nonce + deal id + expiry) and golden hashes.

### Sunday 9 November

- `confirm_delivery`, one-time QR hash, `claim_timeout_refund`.
- Fixtures for replayed QR and expired deadline.
- Deal-agent preview in Pidgin / Yoruba / English; refuse to return keys.

### Monday 10 November

- Rider function-call access key script; panic if that key calls anything except `confirm_delivery`.
- Prompt-injection samples that try to make the agent "just release."
- `POST /receipts/check` using Sell-Safe verdict ideas (no private Sell-Safe data). Screenshot-only never CONFIRMED for funding.

### Tuesday 11 November

- `open_dispute`, payout `Promise` + callback, near-workspaces tests.
- Run and log the safety battery from `docs/benchmark.md`.
- Next.js `/pay`, `/scan`, `/dashboard` copy and empty states.
- Wallet selector (testnet), 1Click quote client with signature verification.

### Wednesday 12 November

- End-to-end on **testnet**: create deal → fund → rider scan → seller receives tokens. Label anything simulated.
- Safety tests all green (injection, double release, replayed QR, expired deadline, rider-key confinement).
- README judge path updated so every command really works.
- Dispute path visible in the dashboard even if resolution is manual-admin for v1.

### Thursday 13 November

- Record the 60–90s demo (`docs/demo_script.md`).
- Tiny **mainnet** USDC via 1Click if a funded account exists. Save the explorer link. If it cannot happen safely, ship testnet-only (Q-010: still eligible) and say so in the README.
- Freeze `docs/x_post_draft.md` at ≤280 characters, tags `@NEARProtocol` `#NEARHackathon`.

### Friday 14 November (submit)

- Public GitHub repo (no `.env`).
- X post with video.
- Print the POST body for `https://nearhackathon.com/api/applications`. No `website` field. Wait for Timi's yes. If judges later want edits, use `https://nearhackathon.com/request-changes` — do not double-submit.
- Tracks: `realworld`, `business`. Optional extra tracks only if the README's claims still hold.

## Explicit non-goals this week

- Production WhatsApp send (Meta 131031). Mention waitlist only.
- Multi-rider marketplaces, insurance, or on-chain court.
- Replacing QR proof with "Muse watched a video of the doorstep."

## Risk table

| Risk | Mitigation |
| --- | --- |
| Weak Windows laptop, slow Rust builds | Small crate graph; test on sandbox; no extra WASM tooling |
| No Intents testnet | dry quotes + one tiny mainnet, or honest testnet-only |
| Clearing house / USDC account missing | Use a documented test token on testnet; mainnet last |
| Looks like ClearSend | Demo opens on the rider scan, not on an LLM verdict |
