//! Security review (issue #21): each test reproduces one finding in docs/security_review.md
//! against the current contract. The asserts describe today's behaviour, so a test that starts
//! failing after a fix is expected: flip it to assert the safe behaviour.

use near_sdk::json_types::U128;
use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::{testing_env, AccountId, PromiseResult};
use trustlock::{Contract, DealStatus};

const PRICE: u128 = 5_000_000;
const NOW: u64 = 1_000_000;
const DEADLINE: u64 = 2_000_000;

fn usdc() -> AccountId {
    accounts(0)
}
fn seller() -> AccountId {
    accounts(1)
}
fn rider() -> AccountId {
    accounts(2)
}
fn buyer() -> AccountId {
    accounts(3)
}
fn stranger() -> AccountId {
    accounts(4)
}

fn ctx(predecessor: AccountId, now_ms: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id("trustlock.testnet".parse().unwrap())
        .predecessor_account_id(predecessor)
        .block_timestamp(now_ms * 1_000_000);
    b
}

fn act(predecessor: AccountId, now_ms: u64) {
    testing_env!(ctx(predecessor, now_ms).build());
}

/// A callback run with the given result of the ft_transfer it follows.
fn callback(now_ms: u64, result: PromiseResult) {
    let mut b = ctx("trustlock.testnet".parse().unwrap(), now_ms);
    b.signer_account_id("trustlock.testnet".parse().unwrap());
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        vec![result]
    );
}

fn qr(preimage: &str) -> String {
    near_sdk::env::sha256_array(preimage.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn status(c: &Contract, id: u64) -> String {
    c.get_deal(id).unwrap().status
}

/// Seller creates a deal (rider and QR hash of the seller's choice) and the buyer funds it.
fn funded(rider_id: AccountId, preimage: &str) -> (Contract, u64) {
    act(seller(), NOW);
    let mut c = Contract::new(usdc());
    let id = c.create_deal(
        seller(),
        rider_id,
        buyer(),
        "black sandal".into(),
        U128(PRICE),
        DEADLINE,
        qr(preimage),
    );
    act(usdc(), NOW);
    let _ = c.ft_on_transfer(buyer(), U128(PRICE), id.to_string());
    (c, id)
}

fn panics(f: impl FnOnce()) -> String {
    let err =
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)).expect_err("expected a panic");
    err.downcast_ref::<String>()
        .cloned()
        .or_else(|| err.downcast_ref::<&str>().map(|s| s.to_string()))
        .unwrap_or_default()
}

// H-1: the seller picks the rider and the QR hash, so the seller can release without delivering.
#[test]
fn h1_seller_names_themself_rider_and_releases_without_delivery() {
    let (mut c, id) = funded(seller(), "seller-made-secret");
    act(seller(), NOW + 1);
    let _ = c.confirm_delivery(id, "seller-made-secret".into());
    assert_eq!(status(&c, id), "Delivered"); // payout to the seller is now in flight
    callback(NOW + 1, PromiseResult::Successful(vec![]));
    assert!(c.on_payout(id, DealStatus::Funded));
    assert_eq!(status(&c, id), "Released");
}

// H-2: Disputed has no exit. No resolve method exists, so the price is locked forever.
#[test]
fn h2_a_dispute_locks_the_funds_for_good() {
    let (mut c, id) = funded(rider(), "buyer-secret");
    act(buyer(), NOW + 1);
    c.open_dispute(id, "changed my mind".into());
    assert_eq!(status(&c, id), "Disputed");

    act(buyer(), NOW + 2);
    assert!(panics(|| drop(c.confirm_receipt(id))).contains("ERR_BAD_STATUS"));
    act(rider(), NOW + 2);
    assert!(
        panics(|| drop(c.confirm_delivery(id, "buyer-secret".into()))).contains("ERR_BAD_STATUS")
    );
    act(buyer(), DEADLINE + 1);
    assert!(panics(|| drop(c.claim_timeout_refund_for(id))).contains("ERR_BAD_STATUS"));
}

// M-1: after a failed payout the QR stays in used_qr, so the rider can never retry.
#[test]
fn m1_failed_payout_blocks_the_rider_retry() {
    let (mut c, id) = funded(rider(), "buyer-secret");
    act(rider(), NOW + 1);
    let _ = c.confirm_delivery(id, "buyer-secret".into());
    callback(NOW + 1, PromiseResult::Failed);
    assert!(!c.on_payout(id, DealStatus::Funded));
    assert_eq!(status(&c, id), "Funded");
    assert!(!c.get_deal(id).unwrap().qr_consumed);

    act(rider(), NOW + 2);
    assert!(
        panics(|| drop(c.confirm_delivery(id, "buyer-secret".into()))).contains("ERR_REPLAYED_QR")
    );
}

// M-2: a failed refund leaves the deal Expired, and the refund only runs from Funded.
#[test]
fn m2_failed_refund_cannot_be_retried() {
    let (mut c, id) = funded(rider(), "buyer-secret");
    act(buyer(), DEADLINE + 1);
    let _ = c.claim_timeout_refund_for(id);
    callback(DEADLINE + 1, PromiseResult::Failed);
    assert!(!c.on_refund(id));
    assert_eq!(status(&c, id), "Expired");

    act(buyer(), DEADLINE + 2);
    assert!(panics(|| drop(c.claim_timeout_refund_for(id))).contains("ERR_BAD_STATUS"));
}

// M-3: a dispute opened while a payout is in flight is overwritten by the callback.
#[test]
fn m3_payout_callback_overwrites_a_dispute() {
    let (mut c, id) = funded(rider(), "buyer-secret");
    act(rider(), NOW + 1);
    let _ = c.confirm_delivery(id, "buyer-secret".into());
    act(buyer(), NOW + 1);
    c.open_dispute(id, "item damaged".into());
    assert_eq!(status(&c, id), "Disputed");

    callback(NOW + 1, PromiseResult::Failed);
    c.on_payout(id, DealStatus::Funded);
    assert_eq!(status(&c, id), "Funded"); // the dispute is gone
}

// M-4: anyone can create deals, with any item length, and the contract pays the storage.
#[test]
fn m4_anyone_creates_deals_and_the_contract_pays_storage() {
    act(stranger(), NOW);
    let mut c = Contract::new(usdc());
    let id = c.create_deal(
        seller(),
        rider(),
        buyer(),
        "x".repeat(50_000),
        U128(1),
        DEADLINE,
        qr("spam"),
    );
    assert_eq!(c.get_deal(id).unwrap().item.len(), 50_000);
}

// L-1: any account can fund a deal; the refund then goes to that account, not the buyer.
#[test]
fn l1_a_third_party_can_fund_and_is_recorded_as_payer() {
    act(seller(), NOW);
    let mut c = Contract::new(usdc());
    let id = c.create_deal(
        seller(),
        rider(),
        buyer(),
        "black sandal".into(),
        U128(PRICE),
        DEADLINE,
        qr("s"),
    );
    act(usdc(), NOW);
    let _ = c.ft_on_transfer(stranger(), U128(PRICE), id.to_string());
    assert_eq!(c.get_deal(id).unwrap().payer, Some(stranger()));
}

// Controls that hold (no finding).
#[test]
fn ok_wrong_token_wrong_amount_stranger_and_replay_are_rejected() {
    act(seller(), NOW);
    let mut c = Contract::new(usdc());
    let id = c.create_deal(
        seller(),
        rider(),
        buyer(),
        "sandal".into(),
        U128(PRICE),
        DEADLINE,
        qr("q"),
    );
    act(stranger(), NOW);
    assert!(
        panics(|| drop(c.ft_on_transfer(buyer(), U128(PRICE), id.to_string())))
            .contains("ERR_BAD_TOKEN")
    );
    act(usdc(), NOW);
    assert!(
        panics(|| drop(c.ft_on_transfer(buyer(), U128(PRICE - 1), id.to_string())))
            .contains("ERR_WRONG_AMOUNT")
    );
    let _ = c.ft_on_transfer(buyer(), U128(PRICE), id.to_string());
    act(stranger(), NOW + 1);
    assert!(panics(|| drop(c.confirm_delivery(id, "q".into()))).contains("ERR_NOT_RIDER"));
    act(rider(), NOW + 1);
    assert!(panics(|| drop(c.confirm_delivery(id, "wrong".into()))).contains("ERR_BAD_QR"));
    act(rider(), DEADLINE + 1);
    assert!(panics(|| drop(c.confirm_delivery(id, "q".into()))).contains("ERR_NOT_EXPIRED"));
    act(buyer(), NOW + 1);
    assert!(panics(|| drop(c.claim_timeout_refund_for(id))).contains("ERR_NOT_EXPIRED"));
    act(stranger(), NOW + 1);
    assert!(panics(|| drop(c.confirm_receipt(id))).contains("ERR_NOT_BUYER"));
    // A used QR hash cannot open a new deal.
    act(rider(), NOW + 1);
    let _ = c.confirm_delivery(id, "q".into());
    act(seller(), NOW + 2);
    assert!(panics(|| drop(c.create_deal(
        seller(),
        rider(),
        buyer(),
        "x".into(),
        U128(1),
        DEADLINE,
        qr("q")
    )))
    .contains("ERR_REPLAYED_QR"));
}
