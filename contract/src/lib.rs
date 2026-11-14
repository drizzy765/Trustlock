//! TrustLock escrow. Release is a rider `confirm_delivery`, never an LLM attest.
//!
//! Status: Created -> Funded -> Delivered/Expired -> Released/Refunded/Disputed

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};

pub const ERR_ALREADY_RELEASED: &str = "ERR_ALREADY_RELEASED";
pub const ERR_BAD_STATUS: &str = "ERR_BAD_STATUS";
pub const ERR_REPLAYED_QR: &str = "ERR_REPLAYED_QR";
pub const ERR_NOT_RIDER: &str = "ERR_NOT_RIDER";
pub const ERR_NOT_EXPIRED: &str = "ERR_NOT_EXPIRED";
pub const ERR_WRONG_AMOUNT: &str = "ERR_WRONG_AMOUNT";
pub const ERR_NOT_PAYER: &str = "ERR_NOT_PAYER";
pub const ERR_DEADLINE: &str = "ERR_DEADLINE";
pub const ERR_NOT_BUYER: &str = "ERR_NOT_BUYER";
pub const ERR_NOT_SELLER: &str = "ERR_NOT_SELLER";
pub const ERR_NO_PAYER: &str = "ERR_NO_PAYER";
pub const ERR_NOT_ADMIN: &str = "ERR_NOT_ADMIN";
pub const ERR_NOT_OWNER: &str = "ERR_NOT_OWNER";
pub const ERR_BAD_OUTCOME: &str = "ERR_BAD_OUTCOME";
pub const ERR_DISPUTE_OPEN: &str = "ERR_DISPUTE_OPEN";

/// A dispute left open past this window can be refunded by the buyer.
/// Nothing may stay `Disputed` forever.
pub const DISPUTE_WINDOW_MS: u64 = 7 * 24 * 60 * 60 * 1000; // 7 days

#[derive(
    BorshDeserialize,
    BorshSerialize,
    near_sdk::serde::Serialize,
    near_sdk::serde::Deserialize,
    Clone,
    Debug,
    PartialEq,
    Eq,
)]
#[borsh(crate = "near_sdk::borsh")]
#[serde(crate = "near_sdk::serde")]
pub enum DealStatus {
    Created,
    Funded,
    Delivered,
    Expired,
    Released,
    Refunded,
    Disputed,
}

impl DealStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            DealStatus::Created => "Created",
            DealStatus::Funded => "Funded",
            DealStatus::Delivered => "Delivered",
            DealStatus::Expired => "Expired",
            DealStatus::Released => "Released",
            DealStatus::Refunded => "Refunded",
            DealStatus::Disputed => "Disputed",
        }
    }
}

#[derive(BorshDeserialize, BorshSerialize, Clone, Debug)]
#[borsh(crate = "near_sdk::borsh")]
pub struct Deal {
    pub seller: AccountId,
    pub rider: AccountId,
    pub buyer: AccountId,
    pub payer: Option<AccountId>,
    pub item: String,
    pub price: u128,
    pub deadline_ms: u64,
    pub qr_hash: [u8; 32],
    pub status: DealStatus,
    pub qr_consumed: bool,
    pub disputed_at_ms: u64,
}

#[derive(BorshStorageKey, BorshSerialize)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Deals,
    UsedQr,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner: AccountId,
    pub arbiter: AccountId,
    pub usdc: AccountId,
    pub next_id: u64,
    pub deals: LookupMap<u64, Deal>,
    pub used_qr: LookupMap<[u8; 32], u64>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(usdc: AccountId, arbiter: AccountId) -> Self {
        Self {
            owner: env::predecessor_account_id(),
            arbiter,
            usdc,
            next_id: 1,
            deals: LookupMap::new(StorageKey::Deals),
            used_qr: LookupMap::new(StorageKey::UsedQr),
        }
    }

    /// Owner-only: replace the arbiter (dispute resolver).
    pub fn set_arbiter(&mut self, arbiter: AccountId) {
        require!(env::predecessor_account_id() == self.owner, ERR_NOT_OWNER);
        self.arbiter = arbiter;
        env::log_str("EVENT_JSON:{\"event\":\"arbiter_set\"}");
    }

    pub fn create_deal(
        &mut self,
        seller: AccountId,
        rider: AccountId,
        buyer: AccountId,
        item: String,
        price: U128,
        deadline_ms: u64,
        qr_hash_hex: String,
    ) -> u64 {
        require!(price.0 > 0, ERR_WRONG_AMOUNT);
        require!(deadline_ms > env::block_timestamp_ms(), ERR_DEADLINE);
        let qr_hash = parse_hex32(&qr_hash_hex);
        require!(self.used_qr.get(&qr_hash).is_none(), ERR_REPLAYED_QR);

        let id = self.next_id;
        self.next_id += 1;
        self.deals.insert(
            id,
            Deal {
                seller,
                rider,
                buyer,
                payer: None,
                item,
                price: price.0,
                deadline_ms,
                qr_hash,
                status: DealStatus::Created,
                qr_consumed: false,
                disputed_at_ms: 0,
            },
        );
        id
    }

    pub fn get_deal(&self, deal_id: u64) -> Option<DealView> {
        self.deals.get(&deal_id).map(DealView::from)
    }

    /// NEP-141 hook. The token contract must be `self.usdc` and `msg` is the deal id.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc, "ERR_BAD_TOKEN");
        let deal_id: u64 = msg.parse().expect("ERR_BAD_MSG");
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
        require!(deal.status == DealStatus::Created, ERR_BAD_STATUS);
        require!(amount.0 == deal.price, ERR_WRONG_AMOUNT);
        deal.payer = Some(sender_id);
        deal.status = DealStatus::Funded;
        PromiseOrValue::Value(U128(0))
    }

    pub fn confirm_delivery(&mut self, deal_id: u64, qr_preimage_hex: String) -> Promise {
        let now = env::block_timestamp_ms();
        let predecessor = env::predecessor_account_id();
        let hash = sha256_hex(&qr_preimage_hex);

        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
        require!(predecessor == deal.rider, ERR_NOT_RIDER);
        require!(deal.status == DealStatus::Funded, ERR_BAD_STATUS);
        require!(now <= deal.deadline_ms, ERR_NOT_EXPIRED);
        require!(hash == deal.qr_hash, "ERR_BAD_QR");
        require!(!deal.qr_consumed, ERR_REPLAYED_QR);
        require!(self.used_qr.get(&hash).is_none(), ERR_REPLAYED_QR);

        deal.qr_consumed = true;
        deal.status = DealStatus::Delivered;
        let seller = deal.seller.clone();
        let price = deal.price;
        let qr_hash = deal.qr_hash;
        self.used_qr.insert(qr_hash, deal_id);

        // Transfer USDC to seller via ft_transfer
        let transfer_promise = Promise::new(self.usdc.clone()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::json!({
                "receiver_id": seller,
                "amount": price.to_string(),
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1), // Attach 1 yoctoNEAR for storage
            Gas::from_tgas(50),
        );

        // Schedule callback to handle success/failure
        transfer_promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(10))
                .on_payout(deal_id, DealStatus::Funded),
        )
    }

    /// Callback after payout attempt. If transfer failed, restore to Funded state.
    #[private]
    pub fn on_payout(&mut self, deal_id: u64, prev_status: DealStatus) -> bool {
        let promise_result = env::promise_result_checked(0, 1024);
        match promise_result {
            Ok(_) => {
                // Transfer succeeded, mark as Released
                let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
                deal.status = DealStatus::Released;
                env::log_str(&format!(
                    "EVENT_JSON:{{\"event\":\"released\",\"deal_id\":{}}}",
                    deal_id
                ));
                true
            }
            Err(_) => {
                // Transfer failed, restore previous state so it can be retried
                let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
                let qr_hash = deal.qr_hash;
                deal.status = prev_status;
                deal.qr_consumed = false; // Allow retry with same QR
                self.used_qr.remove(&qr_hash); // Free the QR for the retry scan
                env::log_str("payout failed; state restored");
                false
            }
        }
    }

    pub fn claim_timeout_refund_for(&mut self, deal_id: u64) -> Promise {
        let now = env::block_timestamp_ms();
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
        require!(deal.status == DealStatus::Funded, ERR_BAD_STATUS);
        require!(now > deal.deadline_ms, ERR_NOT_EXPIRED);
        deal.status = DealStatus::Expired;
        let payer = deal.payer.clone().expect(ERR_NOT_PAYER);
        let price = deal.price;

        // Transfer USDC back to payer via ft_transfer
        let transfer_promise = Promise::new(self.usdc.clone()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::json!({
                "receiver_id": payer,
                "amount": price.to_string(),
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1), // Attach 1 yoctoNEAR for storage
            Gas::from_tgas(50),
        );

        // Schedule callback to handle success/failure
        transfer_promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(10))
                .on_refund(deal_id, DealStatus::Funded),
        )
    }

    /// Callback after refund attempt. If transfer failed, restore the previous
    /// state so the refund can be retried.
    #[private]
    pub fn on_refund(&mut self, deal_id: u64, prev_status: DealStatus) -> bool {
        let promise_result = env::promise_result_checked(0, 1024);
        match promise_result {
            Ok(_) => {
                // Transfer succeeded, mark as Refunded
                let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
                deal.status = DealStatus::Refunded;
                env::log_str(&format!(
                    "EVENT_JSON:{{\"event\":\"refunded\",\"deal_id\":{}}}",
                    deal_id
                ));
                true
            }
            Err(_) => {
                // Transfer failed, restore previous state so it can be retried
                let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
                deal.status = prev_status;
                env::log_str("refund failed; state restored");
                false
            }
        }
    }

    pub fn open_dispute(&mut self, deal_id: u64, _reason: String) {
        let predecessor = env::predecessor_account_id();
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
        require!(
            predecessor == deal.buyer || predecessor == deal.seller || predecessor == self.owner,
            "ERR_NOT_PARTY"
        );
        require!(
            deal.status == DealStatus::Funded || deal.status == DealStatus::Delivered,
            ERR_BAD_STATUS
        );
        deal.status = DealStatus::Disputed;
        deal.disputed_at_ms = env::block_timestamp_ms();
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"disputed\",\"deal_id\":{}}}",
            deal_id
        ));
    }

    /// Admin resolution of a Disputed deal. Callable only by the owner or the
    /// arbiter (never by the deal agent: it holds no key that can call this).
    /// `outcome` is `"release"` (pay the seller) or `"refund"` (refund the
    /// payer), settled with the same Promise + callback pattern as the
    /// delivery and timeout paths.
    pub fn resolve_dispute(&mut self, deal_id: u64, outcome: String) -> Promise {
        let predecessor = env::predecessor_account_id();
        require!(
            predecessor == self.owner || predecessor == self.arbiter,
            ERR_NOT_ADMIN
        );
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
        require!(deal.status == DealStatus::Disputed, ERR_BAD_STATUS);
        let price = deal.price;
        if outcome == "release" {
            let seller = deal.seller.clone();
            // Lock the deal before transferring: a second resolve sees
            // Delivered (not Disputed) and is rejected, so no double payout.
            deal.status = DealStatus::Delivered;
            let transfer_promise = Promise::new(self.usdc.clone()).function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "receiver_id": seller,
                    "amount": price.to_string(),
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(1), // Attach 1 yoctoNEAR for storage
                Gas::from_tgas(50),
            );
            env::log_str(&format!(
                "EVENT_JSON:{{\"event\":\"resolved\",\"deal_id\":{},\"outcome\":\"release\"}}",
                deal_id
            ));
            transfer_promise.then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_payout(deal_id, DealStatus::Disputed),
            )
        } else if outcome == "refund" {
            let payer = deal.payer.clone().expect(ERR_NOT_PAYER);
            // Same lock as above: Expired (not Disputed) blocks a second payout.
            deal.status = DealStatus::Expired;
            let transfer_promise = Promise::new(self.usdc.clone()).function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({
                    "receiver_id": payer,
                    "amount": price.to_string(),
                })
                .to_string()
                .into_bytes(),
                NearToken::from_yoctonear(1), // Attach 1 yoctoNEAR for storage
                Gas::from_tgas(50),
            );
            env::log_str(&format!(
                "EVENT_JSON:{{\"event\":\"resolved\",\"deal_id\":{},\"outcome\":\"refund\"}}",
                deal_id
            ));
            transfer_promise.then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .on_refund(deal_id, DealStatus::Disputed),
            )
        } else {
            env::panic_str(ERR_BAD_OUTCOME)
        }
    }

    /// Automatic exit for stale disputes: once a dispute has stayed open past
    /// `DISPUTE_WINDOW_MS`, the buyer can claim the refund themselves. Nothing
    /// may stay `Disputed` forever.
    pub fn claim_dispute_timeout_refund(&mut self, deal_id: u64) -> Promise {
        let now = env::block_timestamp_ms();
        let predecessor = env::predecessor_account_id();
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");
        require!(deal.status == DealStatus::Disputed, ERR_BAD_STATUS);
        require!(
            now > deal.disputed_at_ms.saturating_add(DISPUTE_WINDOW_MS),
            ERR_DISPUTE_OPEN
        );
        require!(predecessor == deal.buyer, ERR_NOT_BUYER);
        let payer = deal.payer.clone().expect(ERR_NOT_PAYER);
        let price = deal.price;
        // Lock the deal before transferring: repeated timeout claims see
        // Expired (not Disputed) and are rejected, so no double refund.
        deal.status = DealStatus::Expired;

        let transfer_promise = Promise::new(self.usdc.clone()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::json!({
                "receiver_id": payer,
                "amount": price.to_string(),
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1), // Attach 1 yoctoNEAR for storage
            Gas::from_tgas(50),
        );
        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"dispute_timeout\",\"deal_id\":{}}}",
            deal_id
        ));
        transfer_promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(10))
                .on_refund(deal_id, DealStatus::Disputed),
        )
    }

    /// Buyer confirms receipt and releases funds to seller.
    /// This provides a one-tap release path when buyer is satisfied without needing rider scan.
    /// Security: Only the buyer can call this. Deal must be in Funded status.
    /// Issue #24: Implements buyer-optional release path.
    pub fn confirm_receipt(&mut self, deal_id: u64) -> Promise {
        let predecessor = env::predecessor_account_id();
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");

        // Only buyer can confirm receipt
        require!(predecessor == deal.buyer, ERR_NOT_BUYER);

        // Deal must be funded (not already released, refunded, or disputed)
        require!(deal.status == DealStatus::Funded, ERR_BAD_STATUS);

        // Mark as delivered (bypassing QR check since buyer is the authorizer)
        deal.status = DealStatus::Delivered;
        let seller = deal.seller.clone();
        let price = deal.price;

        // Transfer USDC to seller via ft_transfer
        let transfer_promise = Promise::new(self.usdc.clone()).function_call(
            "ft_transfer".to_string(),
            near_sdk::serde_json::json!({
                "receiver_id": seller,
                "amount": price.to_string(),
            })
            .to_string()
            .into_bytes(),
            NearToken::from_yoctonear(1), // Attach 1 yoctoNEAR for storage
            Gas::from_tgas(50),
        );

        // Schedule callback to handle success/failure
        transfer_promise.then(
            Self::ext(env::current_account_id())
                .with_static_gas(Gas::from_tgas(10))
                .on_payout(deal_id, DealStatus::Funded),
        )
    }

    /// Seller can cancel an unfunded deal.
    /// Only works when deal is in Created status (not yet funded).
    /// Issue #24: Part of buyer-optional flow - seller can cancel if buyer hasn't paid yet.
    pub fn cancel_unfunded(&mut self, deal_id: u64) {
        let predecessor = env::predecessor_account_id();
        let deal = self.deals.get_mut(&deal_id).expect("ERR_NO_DEAL");

        // Only seller can cancel
        require!(predecessor == deal.seller, ERR_NOT_SELLER);

        // Deal must be in Created status (not funded yet)
        require!(deal.status == DealStatus::Created, ERR_BAD_STATUS);

        // Mark as refunded (logical cancellation for unfunded deals)
        deal.status = DealStatus::Refunded;

        env::log_str(&format!(
            "EVENT_JSON:{{\"event\":\"cancelled\",\"deal_id\":{}}}",
            deal_id
        ));
    }
}

#[near(serializers = [json])]
pub struct DealView {
    pub seller: AccountId,
    pub rider: AccountId,
    pub buyer: AccountId,
    pub payer: Option<AccountId>,
    pub item: String,
    pub price: U128,
    pub deadline_ms: u64,
    pub status: String,
    pub qr_consumed: bool,
    pub disputed_at_ms: u64,
}

impl From<&Deal> for DealView {
    fn from(d: &Deal) -> Self {
        Self {
            seller: d.seller.clone(),
            rider: d.rider.clone(),
            buyer: d.buyer.clone(),
            payer: d.payer.clone(),
            item: d.item.clone(),
            price: U128(d.price),
            deadline_ms: d.deadline_ms,
            status: d.status.as_str().to_string(),
            qr_consumed: d.qr_consumed,
            disputed_at_ms: d.disputed_at_ms,
        }
    }
}

fn parse_hex32(s: &str) -> [u8; 32] {
    let raw = s.trim().trim_start_matches("0x");
    require!(raw.len() == 64, "ERR_QR_HASH");
    let mut out = [0u8; 32];
    for i in 0..32 {
        out[i] = u8::from_str_radix(&raw[2 * i..2 * i + 2], 16).expect("ERR_QR_HASH");
    }
    out
}

/// QR hash scheme: sha256 over the ASCII bytes of the hex-string preimage.
/// The buyer reveals the preimage; the contract hashes and compares.
fn sha256_hex(preimage_hex: &str) -> [u8; 32] {
    env::sha256_array(preimage_hex.trim().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    /// Helper to set up the testing environment with a specific predecessor
    fn setup_context(predecessor: AccountId, block_timestamp: u64) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder.block_timestamp(block_timestamp * 1_000_000); // Convert ms to ns
        builder
    }

    /// Create a test contract (owner = current predecessor, arbiter = accounts(5))
    fn create_test_contract() -> Contract {
        let usdc = accounts(0);
        Contract::new(usdc, accounts(5))
    }

    /// Generate a test QR hash (64 hex chars)
    fn test_qr_hash() -> String {
        "abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234".to_string()
    }

    /// Generate a unique QR hash based on a preimage
    /// Returns (preimage, hash_hex) pair
    fn generate_test_qr() -> (String, String) {
        let preimage = format!("test_preimage_{}", env::block_timestamp_ms());
        let hash_bytes = env::sha256_array(preimage.as_bytes());
        let hash_hex = hash_bytes
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<String>();
        (preimage, hash_hex)
    }

    #[test]
    fn status_labels_are_stable() {
        assert_eq!(DealStatus::Created.as_str(), "Created");
        assert_eq!(DealStatus::Funded.as_str(), "Funded");
        assert_eq!(DealStatus::Released.as_str(), "Released");
        assert_eq!(DealStatus::Refunded.as_str(), "Refunded");
        assert_eq!(DealStatus::Disputed.as_str(), "Disputed");
    }

    #[test]
    fn parse_hex32_rejects_short_input() {
        let result = std::panic::catch_unwind(|| parse_hex32("abcd"));
        assert!(result.is_err());
    }

    // =========================================================================
    // S01: Happy Path - Deal creation works correctly
    // =========================================================================
    #[test]
    fn s01_happy_path_create_deal() {
        let context = setup_context(accounts(1), 1_000_000); // Seller
        testing_env!(context.build());

        let mut contract = create_test_contract();
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let deadline_ms = 2_000_000; // Future deadline

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            deadline_ms,
            test_qr_hash(),
        );

        assert_eq!(deal_id, 1, "First deal should have ID 1");

        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.seller, seller);
        assert_eq!(deal.rider, rider);
        assert_eq!(deal.buyer, buyer);
        assert_eq!(deal.price.0, 1_000_000);
        assert_eq!(deal.status, "Created");
        assert!(!deal.qr_consumed);
    }

    // =========================================================================
    // S02: Double Release Protection
    // =========================================================================
    #[test]
    fn s02_double_confirm_blocked() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create deal as seller
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        // Generate a unique QR pair (preimage, hash)
        let (qr_preimage, qr_hash) = generate_test_qr();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            qr_hash.clone(),
        );

        // Fund the deal as USDC contract
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());

        let result = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());
        assert!(matches!(result, PromiseOrValue::Value(U128(0))));

        // First confirm as rider with correct preimage
        context = setup_context(rider.clone(), 1_500_000);
        testing_env!(context.build());
        let _ = contract.confirm_delivery(deal_id, qr_preimage.clone());

        // Verify deal status is now Delivered
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(
            deal.status, "Delivered",
            "Deal should be Delivered after first confirm"
        );
        assert!(deal.qr_consumed, "QR should be consumed");

        // Second confirm should panic - either ERR_REPLAYED_QR (consumed) or ERR_BAD_STATUS (not Funded)
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.confirm_delivery(deal_id, qr_preimage.clone());
        }));

        assert!(result.is_err(), "Second confirm should panic");
    }

    // =========================================================================
    // S03: Replayed QR Protection - Test at confirm level
    // =========================================================================
    #[test]
    fn s03_replayed_qr_hash_rejected() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        // Generate QR pair
        let (qr_preimage, qr_hash) = generate_test_qr();

        // Create first deal with this QR hash
        let deal_id_1 = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Item 1".to_string(),
            U128(1_000_000),
            2_000_000,
            qr_hash.clone(),
        );

        // Create second deal with SAME QR hash (allowed before consumption)
        let deal_id_2 = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Item 2".to_string(),
            U128(2_000_000),
            3_000_000,
            qr_hash.clone(),
        );

        // Fund both deals
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id_1.to_string());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(2_000_000), deal_id_2.to_string());

        // Confirm first deal - consumes the QR
        context = setup_context(rider.clone(), 1_500_000);
        testing_env!(context.build());
        let _ = contract.confirm_delivery(deal_id_1, qr_preimage.clone());

        // Verify first deal is Delivered
        let deal_1 = contract.get_deal(deal_id_1).expect("Deal 1 should exist");
        assert_eq!(deal_1.status, "Delivered");

        // Try to confirm second deal with same QR - should panic (QR consumed)
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = contract.confirm_delivery(deal_id_2, qr_preimage.clone());
        }));

        assert!(
            result.is_err(),
            "Confirming deal with consumed QR should panic"
        );

        // Verify second deal is still Funded (not released)
        let deal_2 = contract.get_deal(deal_id_2).expect("Deal 2 should exist");
        assert_eq!(deal_2.status, "Funded", "Deal 2 should still be Funded");
    }

    // =========================================================================
    // S04: Timeout Refund
    // =========================================================================
    #[test]
    #[should_panic(expected = "ERR_DEADLINE")]
    fn s04_past_deadline_rejected() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);

        let context = setup_context(seller.clone(), 2_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        // Try to create deal with deadline in the past (1_000_000 < 2_000_000)
        let _ = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            1_000_000, // Past deadline
            test_qr_hash(),
        );
    }

    // =========================================================================
    // S05: Early Refund Prevention
    // =========================================================================
    #[test]
    #[should_panic(expected = "ERR_NOT_EXPIRED")]
    fn s05_early_refund_panics() {
        let seller = accounts(1);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            accounts(2),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            3_000_000, // Future deadline
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Try to claim refund before deadline - should panic
        context = setup_context(buyer.clone(), 2_000_000); // Before 3_000_000 deadline
        testing_env!(context.build());

        let _ = contract.claim_timeout_refund_for(deal_id);
    }

    // =========================================================================
    // S06: Stranger Cannot Confirm
    // =========================================================================
    #[test]
    #[should_panic(expected = "ERR_NOT_RIDER")]
    fn s06_stranger_confirm_panics() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let stranger = accounts(4);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Stranger tries to confirm - should panic
        context = setup_context(stranger.clone(), 1_500_000);
        testing_env!(context.build());

        let _ = contract.confirm_delivery(deal_id, test_qr_hash());
    }

    // =========================================================================
    // S08: Wrong Amount Funding
    // =========================================================================
    #[test]
    #[should_panic(expected = "ERR_WRONG_AMOUNT")]
    fn s08_wrong_amount_fund_rejected() {
        let seller = accounts(1);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            accounts(2),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000), // Price is 1_000_000
            2_000_000,
            test_qr_hash(),
        );

        // Try to fund with wrong amount
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(
            buyer.clone(),
            U128(999_999), // Wrong amount!
            deal_id.to_string(),
        );
    }

    // =========================================================================
    // S09: Dispute Freeze
    // =========================================================================
    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn s09_dispute_freezes_payout() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Open dispute as buyer
        context = setup_context(buyer.clone(), 1_500_000);
        testing_env!(context.build());
        contract.open_dispute(deal_id, "Item not delivered".to_string());

        // Verify status is Disputed
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Disputed", "Deal should be Disputed");

        // Try to confirm after dispute - should panic
        context = setup_context(rider.clone(), 1_600_000);
        testing_env!(context.build());
        let _ = contract.confirm_delivery(deal_id, test_qr_hash());
    }

    // =========================================================================
    // Additional security tests
    // =========================================================================

    #[test]
    #[should_panic(expected = "ERR_WRONG_AMOUNT")]
    fn test_price_must_be_positive() {
        let seller = accounts(1);

        let context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        // Try to create deal with zero price - should panic
        let _ = contract.create_deal(
            seller.clone(),
            accounts(2),
            accounts(3),
            "Test Item".to_string(),
            U128(0), // Zero price!
            2_000_000,
            test_qr_hash(),
        );
    }

    #[test]
    fn test_get_deal_returns_none_for_invalid_id() {
        let context = setup_context(accounts(1), 1_000_000);
        testing_env!(context.build());
        let contract = create_test_contract();

        let deal = contract.get_deal(999);
        assert!(deal.is_none(), "Should return None for non-existent deal");
    }

    #[test]
    fn test_seller_can_open_dispute() {
        let seller = accounts(1);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            accounts(2),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Open dispute as seller
        context = setup_context(seller.clone(), 1_500_000);
        testing_env!(context.build());
        contract.open_dispute(deal_id, "Buyer changed mind".to_string());

        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Disputed");
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_PARTY")]
    fn test_stranger_cannot_open_dispute() {
        let seller = accounts(1);
        let buyer = accounts(3);
        let stranger = accounts(4);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            accounts(2),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Stranger tries to open dispute - should panic
        context = setup_context(stranger.clone(), 1_500_000);
        testing_env!(context.build());
        contract.open_dispute(deal_id, "Random dispute".to_string());
    }

    // =========================================================================
    // Issue #24: Buyer confirm_receipt path tests
    // =========================================================================

    #[test]
    fn test_buyer_confirm_receipt_releases_funds() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Verify deal is Funded
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Funded");

        // Buyer confirms receipt (one-tap release)
        context = setup_context(buyer.clone(), 1_500_000);
        testing_env!(context.build());
        let _ = contract.confirm_receipt(deal_id);

        // Deal status should now be Delivered (after callback it becomes Released)
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(
            deal.status, "Delivered",
            "Deal should be Delivered after confirm_receipt"
        );
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_BUYER")]
    fn test_stranger_cannot_confirm_receipt() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let stranger = accounts(4);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Stranger tries to confirm receipt - should panic
        context = setup_context(stranger.clone(), 1_500_000);
        testing_env!(context.build());
        let _ = contract.confirm_receipt(deal_id);
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn test_confirm_receipt_on_unfunded_deal_panics() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);

        // Create deal (unfunded)
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Buyer tries to confirm before funding - should panic
        context = setup_context(buyer.clone(), 1_500_000);
        testing_env!(context.build());
        let _ = contract.confirm_receipt(deal_id);
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn test_confirm_receipt_on_disputed_deal_panics() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create and fund deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Open dispute
        context = setup_context(buyer.clone(), 1_500_000);
        testing_env!(context.build());
        contract.open_dispute(deal_id, "Issue with item".to_string());

        // Try to confirm receipt on disputed deal - should panic
        let _ = contract.confirm_receipt(deal_id);
    }

    #[test]
    fn test_seller_cancel_unfunded_deal() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);

        // Create deal (unfunded)
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Verify deal is Created
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Created");

        // Seller cancels unfunded deal
        context = setup_context(seller.clone(), 1_100_000);
        testing_env!(context.build());
        contract.cancel_unfunded(deal_id);

        // Deal should now be Refunded (cancellation for unfunded deals)
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(
            deal.status, "Refunded",
            "Unfunded deal should be cancelled/Refunded"
        );
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_SELLER")]
    fn test_buyer_cannot_cancel_deal() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);

        // Create deal (unfunded)
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Buyer tries to cancel - should panic
        context = setup_context(buyer.clone(), 1_100_000);
        testing_env!(context.build());
        contract.cancel_unfunded(deal_id);
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn test_seller_cannot_cancel_funded_deal() {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        // Create deal
        let mut context = setup_context(seller.clone(), 1_000_000);
        testing_env!(context.build());
        let mut contract = create_test_contract();

        let deal_id = contract.create_deal(
            seller.clone(),
            rider.clone(),
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        // Fund the deal
        context = setup_context(usdc.clone(), 1_100_000);
        testing_env!(context.build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        // Seller tries to cancel funded deal - should panic
        context = setup_context(seller.clone(), 1_500_000);
        testing_env!(context.build());
        contract.cancel_unfunded(deal_id);
    }

    // =========================================================================
    // Dispute resolution (admin + timeout exit)
    // =========================================================================

    /// Funded-then-Disputed deal 1, disputed at t=1_500_000 ms.
    /// Owner = seller (creator), arbiter = accounts(5).
    fn setup_disputed_deal() -> (Contract, u64) {
        let seller = accounts(1);
        let rider = accounts(2);
        let buyer = accounts(3);
        let usdc = accounts(0);

        testing_env!(setup_context(seller.clone(), 1_000_000).build());
        let mut contract = create_test_contract();
        let deal_id = contract.create_deal(
            seller.clone(),
            rider,
            buyer.clone(),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );

        testing_env!(setup_context(usdc, 1_100_000).build());
        let _ = contract.ft_on_transfer(buyer.clone(), U128(1_000_000), deal_id.to_string());

        testing_env!(setup_context(buyer, 1_500_000).build());
        contract.open_dispute(deal_id, "Item not delivered".to_string());
        (contract, deal_id)
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_ADMIN")]
    fn resolve_dispute_rejects_non_admin() {
        let (mut contract, deal_id) = setup_disputed_deal();
        // Buyer is neither owner nor arbiter.
        contract.resolve_dispute(deal_id, "release".to_string());
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn resolve_dispute_rejects_non_disputed_deal() {
        let seller = accounts(1);
        testing_env!(setup_context(seller.clone(), 1_000_000).build());
        let mut contract = create_test_contract();
        let deal_id = contract.create_deal(
            seller,
            accounts(2),
            accounts(3),
            "Test Item".to_string(),
            U128(1_000_000),
            2_000_000,
            test_qr_hash(),
        );
        testing_env!(setup_context(accounts(1), 1_100_000).build());
        contract.resolve_dispute(deal_id, "release".to_string());
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_OUTCOME")]
    fn resolve_dispute_rejects_unknown_outcome() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(1), 1_600_000).build()); // owner
        contract.resolve_dispute(deal_id, "split".to_string());
    }

    #[test]
    fn resolve_dispute_release_by_owner_returns_promise() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(1), 1_600_000).build()); // owner
        let _ = contract.resolve_dispute(deal_id, "release".to_string());
        // Locked as Delivered until the transfer settles; a second resolve
        // in this state is rejected, so no double payout is possible.
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Delivered");
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn resolve_dispute_twice_release_rejected() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(1), 1_600_000).build()); // owner
        let _ = contract.resolve_dispute(deal_id, "release".to_string());
        contract.resolve_dispute(deal_id, "release".to_string());
    }

    #[test]
    fn resolve_dispute_by_arbiter_returns_promise() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(5), 1_600_000).build()); // arbiter
        let _ = contract.resolve_dispute(deal_id, "refund".to_string());
        // Locked as Expired until the transfer settles.
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Expired");
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn resolve_dispute_twice_refund_rejected() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(5), 1_600_000).build()); // arbiter
        let _ = contract.resolve_dispute(deal_id, "refund".to_string());
        contract.resolve_dispute(deal_id, "refund".to_string());
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_OWNER")]
    fn set_arbiter_rejects_non_owner() {
        let (mut contract, _) = setup_disputed_deal();
        testing_env!(setup_context(accounts(3), 1_600_000).build()); // buyer
        contract.set_arbiter(accounts(4));
    }

    #[test]
    fn set_arbiter_owner_hands_off_to_new_arbiter() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(1), 1_600_000).build()); // owner
        contract.set_arbiter(accounts(4));
        testing_env!(setup_context(accounts(4), 1_700_000).build()); // new arbiter
        let _ = contract.resolve_dispute(deal_id, "release".to_string());
    }

    #[test]
    #[should_panic(expected = "ERR_DISPUTE_OPEN")]
    fn dispute_timeout_claim_rejects_open_window() {
        let (mut contract, deal_id) = setup_disputed_deal();
        // Disputed at 1_500_000; window (7d) not elapsed.
        testing_env!(setup_context(accounts(3), 1_500_000 + DISPUTE_WINDOW_MS - 1_000).build());
        contract.claim_dispute_timeout_refund(deal_id);
    }

    #[test]
    #[should_panic(expected = "ERR_NOT_BUYER")]
    fn dispute_timeout_claim_rejects_non_buyer() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(1), 1_500_000 + DISPUTE_WINDOW_MS + 1).build()); // seller
        contract.claim_dispute_timeout_refund(deal_id);
    }

    #[test]
    fn dispute_timeout_claim_by_buyer_after_window_returns_promise() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(3), 1_500_000 + DISPUTE_WINDOW_MS + 1).build()); // buyer
        let _ = contract.claim_dispute_timeout_refund(deal_id);
        // Locked as Expired until the transfer settles.
        let deal = contract.get_deal(deal_id).expect("Deal should exist");
        assert_eq!(deal.status, "Expired");
    }

    #[test]
    #[should_panic(expected = "ERR_BAD_STATUS")]
    fn dispute_timeout_claim_twice_rejected() {
        let (mut contract, deal_id) = setup_disputed_deal();
        testing_env!(setup_context(accounts(3), 1_500_000 + DISPUTE_WINDOW_MS + 1).build()); // buyer
        let _ = contract.claim_dispute_timeout_refund(deal_id);
        contract.claim_dispute_timeout_refund(deal_id);
    }
}
