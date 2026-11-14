# Skill: NEAR contract development (Podlock)

## When to use

Any change to `contract/`, access keys, deploy scripts, or on-chain status handling.

## Invariants

- State machine: Created → Funded → Delivered/Expired → Released/Refunded/Disputed.
- No `attest` method. Release is `confirm_delivery` only (plus timeout refund and a logged `resolve_dispute`).
- Rider function-call key: `method_names: ["confirm_delivery"]` only.
  Docs: https://docs.near.org/protocol/accounts-contracts/access-keys
- QR hash is consumed on success. Replay panics `ERR_REPLAYED_QR`.
- Double confirm panics `ERR_ALREADY_RELEASED` / `ERR_BAD_STATUS`.
- Refund before deadline panics `ERR_NOT_EXPIRED`.
- Panic codes stay stable so tests and the README can name them.
- Use near-sdk 5.x `#[near]` style, the same family as ClearSend, but do not copy their verifier role.

## Commands

```powershell
cd contract
rustup show
cargo test -q
# later:
# cargo near build --release
```

Sandbox tests live in `contract/tests/workspaces.rs` and stay ignored until WASM + near-workspaces are wired. Do not claim they pass if they are still placeholders.

## References (verified 200)

- https://github.com/near/near-sdk-rs
- https://docs.rs/near-sdk/latest/near_sdk/
- https://github.com/near/cargo-near
- https://github.com/near/near-workspaces-rs
- https://docs.near.org/smart-contracts/what-is
- https://github.com/near/agent-skills (`npx skills add near/agent-skills`)
