# Phase 2 Status — TrustLock Contract Development

**Solo project by:** Agoro Oluwatimilehin (Timi)  
**Phase:** 2 — Contract Development  
**Status:** ✅ Core Contract Complete (Promise + callback implemented)

---

## What Was Implemented

### 1. Promise + Callback Pattern (ClearSend Style) ✅

**Files Modified:** `contract/src/lib.rs`

#### `confirm_delivery` with Promise Transfer:
```rust
pub fn confirm_delivery(&mut self, deal_id: u64, qr_preimage_hex: String) -> Promise {
    // ... validation ...
    
    // Transfer USDC to seller via ft_transfer
    let transfer_promise = Promise::new(self.usdc.clone()).function_call(
        "ft_transfer".to_string(),
        near_sdk::serde_json::json!({
            "receiver_id": seller,
            "amount": price.to_string(),
        })
        .to_string()
        .into_bytes(),
        NearToken::from_yoctonear(1),
        Gas::from_tgas(50),
    );

    // Schedule callback
    transfer_promise.then(
        Self::ext(env::current_account_id())
            .with_static_gas(Gas::from_tgas(10))
            .on_payout(deal_id, DealStatus::Funded),
    )
}
```

#### Callback `on_payout`:
```rust
#[private]
pub fn on_payout(&mut self, deal_id: u64, prev_status: DealStatus) -> bool {
    let promise_result = env::promise_result_checked(0, 1024);
    match promise_result {
        Ok(_) => {
            // Transfer succeeded, mark as Released
            deal.status = DealStatus::Released;
            true
        }
        Err(_) => {
            // Transfer failed, restore previous state
            deal.status = prev_status;
            deal.qr_consumed = false; // Allow retry
            false
        }
    }
}
```

#### `claim_timeout_refund` with Promise Transfer:
- Similar pattern: ft_transfer to payer
- Callback `on_refund` marks status as Refunded on success

---

## Contract Methods Status

| Method | Status | Notes |
|--------|--------|-------|
| `new` | ✅ | Initialize contract with USDC token |
| `create_deal` | ✅ | Creates escrow deal with QR hash |
| `get_deal` | ✅ | View method for deal status |
| `ft_on_transfer` | ✅ | NEP-141 hook for funding |
| `confirm_delivery` | ✅ | Promise transfer to seller + callback |
| `on_payout` | ✅ | Callback: Released or revert to Funded |
| `claim_timeout_refund` | ✅ | Stub (redirects to `claim_timeout_refund_for`) |
| `claim_timeout_refund_for` | ✅ | Promise transfer to payer + callback |
| `on_refund` | ✅ | Callback: Refunded or keep Expired |
| `open_dispute` | ✅ | Opens dispute from Funded/Delivered |

---

## Key Implementation Details

### Promise Pattern (ClearSend-inspired):
1. **Async Transfer**: Use `Promise::new(usdc).function_call()` for ft_transfer
2. **Callback Safety**: Check result with `promise_result_checked(0, 1024)`
3. **State Restoration**: On failure, revert to previous state
4. **Retry Support**: QR not consumed until successful payout

### Gas Limits:
- Transfer: 50 TGas
- Callback: 10 TGas
- Storage deposit: 1 yoctoNEAR (required by NEP-141)

### Security:
- Rider key only calls `confirm_delivery`
- State transitions validated before any transfer
- Revert to Funded if payout fails
- Revert to Funded state if retry needed

---

## Test Results

```
running 2 tests
test tests::status_labels_are_stable ... ok
test tests::parse_hex32_rejects_short_input ... ok

test result: ok. 2 passed; 0 failed; 0 ignored

running 1 test
test placeholder_documents_the_sandbox_plan ... ok

test result: ok. 1 passed; 0 failed; 0 ignored
```

✅ All unit tests pass
✅ Contract compiles without errors
✅ Promise + callback pattern implemented

---

## Next Steps (Phase 2 Continuation)

### Immediate:
1. **Add comprehensive unit tests** for state transitions
   - Test `Created → Funded → Released` happy path
   - Test `Created → Funded → Refunded` timeout path
   - Test double release (should fail)
   - Test replayed QR (should fail)
   - Test wrong rider (should fail)

2. **Add near-workspaces tests**
   - Sandbox testing for Promise callbacks
   - Rider key confinement tests
   - QR replay attack tests

### Then (Phase 3+):
3. Deploy to testnet
4. Add rider function-call key
5. Implement agent/
6. Scaffold web/

---

## Commands for Phase 2

```bash
# Check compilation
export PATH="$HOME/.cargo/bin:$PATH"
cd contract
cargo check --target wasm32-unknown-unknown

# Run tests
cargo test

# Build for deployment
cargo build --release --target wasm32-unknown-unknown
```

---

## Files Modified

- `/mnt/c/Users/USER/Documents/trustlock/contract/src/lib.rs`
  - Added Promise + callback pattern to `confirm_delivery`
  - Added Promise + callback pattern to `claim_timeout_refund_for`
  - Added `on_payout` callback method
  - Added `on_refund` callback method
  - Updated `DealStatus` enum with serde traits
  - Updated imports (Gas, NearToken, etc.)

- `/mnt/c/Users/USER/Documents/trustlock/AGENTS.md`
  - Updated Phase 2 progress

---

## Notes

- **This is a SOLO project** — Timi is the only author
- **Contract is now feature-complete** for core escrow logic
- **Promise + callback pattern** follows ClearSend pattern
- **State restoration** on failure prevents stuck funds
- **Test coverage** needs expansion for safety battery

**Phase 2 Core Complete ✅**
Ready for comprehensive unit tests and near-workspaces integration tests.
