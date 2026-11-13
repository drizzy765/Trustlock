# Recorded 1Click dry run (benchmark I01)

Date: 2026-11-13 (UTC). Mode: `TRUSTLOCK_INTENTS_MODE=dry` (the default).
Command, from the repository root with the agent venv active:

```powershell
python scripts/intents_dry_run.py --amount 500000
```

Raw output is committed at `tests/output/intents_dry_run.log`:

```text
recorded_at=2026-11-13T16:47:13+00:00
command=python scripts/intents_dry_run.py --amount 500000
TRUSTLOCK_INTENTS_MODE=dry
POST https://1click.chaindefuser.com/v0/quote
dry=true
signature_verified=true
signer=ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc
quote_id=EwNTNuM2AsBdwpJ7hiM2MivRaNufLH18iQrEy6EHquUo
correlation_id=13b74b6a-c77c-4458-9f15-25b658dfd9d0
amount_in=500000 (0.5 USDC)
amount_out=499898 (0.499898 USDC)
min_amount_out=494899
deadline=2026-11-13T17:17:12.299Z
expired=false
deposit_address=none
tx_hash=none
executed=false
note=dry quote; no deposit address and no transaction hash exist
```

What this proves, and what it does not:

- The agent sent a real `POST https://1click.chaindefuser.com/v0/quote` with `dry: true`.
- 1Click signed the payload and the agent verified the ed25519 signature with the manager key
  published in the official SDK (`ed25519:reYaWhvwu8Jzo3WUM3zhn6VrhuMEF4eADL17qtRVifc`).
- `quote_id` is the base58 SHA-256 of the signed payload, not a transaction hash.
- There is **no** deposit address and **no** mainnet transaction, because `dry: true` means exactly
  that. Nothing was faked and no funds moved.
- The refund address in the dry request is the documented placeholder. Live mode refuses to run
  without real `TRUSTLOCK_INTENTS_RECIPIENT` and `TRUSTLOCK_INTENTS_REFUND_TO` values.

Offline reproduction (no network): `cd agent && python -m pytest ../tests/test_agent_intents.py -v`.
Those tests replay the recorded fixture `tests/fixtures/oneclick_dry_quote.json` through the same
verifier and rehearse I01/I03, including tampered payloads.

## Through the HTTP API (end to end)

The route was also exercised over HTTP with `uvicorn`, proving the wiring rather than just the
module. Raw transcript: `tests/output/intents_dry_run_http.log`.

```text
recorded_at=2026-11-13T17:42:44Z
command=uvicorn app.main:app --port 8099 (TRUSTLOCK_INTENTS_MODE=dry)

POST /deals/draft
{"deal_id":1,...,"price_ngn":2500,...,"intents_quote":null,...}

POST /intents/quote {"deal_id": 1}
{"mode":"dry","dry":true,
 "quote_id":"29t1HQ2c8toZmnAnH9MjPVKWtN8iSymP9iEeV87zxDnx",
 "signature_verified":true,
 "amount_in":"2500000","amount_in_formatted":"2.5",
 "amount_out":"2499494","amount_out_formatted":"2.499494",
 "deposit_address":null,"tx_hash":null,"executed":false,...}

GET /deals/1 → agent_metadata.intents_quote has the same quote_id and no transaction hash
```

The draft stores a quote id and no hash, exactly as benchmark I01 requires.

If 1Click cannot be reached, the script exits non-zero and prints the error code. It never invents
a hash.
