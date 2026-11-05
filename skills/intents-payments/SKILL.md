# Skill: NEAR Intents / 1Click payments

## When to use

Anything that quotes or moves USDC through Intents into the escrow.

## Invariants

- HACKATHON.md Q-007: **no Intents testnet**. `TRUSTLOCK_INTENTS_MODE=dry` sends `dry: true`. `live` is real mainnet and must stay tiny.
- Default the app to `demo` or `dry`. The UI badge must match the backend.
- Verify 1Click quote signatures before showing an amount (Penstock).
- Partner JWT is optional (Q-006, ~0.2% extra fee without). Signup is an auth wall at https://partners.near-intents.org — not public API docs.
- Execution is `POST /v0/deposit/submit` after a quote, then poll `/v0/status`. A quote alone is not a payment (that is the ClearSend gap).
- Escrow itself holds USDC on NEAR. Other chains are source assets via Intents.
- Never log the JWT.

## Endpoints (verified)

- Docs: https://docs.near-intents.org/
- 1Click: https://docs.near-intents.org/integration/distribution-channels/1click-api
- Tokens: https://1click.chaindefuser.com/v0/tokens
- Code: https://github.com/near/intents
- Skill pack: `npx skills add near/agent-skills --skill near-intents`

## Honesty

If you cannot execute live safely, ship dry quotes + testnet escrow and say so. Testnet-only is eligible (Q-010). Fabricating an explorer hash is a disqualification-level lie.
