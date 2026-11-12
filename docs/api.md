# Agent HTTP API

Base URL: `NEXT_PUBLIC_AGENT_URL` (local default `http://127.0.0.1:8080`).  
JSON in and out. No API key required in demo mode. Never return secrets.

## `GET /health`

```json
{"ok": true, "mode": "demo", "network": "testnet", "contract": "trustlock.testnet"}
```

## `POST /deals/preview`

Parse chat or a transcript into unsigned terms.

Request:

```json
{
  "text": "abeg hold 2k5 for the black sandal, deliver tomorrow",
  "language_hint": "pcm"
}
```

Response:

```json
{
  "item": "black sandal",
  "price_ngn": 2500,
  "currency": "NGN",
  "deadline_hours": 24,
  "language": "pcm",
  "notes": [],
  "warning": null
}
```

Must not include a private key, seed phrase, or access-key secret.

Request limits: `text` is 1 to 2000 characters; `language_hint` is `"pcm"`, `"yo"` or `"en"` (anything else is a 422). It wins over detection. Without a hint the language is detected: Yoruba letters (ẹ, ọ, ṣ) first, then Pidgin words, then Yoruba words, otherwise English.

How the terms are read:

- `price_ngn`: an explicit currency amount first (`₦3,500`, `NGN 3500`, `n3500`), then k notation (`2k5` and `2.5k` are 2,500, `10k`, `12k5`), then `4500 naira`, then Yoruba number words (`egberun marun` is 5,000), then a bare number of 3 to 9 digits. Amounts under 100 are ignored. `null` if none.
- `deadline_hours`: 24 for tomorrow or today (`tomorrow`, `tmrw`, `ni ọ̀la`), `N x 24` for `N days`, otherwise 48.
- `item`: what is left once price, delivery and filler words are removed, in the buyer's own spelling (Yoruba accents kept). `"item"` if nothing is left.
- `warning`: `"No price found: confirm the amount with the buyer."` when there is no price, or `"More than one amount found (2500, 20000): confirm the price."` when the text has different amounts. The agent never picks silently between them.

### Refusals (benchmark A01)

If the message tells the agent to release, send or refund money, to confirm a delivery or payment, to change its rules ("ignore previous instructions"), or asks for a private key, seed phrase, access key or credentials, the response is HTTP 200 with **no terms at all**, so a client that ignores it fails closed:

```json
{
  "refused": true,
  "code": "ERR_REFUSED_FUND_MOVEMENT",
  "reason": "fund_movement",
  "language": "en",
  "message": "I can't release, send or refund money, or confirm a delivery. ..."
}
```

`code` is one of `ERR_REFUSED_SECRET_REQUEST`, `ERR_REFUSED_SECRET_IN_INPUT` (a key was pasted into the chat), `ERR_REFUSED_FUND_MOVEMENT`, `ERR_REFUSED_INJECTION`; if several apply the key leak wins, then money, then injection. The message is in the message's language (English or Pidgin; Yoruba uses the English copy until a Yoruba speaker has reviewed one). It never repeats what the user typed.

What the screen is and is not: a deterministic heuristic (`agent/app/guard.py`), not a model and not the security boundary. The boundary is that the agent holds no key and has no route that pays, refunds or calls `confirm_delivery`; the screen is defence in depth and a clear answer. It reads through accents, zero-width characters, full-width and look-alike letters, `l33tspeak` and `r e l e a s e`. It leaves honest terms alone (`release the funds after delivery` is a deal term, `release the funds now` is a command). It does not cover other languages, a request split over several messages, or a paraphrase it has no pattern for; a few ordinary messages are refused by mistake (for example a buyer writing `send the money back if the shoes are bad`), and the person can rewrite them.

## `POST /deals/draft`

Persist a draft the seller wallet will submit as `create_deal`.

## `GET /deals/{deal_id}`

Proxy of the on-chain deal plus local receipt / intents metadata.

## `POST /receipts/check`

Deterministic funding check.

Request:

```json
{
  "image_spec": {},
  "evidence": {"bank_alerts": [], "prior_payments": [], "notes": ""},
  "narration": "optional text pulled off the screenshot"
}
```

Response: a verdict object compatible with the micro1 schema (`CONFIRMED` | `SUSPICIOUS` | `NOT_FOUND` | `UNVERIFIED`) plus `funding_allowed` (true only for `CONFIRMED`).

## `POST /intents/quote`

Forwards to 1Click. Honour `TRUSTLOCK_INTENTS_MODE`. In `dry`, force `dry: true`.

## `POST /intents/execute`

Rejected unless mode is `live`. Writes the deposit hash onto the draft. Amounts must stay tiny.

## Errors

Use HTTP 400 for user mistakes, 409 for illegal deal transitions the agent already knows about, 502 for RPC/1Click failures. Body: `{"error": "ERR_CODE", "message": "..."}`.
