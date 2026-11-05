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
