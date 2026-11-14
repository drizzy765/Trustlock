# Security review: escrow contract (issue #21)

Scope: `contract/src/lib.rs` on `main` at `5b6c641`, `docs/threat_model.md`, and `scripts/add-rider-key.sh`.
Reviewer: Brayan Sorgho, with Claude (AI-assisted review, declared as the hackathon rules require).
Date: 14 November 2026.

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

H-1, M-2, M-3, M-4 and L-1 to L-3 are not addressed by that branch as far as this review could
tell, so their tests keep describing today's behaviour.

## Summary

| ID | Severity | Finding | Where |
| --- | --- | --- | --- |
| H-1 | High | The seller chooses the rider and the QR hash, so the seller can release the funds without delivering | `create_deal` 106-139, `confirm_delivery` 162-201 |
| H-2 | High | `Disputed` is a dead end: no `resolve_dispute` exists, so a dispute locks the price forever | `open_dispute` 288-300 |
| M-1 | Medium | After a failed payout the QR stays in `used_qr`, so the rider can never retry | `confirm_delivery` 180, `on_payout` 218-225 |
| M-2 | Medium | After a failed refund the deal stays `Expired`, and refunds only start from `Funded` | `claim_timeout_refund_for` 238-240, `on_refund` 280-284 |
| M-3 | Medium | Callbacks overwrite the status blindly: a dispute opened while a payout is in flight is erased | `on_payout` 205-227, `open_dispute` 295-299 |
| M-4 | Medium | Anyone can create deals with any item length, and the contract pays the storage | `create_deal` 106-139 |
| L-1 | Low | Any account can fund a deal; the refund then goes to that account, not to the buyer | `ft_on_transfer` 146-160 |
| L-2 | Low | `qr_hash` is not in `DealView`, so a buyer cannot check the hash before paying | `DealView` 365-392 |
| L-3 | Low | No upper bound on `deadline_ms`; a far deadline keeps funds locked with no timeout | `create_deal` 117 |
| I-1 | Info | Misleading names and dead code | see below |

No path was found where a stranger, the deal agent or a replayed QR moves USDC to someone other
than the recorded seller or payer. H-1 is the closest: the recorded seller gets paid, but without
the delivery the escrow exists to prove.

## Findings

### H-1: the seller can release without delivering

`create_deal` takes `rider` and `qr_hash_hex` from whoever calls it, with no check on the caller
(line 106). In the planned flow the seller's wallet calls it. A seller can therefore name themself
(or a friend) as rider and pass the hash of a preimage they know. Once the buyer funds, the
seller calls `confirm_delivery` with that preimage and the price is paid out (lines 168-201). The
rider check and the one-time QR, which the threat model lists as the controls against "seller who
tries to mark delivered without a rider", are both chosen by the seller.

Test: `h1_seller_names_themself_rider_and_releases_without_delivery`.

Fix: make the buyer commit to the QR when paying. For example `ft_on_transfer` takes
`msg = "<deal_id>:<qr_hash_hex>"` and requires it to equal the stored hash (or sets the hash at
funding time, from the buyer's wallet). Also require `rider != seller && rider != buyer` in
`create_deal`, and add `qr_hash` to `DealView` (L-2) so the web app can show the match.

### H-2: a dispute locks the funds forever

`open_dispute` moves a `Funded` or `Delivered` deal to `Disputed` (line 299). No method leaves
`Disputed`: `confirm_delivery`, `confirm_receipt` and `claim_timeout_refund_for` all require
`Funded`, and `resolve_dispute`, which the threat model relies on, does not exist. Either party
(or the owner) can call it at any time, so a buyer can freeze a seller's payment, or a seller a
buyer's refund, for good.

Test: `h2_a_dispute_locks_the_funds_for_good`.

Fix: add `resolve_dispute(deal_id, release: bool)` callable by `owner` only, paying the seller or
the payer through the same promise and callback path. Until then, consider not exposing
`open_dispute` in the UI.

### M-1: a failed payout blocks the rider path

`confirm_delivery` inserts the QR hash into `used_qr` before the transfer (line 180). If the
`ft_transfer` fails, `on_payout` restores `Funded` and `qr_consumed = false` "to allow retry"
(lines 220-222) but leaves the hash in `used_qr`, so the retry fails with `ERR_REPLAYED_QR`
(line 173). Funds are not lost (the buyer can still `confirm_receipt`, or wait for the timeout
refund), but the rider flow cannot complete.

Test: `m1_failed_payout_blocks_the_rider_retry`.

Fix: in the failure branch, `self.used_qr.remove(&deal.qr_hash)` when the payout came from
`confirm_delivery`.

### M-2: a failed refund cannot be retried

`claim_timeout_refund_for` sets `Expired` before the transfer (line 240). If the transfer fails
(for example the payer unregistered from the token), `on_refund` keeps `Expired` "for retry"
(lines 280-284), but the method only accepts `Funded` (line 238), so the funds stay in the
contract with no way out.

Test: `m2_failed_refund_cannot_be_retried`.

Fix: accept `Funded` or `Expired` in `claim_timeout_refund_for`, or restore `Funded` in the
failure branch.

### M-3: callbacks overwrite the status

`confirm_delivery` and `confirm_receipt` set `Delivered` and wait for `on_payout`. Meanwhile
`open_dispute` accepts `Delivered` (line 296). The callback then writes `Released` on success or
`Funded` on failure (lines 211, 221) without checking the current status, so the dispute is
silently erased.

Test: `m3_payout_callback_overwrites_a_dispute`.

Fix: in both callbacks, only change the status if it is still `Delivered` (or `Expired` for
refunds), and do not accept `open_dispute` while a payout is in flight.

### M-4: unpaid storage

`create_deal` is not payable and has no caller check; `item` has no length limit. Anyone can
create many large deals, and the contract account pays the storage stake until it runs out of
NEAR, after which every state change fails.

Test: `m4_anyone_creates_deals_and_the_contract_pays_storage`.

Fix: make `create_deal` `#[payable]` and require a storage deposit (or measure
`env::storage_usage()` before and after and charge the difference), cap `item` (for example 200
bytes, as the agent's draft already does), and require `predecessor == seller`.

### L-1: third-party funding

`ft_on_transfer` accepts any `sender_id` (line 157). Someone other than the buyer can fund the
deal; a timeout refund then goes to them. Not a theft path, but `ERR_NOT_PAYER`/`ERR_NOT_BUYER`
suggest the intent was buyer-only funding. Decide and document; require `sender_id == deal.buyer`
if buyer-only.

Test: `l1_a_third_party_can_fund_and_receives_the_refund`.

### L-2: the QR hash is not visible

`DealView` (lines 365-376) omits `qr_hash`, so neither the buyer nor the web app can verify, from
the contract, that the deal uses the buyer's QR. Add it (it is a hash, not the secret).

### L-3: unbounded deadline

`create_deal` only requires a future deadline (line 117). A deal with a deadline years away keeps
the price locked with no timeout refund. Cap it (the agent already caps drafts at 30 days).

### I-1: informational

- `confirm_delivery` after the deadline fails with `ERR_NOT_EXPIRED` (line 170), which reads as
  the opposite. Use a `ERR_DEADLINE_PASSED` code.
- `hex_keccak` (line 404) is SHA-256 of the hex string bytes, not Keccak. Rename it.
- `claim_timeout_refund` (line 229) always panics; drop it or document it.
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
  was not tested here: the near-workspaces specs (S07) are in `contract/tests/spec.disabled/`.

## Not covered

- No run against the deployed testnet contract, and no near-workspaces run (disabled in CI).
- The web app's QR generation (`Math.random()`, noted in the agent review) is outside this scope,
  but it weakens H-1's fix: the buyer's QR secret must come from a cryptographic RNG.
