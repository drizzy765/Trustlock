# Security review: escrow contract (issue #21)

Scope: `contract/src/lib.rs` on `main` at `5b6c641`, `docs/threat_model.md`, and `scripts/add-rider-key.sh`.
Reviewer: Brayan Sorgho, with Claude (AI-assisted review, declared as the hackathon rules require).
Date: 14 November 2026.
Follow-up fixes: Timi (AI-assisted) in PR #58 (`fix/issue-18-contract-fixes`), verified below.

Each finding below has a test in `contract/tests/security_review.rs` that reproduces it against
the current code. The tests describe today's behaviour, so a fix should flip the matching test.
They were not run on the reviewer's machine (its Windows Rust toolchain cannot link); CI runs
them with `cargo test` in the Contract Tests job.

## Status of the fixes (14 November 2026, after this review was written)

The branch `fix/issue-18-contract-fixes` (issue #18, not merged when this was written) already
changes the contract for **H-2** (`resolve_dispute` and `claim_dispute_timeout_refund`) and
**M-1** (the QR is released from `used_qr` when a payout fails), and it changes two signatures:
`Contract::new(usdc, arbiter)` and `on_refund(deal_id, prev_status)`. When that branch merges,
`contract/tests/security_review.rs` must be updated in the same change:

- every `Contract::new(usdc())` gets an arbiter argument and `on_refund(id)` gets a `prev_status`,
  or the test crate no longer compiles;
- `m1_failed_payout_blocks_the_rider_retry` must flip: the retry after a failed payout now succeeds;
- `h2_a_dispute_locks_the_funds_for_good` keeps passing for the three methods it calls, but its
  name and the H-2 text above describe the old state; rename it once `resolve_dispute` lands.

H-1, M-4 and L-1 to L-3 are not addressed by that branch; their tests keep
describing today's behaviour, and H-1 and M-4 stay open as documented known
limitations below. M-2 and M-3 turned out to be fixed by the same #18 work
(retry restores the pre-call status), and their tests now assert the fixed
behaviour. A further double-payout race found during that work (a second
resolve/timeout claim while a transfer is in flight starting a second
transfer) is fixed the same way and recorded as M-5 below.

## Summary

| ID | Severity | Finding | Where |
| --- | --- | --- | --- |
| H-1 | High | OPEN known limitation: the seller chooses the rider and the QR hash, so the seller can release the funds without delivering | `create_deal`, `confirm_delivery` |
| H-2 | High | FIXED in #58: `Disputed` was a dead end; `resolve_dispute` (owner-or-arbiter) and buyer `claim_dispute_timeout_refund` now release, refund, or time out every dispute | `open_dispute`, `resolve_dispute`, `claim_dispute_timeout_refund` |
| M-1 | Medium | FIXED in #58: the failed payout clears the used QR mark, so the rider can retry with the same QR | `confirm_delivery`, `on_payout` |
| M-2 | Medium | FIXED in #58: a failed refund restores `Funded`, so the refund can be retried | `claim_timeout_refund_for`, `on_refund` |
| M-3 | Medium | FIXED in #58: callbacks restore the pre-call status on failure instead of blindly overwriting it; a completed transfer still settles terminally | `on_payout`, `on_refund` |
| M-4 | Medium | OPEN known limitation: anyone can create deals with any item length, and the contract pays the storage | `create_deal` |
| M-5 | Medium | FIXED in #58: a second resolve/timeout claim while a transfer was in flight started a second ft_transfer (double payout from other deals' funds); the deal now locks to Delivered/Expired before the transfer, so the second call is rejected | `resolve_dispute`, `claim_dispute_timeout_refund` |
| L-1 | Low | Any account can fund a deal; the refund then goes to that account, not to the buyer | `ft_on_transfer` 146-160 |
| L-2 | Low | `qr_hash` is not in `DealView`, so a buyer cannot check the hash before paying | `DealView` 365-392 |
| L-3 | Low | No upper bound on `deadline_ms`; a far deadline keeps funds locked with no timeout | `create_deal` 117 |
| I-1 | Info | Misleading names and dead code | see below |

No path was found where a stranger, the deal agent or a replayed QR moves USDC to someone other
than the recorded seller or payer. H-1 is the closest: the recorded seller gets paid, but without
the delivery the escrow exists to prove.

## Findings

### H-1: the seller can release without delivering — OPEN known limitation

`create_deal` takes `rider` and `qr_hash_hex` from whoever calls it, with no check on the caller
(line 106). In the planned flow the seller's wallet calls it. A seller can therefore name themself
(or a friend) as rider and pass the hash of a preimage they know. Once the buyer funds, the
seller calls `confirm_delivery` with that preimage and the price is paid out (lines 168-201). The
rider check and the one-time QR, which the threat model lists as the controls against "seller who
tries to mark delivered without a rider", are both chosen by the seller.

Test: `h1_seller_names_themself_rider_and_releases_without_delivery`.

Fix: the secret must be made by the buyer, not only repeated by the buyer. Having the funding
message equal a hash the seller stored proves nothing, because the seller chose that hash and knows
its preimage. So the buyer's wallet generates the secret and sets the hash at funding time (for
example `ft_on_transfer` with `msg = "<deal_id>:<qr_hash_hex>"` that sets `qr_hash` while the deal
is still `Created`), and `create_deal` must not accept a hash from the seller. Even then, the
contract cannot tell who made a preimage, so this relies on the web app generating it in the buyer's
browser with a cryptographic RNG and never sending it to the seller. Also require
`rider != seller && rider != buyer` in `create_deal` (a colluding seller can still name a second
account as rider; that is the accepted collusion case of the threat model), and add `qr_hash` to
`DealView` (L-2) so the web app can show the match.

### H-2: a dispute locks the funds forever — FIXED in #58

`open_dispute` moves a `Funded` or `Delivered` deal to `Disputed` (line 299). No method leaves
`Disputed`: `confirm_delivery`, `confirm_receipt` and `claim_timeout_refund_for` all require
`Funded`, and `resolve_dispute`, which the threat model relies on, does not exist. Either party
(or the owner) can call it at any time, so a buyer can freeze a seller's payment, or a seller a
buyer's refund, for good.

Test: `h2_disputed_funds_can_be_released_or_refunded` (renamed; the old name described
the bug, not the behaviour).

Fix, as shipped: `resolve_dispute(deal_id, outcome)` callable by the owner or a designated
arbiter (`set_arbiter` is owner-only), paying the seller (`"release"`) or refunding the payer
(`"refund"`) through the same promise and callback path, plus buyer `claim_dispute_timeout_refund`
once a dispute has been open past `DISPUTE_WINDOW_MS` (7 days), so nothing stays `Disputed`.
Note the deviation from the review's recommendation: admin means owner-or-arbiter, not owner-only
(Timi's call; the deal agent still holds no key that can call it).

### M-1: a failed payout blocks the rider path — FIXED in #58

`confirm_delivery` inserts the QR hash into `used_qr` before the transfer (line 180). If the
`ft_transfer` fails, `on_payout` restores `Funded` and `qr_consumed = false` "to allow retry"
(lines 220-222) but leaves the hash in `used_qr`, so the retry fails with `ERR_REPLAYED_QR`
(line 173). Funds are not lost (the buyer can still `confirm_receipt`, or wait for the timeout
refund), but the rider flow cannot complete.

Test: `m1_failed_payout_frees_the_rider_retry` (flipped to assert the successful retry).

Fix, as shipped: exactly as recommended — in the `on_payout` failure branch,
`self.used_qr.remove(&deal.qr_hash)`, so the rider scans the same QR again and the
retry reaches `Released` with the seller paid exactly once (S11 proves it).

### M-2: a failed refund cannot be retried — FIXED in #58

`claim_timeout_refund_for` sets `Expired` before the transfer (line 240). If the transfer fails
(for example the payer unregistered from the token), `on_refund` keeps `Expired` "for retry"
(lines 280-284), but the method only accepts `Funded` (line 238), so the funds stay in the
contract with no way out.

Test: `m2_failed_refund_returns_to_funded_and_retries` (flipped to assert the successful retry).

Fix, as shipped: exactly as recommended — `on_refund` takes the pre-call status and restores it
on failure, so a failed timeout refund returns to `Funded` and
`claim_timeout_refund_for` retries to `Refunded` (S12 proves it, buyer made whole exactly once).

### M-3: callbacks overwrite the status — FIXED in #58 (documented residual below)

`confirm_delivery` and `confirm_receipt` set `Delivered` and wait for `on_payout`. Meanwhile
`open_dispute` accepts `Delivered` (line 296). The callback then writes `Released` on success or
`Funded` on failure (lines 211, 221) without checking the current status, so the dispute is
silently erased.

Test: `m3_dispute_during_payout_is_preserved_on_failure` (flipped to assert the
fixed behaviour).

Fix, as shipped: the failure branches restore the status the deal had when the transfer was
started (`prev_status`) instead of hard-coding `Funded`/`Expired`, so a failed transfer never
erases anything — the deal returns to exactly where it was and stays retryable (S11/S12 prove
the restores). A completed transfer still settles terminally (`Released`/`Refunded`), because
the money has moved and the status must agree with the ledger; both paths emit events, so the
settlement is visible rather than silent.

Residual, accepted: a dispute opened mid-flight that is followed by a *successful* transfer
still resolves to the completed payout (the `Disputed` flag is superseded, not preserved).
`open_dispute` during flight was deliberately *not* blocked — blocking it would need new
in-flight tracking, and a failed transfer already restores the pre-call status either way.

Left open deliberately for the hackathon: the fix changes the onboarding flow (the buyer's
browser must generate the QR secret), which is a product change, not a #58 bug fix.

### M-4: unpaid storage — OPEN known limitation

`create_deal` is not payable and has no caller check; `item` has no length limit. Anyone can
create many large deals, and the contract account pays the storage stake until it runs out of
NEAR, after which every state change fails.

Test: `m4_anyone_creates_deals_and_the_contract_pays_storage`.

Fix: make `create_deal` `#[payable]` and require a storage deposit (or measure
`env::storage_usage()` before and after and charge the difference), cap `item` (for example 200
bytes, as the agent's draft already does), and require `predecessor == seller`.

Left open deliberately for the hackathon: fixing it changes the storage economics of
`create_deal`, which is a product decision, not a #58 bug fix.

### M-5: second resolve/timeout claim starts a second transfer — FIXED in #58

Without an in-flight lock, a second `resolve_dispute` or `claim_dispute_timeout_refund`
while a transfer was still running started a second `ft_transfer`, paying out again from the
escrow balance (other deals' funds). Now `resolve_dispute` sets `Delivered` (release) or
`Expired` (refund) and `claim_dispute_timeout_refund` sets `Expired` *before* creating the
transfer promise, with the pre-call `Disputed` passed as `prev_status` so a failed transfer
restores it and stays retryable. A second call sees a non-`Disputed` deal and is rejected with
`ERR_BAD_STATUS`. S14 asserts the double resolve pays exactly once; new unit tests assert the
second call is rejected for release, refund, and timeout paths.

### L-1: third-party funding

`ft_on_transfer` accepts any `sender_id` (line 157). Someone other than the buyer can fund the
deal; a timeout refund then goes to them. Not a theft path, but `ERR_NOT_PAYER`/`ERR_NOT_BUYER`
suggest the intent was buyer-only funding. Decide and document; require `sender_id == deal.buyer`
if buyer-only.

Test: `l1_a_third_party_can_fund_and_is_recorded_as_payer`.

### L-2: the QR hash is not visible

`DealView` (lines 365-376) omits `qr_hash`, so neither the buyer nor the web app can verify, from
the contract, that the deal uses the buyer's QR. Add it (it is a hash, not the secret).

### L-3: unbounded deadline

`create_deal` only requires a future deadline (line 117). A deal with a deadline years away keeps
the price locked with no timeout refund. Cap it (the agent already caps drafts at 30 days).

### I-1: informational

- `confirm_delivery` after the deadline fails with `ERR_NOT_EXPIRED` (line 170), which reads as
  the opposite. Use a `ERR_DEADLINE_PASSED` code.
- `hex_keccak` (line 404) is SHA-256, not Keccak, and it hashes the trimmed UTF-8 bytes of the hex string (the text `"ab12..."`), not the decoded bytes. A client that hashes decoded bytes gets a different hash and can never confirm. Document this encoding in `docs/api.md` and rename the function. (Done in #58: renamed to `sha256_hex`.)
- `claim_timeout_refund` (line 229) always panics; drop it or document it. (Done in #58: stub removed; use `claim_timeout_refund_for`.)
- `ERR_ALREADY_RELEASED` and `ERR_NO_PAYER` are never used.
- `cancel_unfunded` records a cancelled deal as `Refunded` although no money moved; a separate
  `Cancelled` status would make the history honest.

## Controls that hold

Checked by reading the code, with a test where noted (`ok_wrong_token_wrong_amount_stranger_and_replay_are_rejected`):

- Funding only from the configured USDC contract (`ERR_BAD_TOKEN`, line 152), only for the exact
  price (`ERR_WRONG_AMOUNT`, line 156) and only from `Created` (line 155). A panic inside
  `ft_on_transfer` makes the token contract return the tokens (NEP-141).
- `confirm_delivery` only from the recorded rider (line 168), with the matching preimage
  (line 171), before the deadline (line 170).
- `confirm_receipt` only from the recorded buyer (line 311).
- Timeout refund only after the deadline (line 239), paid to the recorded payer.
- A QR hash used on one deal cannot open a new one (line 119) or confirm a second (line 173).
- Callbacks are `#[private]`.
- Double release: the status moves away from `Funded` before the transfer, so a second
  `confirm_delivery` or `confirm_receipt` fails while the first is in flight or after it.
- Rider key confinement: `scripts/add-rider-key.sh` grants a function-call key limited to
  `confirm_delivery` on the escrow contract. This is enforced by NEAR, not by the contract, and
  it is tested by the near-workspaces spec S07 (a restricted key calling other methods fails with
  `InvalidAccessKeyError(MethodNameMismatch)`).

## Not covered

- No run against the deployed testnet contract (the v2 on-chain code was verified byte-identical
  to this branch instead; end-to-end web tests are a separate phase).
- The web app's QR generation (`Math.random()`, noted in the agent review) is outside this scope,
  but it weakens H-1's fix: the buyer's QR secret must come from a cryptographic RNG.
