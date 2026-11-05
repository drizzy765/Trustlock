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
    pub usdc: AccountId,
    pub next_id: u64,
    pub deals: LookupMap<u64, Deal>,
    pub used_qr: LookupMap<[u8; 32], u64>,
}

#[near]
impl Contract {
    #[init]
    pub fn new(usdc: AccountId) -> Self {
        Self {
            owner: env::predecessor_account_id(),
            usdc,
            next_id: 1,
            deals: LookupMap::new(StorageKey::Deals),
            used_qr: LookupMap::new(StorageKey::UsedQr),
        }
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
        let hash = hex_keccak(&qr_preimage_hex);

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
                deal.status = prev_status;
                deal.qr_consumed = false; // Allow retry with same QR
                env::log_str("payout failed; state restored");
                false
            }
        }
    }

    pub fn claim_timeout_refund(&mut self) {
        // Keep the ABI stable while the full body is implemented against a deal id.
        // Use `claim_timeout_refund_for`.
        env::panic_str("ERR_USE_claim_timeout_refund_for");
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
                .on_refund(deal_id),
        )
    }

    /// Callback after refund attempt. If transfer failed, restore to Expired state.
    #[private]
    pub fn on_refund(&mut self, deal_id: u64) -> bool {
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
                // Transfer failed, keep in Expired state for retry
                env::log_str("refund failed; state preserved as Expired");
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

fn hex_keccak(preimage_hex: &str) -> [u8; 32] {
    // Demo hash: sha256 of the hex string bytes. Replace with the agreed QR schema.
    env::sha256_array(preimage_hex.trim().as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
