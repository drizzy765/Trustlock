//! near-workspaces sandbox tests.
//!
//! Enable these once `near-workspaces` is in Cargo.toml and `cargo near` can
//! produce a WASM blob. Until then they are documentation of the safety battery
//! in docs/benchmark.md (S01-S09).
//!
//! Planned cases:
//! - rider function-call key can call confirm_delivery and nothing else
//! - replayed QR hash panics
//! - double confirm panics
//! - timeout refund after deadline
//! - open_dispute freezes payout

#[test]
fn placeholder_documents_the_sandbox_plan() {
    assert!(true);
}
