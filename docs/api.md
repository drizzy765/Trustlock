# Agent HTTP API

Base URL: `NEXT_PUBLIC_AGENT_URL` (local default `http://127.0.0.1:8080`).  
JSON in and out. No API key required in demo mode. Never return secrets.

## `GET /health`

```json
{"ok": true, "mode": "demo", "intents_mode": "dry", "network": "testnet", "contract": "trustlock.testnet"}
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

Request limits: `text` is 1 to 2000 characters; `language_hint` is `"pcm"`, `"yo"` or `"en"` (anything else is a 400 `ERR_INVALID_INPUT`, see Errors). It wins over detection. Without a hint the language is detected: Yoruba letters (ẹ, ọ, ṣ) first, then Pidgin words, then Yoruba words, otherwise English.

How the terms are read:

- `price_ngn`: an explicit currency amount first (`₦3,500`, `NGN 3500`, `n3500`), then k notation (`2k5` and `2.5k` are 2,500, `10k`, `12k5`), then `4500 naira`, then Yoruba number words (`egberun marun` is 5,000), then a bare number of 3 to 9 digits. Amounts under 100 or above 100,000,000 are ignored (so a huge number is "no price", never an error). `null` if none.
- `deadline_hours`: 24 for tomorrow or today (`tomorrow`, `tmrw`, `ni ọ̀la`), `N x 24` for `N days`, otherwise 48.
- `item`: what is left once the price, delivery and filler words are removed (a number is dropped only when it is the price: `iPhone 12` keeps its 12), in the buyer's own spelling (Yoruba accents kept). `"item"` if nothing is left.
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

What the screen is and is not: a deterministic heuristic (`agent/app/guard.py`), not a model and not the security boundary. The boundary is that the agent holds no key and has no route that pays, refunds or calls `confirm_delivery`; the screen is defence in depth and a clear answer. It also refuses a secret typed behind a label (`seed phrase: ...`, `secret key: ...`, `my password is ...`) or any single 32+ character token with letters (a pasted key), so the text never reaches the parser or the response. It reads through accents, zero-width characters, full-width and look-alike letters, `l33tspeak` and `r e l e a s e`. It leaves honest terms alone (`release the funds after delivery` is a deal term, `release the funds now` is a command). It does not recognise a bare list of seed words with no label, other languages, a request split over several messages, or a paraphrase it has no pattern for; a few ordinary messages are refused by mistake (for example a buyer writing `send the money back if the shoes are bad`), and the person can rewrite them.

## `POST /deals/draft`

Store an unsigned draft that the seller wallet will submit as `create_deal`. The draft lives in
the agent's memory (lost on restart) until persistent storage lands.

Request:

```json
{
  "seller_id": "seller-timi.testnet",
  "buyer_id": "buyer-ada.testnet",
  "rider_id": "rider-timi.testnet",
  "item": "black sandal",
  "price_ngn": 2500,
  "deadline_hours": 24,
  "qr_hash": "<64 hex characters: sha256 of the buyer's one-time QR secret>"
}
```

`rider_id` and `qr_hash` are optional. Account ids must be NEAR account ids, `price_ngn` is a
positive integer, `deadline_hours` is 1 to 720. Unknown fields are rejected with a 400, so a key,
seed phrase or `qr_preimage` sent by mistake is never stored. The agent never generates or keeps
the QR preimage: the buyer side makes it and sends only the hash.

Response: the stored draft, with `deal_id` (the agent's draft id, not the contract's),
`status: "draft"`, `onchain_deal_id: null`, `funding_tx: null`, `intents_quote: null` and
`created_at` (UTC).

## `POST /deals/{deal_id}/onchain`

After the seller wallet has called `create_deal`, record the id the contract returned:
`{"onchain_deal_id": 7}`. The agent first calls the contract's `get_deal` view and records the id
only if that deal exists and has the draft's seller, buyer (and rider, when the draft has one).
It is a read-only check: the agent signs nothing. Then `status` becomes `"submitted"`.

Errors: 404 `ERR_DEAL_NOT_FOUND`; 409 `ERR_NO_CONTRACT` (no `TRUSTLOCK_CONTRACT_ID`),
`ERR_ALREADY_LINKED`, `ERR_ONCHAIN_NOT_FOUND`, `ERR_ONCHAIN_MISMATCH`; 502 `ERR_RPC`.

## `GET /deals/{deal_id}`

The draft plus the on-chain deal and local receipt / Intents metadata:

```json
{
  "deal_id": 1, "status": "submitted", "onchain_deal_id": 7, "...": "draft fields",
  "contract_id": "trustlock-timi.testnet",
  "onchain_status": "found",
  "onchain": {"seller": "...", "rider": "...", "buyer": "...", "payer": null, "item": "...",
              "price": "2500000", "deadline_ms": 1900000000000, "status": "Created",
              "qr_consumed": false},
  "agent_metadata": {"receipt_status": null, "intents_quote": null}
}
```

`onchain_status` is `no_contract` (no `TRUSTLOCK_CONTRACT_ID`, nothing called), `not_submitted`
(no on-chain id recorded, nothing called), `found` (live `get_deal` result in `onchain`) or
`missing` (the contract no longer returns that deal). `onchain` is `null` unless `found`; the agent
never invents an on-chain id or state. The RPC is `NEAR_NODE_URL`, else the public RPC of
`NEAR_NETWORK`. An RPC failure is a 502 `ERR_RPC`; an unknown `deal_id` is a 404.

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

Asks 1Click for a real quote and returns it **only after verifying its ed25519 signature**
(Penstock pattern). In `demo` and `dry` modes the client sends `dry: true`; there is no
Intents testnet (HACKATHON.md Q-007).

Request — a stored draft (amount comes from `price_ngn * 1000` USDC base units), or an
explicit tiny amount:

```json
{"deal_id": 1}
```

```json
{"amount": "500000"}
```

Dry amounts are capped at 100 USDC and live amounts at 0.50 USDC. Live mode also refuses
to quote unless `TRUSTLOCK_INTENTS_RECIPIENT` and `TRUSTLOCK_INTENTS_REFUND_TO` are set to
real addresses.

Response (dry):

```json
{
  "mode": "dry",
  "dry": true,
  "quote_id": "77Xv8sCU4HrTkXPNmah1xpJBoBgETAmCtZUbwhKLZh7q",
  "correlation_id": "a9d3b0d1-d3cb-4853-a5cb-aef39fbb12ac",
  "signature": "ed25519:...",
  "signer": "ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc",
  "signature_verified": true,
  "origin_asset": "nep141:base-0x8335...omft.near",
  "destination_asset": "nep141:17208628...",
  "recipient": "trustlock-timi.testnet",
  "amount_in": "2500000",
  "amount_in_formatted": "2.5",
  "amount_in_usd": "2.49871",
  "amount_out": "2499707",
  "amount_out_formatted": "2.499707",
  "amount_out_usd": "2.498417151188",
  "min_amount_out": "2474709",
  "deadline": "2026-11-13T17:15:39.724Z",
  "expired": false,
  "deposit_address": null,
  "tx_hash": null,
  "executed": false,
  "created_at": "2026-11-13T16:45:40+00:00"
}
```

`quote_id` is the base58 SHA-256 of the signed payload, not a transaction hash. When the
request names a `deal_id`, the verified summary is stored on that draft and appears in
`GET /deals/{deal_id}` as `agent_metadata.intents_quote`. `deposit_address` is `null` for
dry quotes because 1Click does not return one without `dry: false`.

Errors: 400 `ERR_INVALID_AMOUNT`, `ERR_AMOUNT_TOO_LARGE`; 404 `ERR_DEAL_NOT_FOUND`;
502 `ERR_BAD_QUOTE_SIGNATURE`, `ERR_QUOTE_MISMATCH`, `ERR_INTENTS_UPSTREAM`;
503 `ERR_INTENTS_CONFIG` (live without real addresses, or a non-HTTPS
`ONECLICK_API_URL` while `ONECLICK_JWT` is set). `ERR_QUOTE_MISMATCH` means the
signed quote's request fields (route, amount, recipient/refund address, swap/deposit/
recipient/refund type) do not match this call. A rejected quote never includes an
amount or a hash.

Optional partner JWT: `ONECLICK_JWT` from the environment only. It is sent as
`Authorization: Bearer …`, never committed, logged, or returned. A non-HTTPS
`ONECLICK_API_URL` is rejected with 503 `ERR_INTENTS_CONFIG` before the token is
attached; plain HTTP is allowed only when no JWT is set.

## `POST /intents/execute`

Request: `{"deal_id": 1}`.

Rejected with 409 `ERR_NOT_LIVE` unless `TRUSTLOCK_INTENTS_MODE=live`. In live mode this
build returns 501 `ERR_LIVE_NOT_WIRED`: live execution is a separate optional issue, and
nothing here fabricates a transaction hash. No funds are moved by this endpoint.

## Seller agent: built-in or bring your own model (issue #26)

The agent reads, checks, explains, recommends and prepares unsigned transactions. No provider has
a tool that moves, releases or refunds funds. Every provider gets the same seven tools
(`agent/app/tools.py`): `draft_deal`, `explain_deal`, `check_order_evidence` (planned, always
`UNVERIFIED` today), `check_receipt`, `get_deal_status`, `recommend_release`, `prepare_confirm_tx`
(unsigned, signer is the buyer). Any other tool name a model asks for returns
`ERR_TOOL_NOT_ALLOWED` and nothing runs.

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /agent/providers` | | `[{id, label, status, needs_key}]`; `status` is `works_with` only once tested end to end, else `planned` |
| `GET /sellers/{seller_id}/agent` | | `{seller_id, provider, key: {saved, masked}}` |
| `PUT /sellers/{seller_id}/agent` | `{provider}` | same; 404 `ERR_UNKNOWN_PROVIDER` |
| `PUT /sellers/{seller_id}/agent/key` | `{api_key}` | same, `masked` shows the last 4 characters; saving again rotates the key |
| `DELETE /sellers/{seller_id}/agent/key` | | same plus `deleted` |
| `POST /sellers/{seller_id}/agent/test` | | `{provider, ok}` |
| `POST /sellers/{seller_id}/agent/ask` | `{message}` | `{provider, text, refused, code, tool_calls, can_move_funds: false}` |

Keys are encrypted at rest with envelope encryption (`agent/app/keystore.py`): a random AES-256-GCM
data key per saved key, wrapped with `TRUSTLOCK_KEY_ENCRYPTION_KEY` (32 bytes, base64, from Doppler
or Infisical), and the seller id bound as associated data. The plaintext exists only inside one
provider call. Without `TRUSTLOCK_KEY_ENCRYPTION_KEY` saving returns 503 `ERR_KEYSTORE`. Keys never
appear in responses, error messages, `/health` or `NEXT_PUBLIC_*`.

A message that tries to move money or get a key is refused by the guard before any model is called.
Provider failures are 502 with `ERR_PROVIDER_AUTH`, `ERR_PROVIDER_UNREACHABLE`, `ERR_PROVIDER_PLANNED`
or `ERR_NO_KEY`.

Status today: `builtin` works with. `anthropic` (Claude, official SDK, default model `claude-opus-5-5`,
`TRUSTLOCK_ANTHROPIC_MODEL` to change it) is implemented and tested against a scripted client, not
yet against the live API, so it stays `planned`. OpenAI, Gemini, OpenRouter and Muse are listed as
`planned` and refuse test and ask.

Limits: these endpoints have no seller authentication yet, so anyone who knows a seller id can set
or replace that seller's key (it can never be read back). Storage is in memory, like the drafts.

## Errors

Use HTTP 400 for user mistakes, 404 for an unknown draft id, 409 for illegal deal transitions the agent already knows about, 502 for RPC/1Click failures. Body: `{"error": "ERR_CODE", "message": "..."}`.

Every request that fails validation (missing, malformed or unknown fields) is a 400
`ERR_INVALID_INPUT` whose message names the fields but never repeats the values sent.
