# Threat model

## Assets

- USDC sitting in a `Funded` deal
- Rider function-call key on a phone
- Buyer QR (one-time nonce + signature or preimage)
- Deal-agent server (prompts, optional Muse/Intron keys)
- Optional 1Click JWT

## Actors

- Honest buyer, seller, rider
- Buyer who sends a fake naira screenshot or a reused QR
- Seller who tries to mark delivered without a rider
- Rider who tries to reuse a QR or call refund
- Prompt-injection attacker chatting with the agent or hiding text on a receipt
- Compromised deal-agent host
- Shoulder-surfer who photographs a QR

## Controls

| Threat | Control |
| --- | --- |
| Agent told to "just release" | No method the agent can call moves funds. Demo A01 |
| LLM attest path (ClearSend-style) | Method does not exist |
| Rider key stolen | Key can only call `confirm_delivery`; still needs a valid unused QR |
| Photographed QR reused | Hash consumed on first success; S03 |
| Double payout | Status gate; S02 |
| Refund before delivery window ends | Deadline check; S05 |
| Random account confirms | Rider AccountId check plus access-key method list; S06/S07 |
| Fake naira funding | Deterministic verdict; screenshot-only cannot CONFIRMED; A02–A04 |
| Quote swapped in the UI | Verify 1Click signature; I03 |
| Agent host dumped | No payout key on that host; A06 |
| Deadline griefing (rider never comes) | Buyer refund after `deadline_ms` |
| Goods damaged but scanned | `open_dispute` freezes further payout if called in time; human `resolve_dispute` |

## What we accept (v1)

- A colluding buyer + rider can confirm a delivery that did not happen. That is the same trust you give a logistics firm. Mitigation later: bonded riders, geofence, photo — out of scope this week.
- `resolve_dispute` is a privileged call. Document who holds that key.
- Voice-note STT can mis-hear a price; the seller still has to sign `create_deal`.
- Mainnet Intents costs real USDC. Dry mode is the default.

## What would be a critical bug

Any path where the deal agent, a stranger, or a replayed QR moves USDC out of escrow to someone other than the recorded seller (release) or payer (refund).
