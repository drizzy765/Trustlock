# Implementation Plan: TrustLock — Timi's issues (core + stretch)

**Owner:** Timi (drizzy765). **Deadline:** 14 Nov 2026, 23:59 UTC. **Freeze:** Fri 14 Nov, morning UTC.
**Ordering rule:** all build/verify work first; README + demo video + submission last.
**Scope note:** GitHub API auth failed in this session, so issue bodies are reconstructed
from README team table, ROLES.md, AGENTS.md, docs/testnet_run.md, and git history.
If a live issue body disagrees, the issue wins.
**Tasks tracked here** (repo file), not duplicated into new tracker items.

## Overview

Build and verify everything on testnet first, then make the README honest, then
record the video and submit. Stretch builds (#14, #18, #11) sit inside the build
phase in risk order; each may be dropped without harming the submission.

## Phase 1 — Build (code first; nothing about README or video here)

- [x] **#8: `issue-8-web-wiring` pushed, PR-39 opened** (closes #8; also completes
  25.3). Contains real USDC funding (8.1), QR text input (8.2), network badge (8.3),
  buyer one-tap release button (25.3) + 3 build-fix commits. Awaiting green CI +
  one teammate approval + merge.
- [ ] **#25: verify seller onboarding + shareable payment link.** Code merged to
  `origin/main` (`57cb481`, "Closes #25"). Verdict: verify, don't rebuild.
  Acceptance: onboard → link → pay walkthrough works against `trustlock-timi.testnet`.
- [ ] **#10 leftover: Deal 3 timeout refund — BLOCKED until 23:35 UTC today.**
  Verified live via RPC 13 Nov ~11:00 UTC: Deal 3 is `Funded`, 0.5 USDC,
  buyer/payer `buyer-timi.testnet`, `deadline_ms` 1794612931405 (= 23:35 UTC).
  Needs the `buyer-timi.testnet` signing key (no buyer keyfile var exists in `.env`;
  sandbox `near` CLI is also broken on glibc — run from Timi's Windows shell).
  Recheck 11:01 UTC: Deal 3 still `Funded`, deadline unchanged; no `*.testnet.json`
  key files on disk; only binary present is Windows `near.exe` (unrunnable in this Linux sandbox).
  Command at/after expiry: `claim_timeout_refund` with `{"deal_id": 3}` signed as
  `buyer-timi.testnet`; then log tx in docs/testnet_run.md on branch
  `docs/issue-10-refund` and open PR-10 (closes #10).
- [ ] **#9: verify 1Click dry quote.** Run one dry quote with signature verification,
  save output. Acceptance: dry quote logged, labelled `dry`, never called a payment.
- [ ] **#14 (stretch, agent-only): multi-currency quotes.** Extends #9, no contract
  risk. Acceptance: dry quote for a second asset, signature verified, labelled dry.
- [ ] **#18 (stretch, contract change): `resolve_dispute`.** Needs Mikezx8 review,
  green CI, testnet redeploy + re-verification. Highest blast radius — attempt only
  with review bandwidth, drop freely.
- [ ] **#11 (stretch): tiny mainnet USDC via 1Click (<$1).** Needs a funded mainnet
  account + team agreement. Drop-dead: if not executed with an explorer link before
  Phase 3 records, ship testnet-only (eligible per Q-010) and claim nothing.

### Checkpoint: build complete

- [ ] Web merged and working against testnet; #25 walkthrough passes
- [ ] Timeout refund logged with explorer link; dry quote output saved
- [ ] Stretch builds either done or explicitly dropped below (note which)

## Phase 2 — README and proof (after build; still before the video)

- [ ] **#5 confirm:** 21 contract unit tests green (no action unless red).
- [ ] **Hygiene sweep:** no `.env`/keys in git, `cargo test` green, agent `/health` +
  injection fixture as documented, mode badges match backend. Per
  docs/submission_checklist.md.
- [ ] **#13: README with real tx links.** README has zero explorer links today; add
  the testnet hashes from docs/testnet_run.md (+ Phase 1 refund link).
  Acceptance: every do-X-see-Y step actually works.
- [ ] **#17 (stretch): one-command judge demo.** Only after #13 is verified.
  Acceptance: a single documented command reproduces the judge path.

### Checkpoint: shippable

- [ ] README claims match code + tests; repo public, no secrets
- [ ] One-command demo runs (or #17 explicitly dropped)

## Phase 3 — Demo video and submission (last)

- [ ] **#12: video (60–90s)** per docs/demo_script.md. Opens on rider scan;
  testnet/dry/live labelled honestly; reflects whichever of #11 happened.
- [ ] **X post** from docs/x_post_draft.md: ≤280 chars, `@NEARProtocol` `#NEARHackathon`.
- [ ] **Submission payload:** print JSON for `nearhackathon.com/api/applications`,
  **no `website` field**, wait for Timi's yes before POST. Tracks: `realworld`, `business`.

### Checkpoint: complete

- [ ] All acceptance criteria met or stretch items explicitly dropped in this file
- [ ] README/video claims match reality (no mainnet claim without explorer link)

## Already done (no action)

- [x] **#24: buyer `confirm_receipt` path.** Methods + tests + workspaces specs merged,
  E2E-verified on testnet as Deal 2.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| #18 redeploy breaks frozen E2E | High | Build-phase last; needs Mikezx8 review; drop freely |
| #11 no funded mainnet account | Med | Drop-dead before Phase 3; testnet-only is eligible |
| Slow laptop rebuilds | Med | Small crate graph; no new WASM deps |
| README over-claims | High | Phase 2 verified against real tx links before submit |

## Open Questions (for Timi)

- Is there a funded mainnet account for #11, or commit to testnet-only now?
- #18: attempt in build phase, or defer to post-deadline?
- Local `main` is behind `origin/main` — pull before cutting any new branch.
