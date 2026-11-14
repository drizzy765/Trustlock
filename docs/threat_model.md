# Threat model

Checked against `contract/src/lib.rs` on 14 November 2026 (issue #21). Findings and fixes:
[security_review.md](security_review.md).

## Assets

- USDC sitting in a `Funded` deal
- Rider function-call key on a phone
- Buyer QR (one-time preimage; the contract stores its SHA-256)
- Deal-agent server (prompts, seller model keys encrypted at rest, optional Muse/Intron keys)
- Optional 1Click JWT
- NEAR balance of the contract account (it pays storage for every deal)

## Actors

- Honest buyer, seller, rider
- Buyer who sends a fake naira screenshot or a reused QR
- Seller who tries to mark delivered without a rider
- Rider who tries to reuse a QR or call refund
- Party who opens a dispute to freeze the other side's money
- Stranger who spams `create_deal` to drain the contract's storage balance
- Prompt-injection attacker chatting with the agent or hiding text on a receipt
- Compromised deal-agent host
- Shoulder-surfer who photographs a QR

## Controls

Status: **holds** (in the code today), **gap** (see the finding), **planned** (not built).

| Threat | Control | Status |
| --- | --- | --- |
| Agent told to "just release" | No method the agent can call moves funds. Demo A01 | holds |
| LLM attest path (ClearSend-style) | Method does not exist | holds |
| Seller marks delivered without a rider | Rider AccountId and QR check | **gap H-1**: the seller picks both the rider and the QR hash in `create_deal` |
| Rider key stolen | Key can only call `confirm_delivery` (`add-rider-key.sh`); still needs a valid unused QR | holds (S07 not run) |
| Photographed QR reused | Hash recorded in `used_qr` on first confirm; S03 | holds |
| Double payout | Status leaves `Funded` before the transfer; S02 | holds |
| Refund before the deadline | Deadline check; S05 | holds |
| Random account confirms | Rider AccountId check plus access-key method list; S06/S07 | holds |
| Wrong token or wrong amount | `ERR_BAD_TOKEN`, exact price; S08 | holds |
| Fake naira funding | Deterministic verdict; screenshot-only is never CONFIRMED; A02-A04 | holds |
| Quote swapped in the UI | Verify 1Click signature; I03 | planned |
| Agent host dumped | No payout key on that host; A06 | holds |
| Deadline griefing (rider never comes) | Payer refund after `deadline_ms` | holds, but **gap M-2** if the refund transfer fails and **gap L-3** for far deadlines |
| Goods damaged but scanned | `open_dispute` | **gap H-2**: nothing resolves a dispute, so the funds stay locked; **gap M-3**: a dispute during a payout is erased |
| Payout transfer fails | Callback restores `Funded` | **gap M-1**: the rider cannot retry (QR stays used) |
| Storage drain | None | **gap M-4**: `create_deal` is free and unbounded |

## What we accept (v1)

- A colluding buyer + rider can confirm a delivery that did not happen. That is the same trust you give a logistics firm. Mitigation later: bonded riders, geofence, photo — out of scope this week.
- Anyone can fund a deal for the buyer; a timeout refund goes to whoever paid (L-1).
- Voice-note STT can mis-hear a price; the seller still has to sign `create_deal`.
- Mainnet Intents costs real USDC. Dry mode is the default.

## What would be a critical bug

Any path where the deal agent, a stranger, or a replayed QR moves USDC out of escrow to someone other than the recorded seller (release) or payer (refund). None found on 14 November 2026. Also critical in practice: any path that releases without the buyer's proof of delivery (H-1) or locks funds with no exit (H-2).
