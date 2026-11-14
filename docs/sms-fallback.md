# SMS / USSD-style fallback (no live gateway in v1)

**Status:** documented copy + UI mock only. No SMS gateway is wired. Do not claim
live SMS or USSD delivery.

**Why:** riders and sellers will not always have a stable browser session or a
working camera. The fallback below shows the delivery still ends in the same
on-chain rules: `confirm_delivery` + one-time buyer QR, rider-only, replay
rejected, before the deadline.

## Rider: camera fails → short code / pasted token

`/scan` is the primary path. The camera box is a placeholder; the text input
below it **is** the fallback:

1. Buyer shows the one-time QR. If the rider camera cannot read it, the buyer
   reads out the short token (the 64-hex preimage, or a shorter code the buyer
   app derived from it) over any chat: WhatsApp, Telegram, X, SMS, email.
2. Rider opens `/scan`, enters the deal ID, and pastes the token into
   "Fallback: paste short code / token".
3. Rider submits with the rider wallet (function-call key, `confirm_delivery`
   only). The contract checks: caller is the deal rider, deal is `Funded`,
   hash matches `qr_hash`, QR not consumed, deadline not passed.
4. Same outcomes as a scan: `Released` on success; `ERR_REPLAYED_QR`,
   `ERR_NOT_RIDER`, `ERR_BAD_STATUS` otherwise. A pasted token replays exactly
   like a re-scanned QR — it fails.

Example script (read out, not a real SMS integration):

```text
Buyer -> Rider (any chat): Deal 7 ready. Code:
  00000000...0001  (64-hex one-time token)
Rider -> /scan: paste code into Fallback input, Confirm Delivery.
Chain -> Seller: Released. Explorer link in /dashboard.
```

## Seller: notified of Funded / Released without a live push

No push notification exists in v1. The seller checks state, same data the
contract returns:

1. Buyer funds escrow → deal becomes `Funded`. Seller verifies in
   `/dashboard` (deal status) or `get_deal` + explorer tx link.
2. Rider confirms → deal becomes `Released`, seller USDC balance increases.
   Seller verifies the payout tx on the explorer and the `Released` status.
3. If no proof before the deadline, anyone calls `claim_timeout_refund` and
   the buyer is refunded; the dashboard shows `Refunded`.

Copy for the seller (any chat app):

```text
Funded: Deal 7 is Funded. Ship the black sandal.
Released: Deal 7 Released. 2.5 USDC paid. Explorer: <tx link>.
```

## Boundaries

- The fallback never bypasses `confirm_delivery` or the one-time QR rules.
- No SMS/USSD provider is wired; there are no partner logos.
- A screenshot of an SMS is never proof — same rule as bank/mobile-money
  screenshots (`POST /receipts/check` never `CONFIRMED` on image alone).
