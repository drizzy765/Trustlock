//! near-workspaces sandbox tests for TrustLock escrow.
//!
//! Safety battery S01-S09 and additional security scenarios.
//! Run with: cargo test --test workspaces

mod utils;

// Safety battery tests (S01-S09)
mod spec {
    mod s01_happy_path;
    mod s02_double_release;
    mod s03_replayed_qr;
    mod s04_timeout_refund;
    mod s05_early_refund;
    mod s06_stranger;
    mod s07_rider_key;
    mod s08_wrong_amount;
    mod s09_dispute_freeze;
    mod s10_buyer_qr_auth;
    mod s11_payout_failure;
    mod s12_refund_failure;
    mod s13_dispute_race;
}
