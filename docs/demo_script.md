# Demo script (60 to 90 seconds)

## Recording gate

Record the end-to-end version only after the testnet path has actually passed:
deal creation → token funding → rider confirmation → seller payout verified
on chain and reflected in the dashboard. The current pages and integrations
are scaffolding, so do not narrate this as a working product until the gate is
met.

Use the real network name and real explorer transaction links. Clearly label
testnet, simulated, `dry`, and `live` actions. Do not describe a dry quote as a
payment, a local receipt check as bank verification, or a planned test as a
passed test. If the end-to-end gate is not met, record a clearly labelled
prototype walkthrough instead and state what is not yet implemented.

Open on the problem, not on the architecture. 60 seconds is better than 90 if every beat lands. Voice: clear international English (same note as the Sell-Safe demo).

Free X video limit is about 2:20, so this will upload natively. Still keep it short — Invoice Link and Penstock set the bar with real on-chain motion.

## 0:00–0:12 — Problem

On screen: an Instagram DM. A buyer sends a transfer screenshot. A seller in Lagos has to choose "send the goods" or "lose the sale."

Say:

> Across Africa, sellers on Instagram, WhatsApp, Telegram and other chat apps lose goods to fake transfer screenshots. Buyers do not want to pay first. Both sides get stuck between pay-now and pay-on-delivery.

## 0:12–0:28 — The lock (only after the testnet gate)

On screen: buyer opens `/pay`, amount and network are visible. Buyer wallet
confirms a real testnet funding transaction. Show its explorer link and the
deal status changing to `Funded`. If this step is only mocked, label it
`simulated` and do not claim funds are locked on chain.

Say, if this matches the recording:

> This testnet deal is funded in [name the actual token]. The agent can help
> agree the terms, but it does not hold a key that can move escrow funds.

Do not claim cross-chain Intents execution or verified naira funding unless
those integrations are live and shown. A dry quote is a quote, not funding.

## 0:28–0:48 — The rider (only after payout verification)

On screen: rider opens `/scan` and uses the rider account/key to submit the
buyer-authorized one-time QR. Show the actual transaction result, then verify
the seller's on-chain token balance increased and the dashboard reflects the
on-chain status.

Say, only if the key restriction and QR authorization have passed their tests:

> The rider confirms delivery with a restricted key. The contract checks the
> delivery proof and the seller's payout is visible on chain.

## 0:48–1:05 — A failure case (optional)

Show one failure case only if it was actually exercised. For a replay test,
show the rejected second transaction and unchanged seller balance. For the
receipt checker, show the local/API verdict and label it as a receipt-check
demo; do not imply it independently controls on-chain funding unless that
integration exists. A timeout refund may be shown using a separate test deal
with a short configured deadline; show the refund transaction and buyer
balance, not a sped-up or fabricated chain event.

If no failure case is ready, use this time for a clear status/transaction
proof rather than presenting an unverified attack demo.

## 1:05–1:25 — Close

On screen: repo URL, actual network, and verified transaction link. Include a
mainnet link only if a real, safely sized mainnet transfer was completed.

Say:

> TrustLock is being built for pay-on-delivery in African social commerce.
> This is a [testnet / mainnet] transaction, and the code and current test
> status are public.

Cut. No logo montage after the explorer link.

## Evidence checklist

1. Use a fictional DM/receipt; do not show personal or financial data.
2. Capture deal creation and real funding transaction, or visibly label a
   simulation.
3. Capture rider confirmation and the seller balance/status after payout.
4. Optionally show a tested replay rejection, timeout refund, or local
   injection-check result with accurate labels.
5. Keep transaction links and test results available to support every claim.

If mainnet Intents is not ready, say "testnet" on screen. Never overlay a
fabricated hash or imply a dry quote moved funds.
