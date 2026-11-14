//! Mock NEP-141 fungible token for TrustLock workspaces tests.
//!
//! Test-only stand-in for USDC (6 decimals). Implements just enough of
//! NEP-141 / NEP-145-lite for the escrow: `ft_transfer`, `ft_transfer_call`
//! with the standard `ft_resolve_transfer` refund callback, `storage_deposit`,
//! `mint` (owner only), and a `set_fail_next_transfer` flag so S11/S12 can
//! simulate a failed payout/refund transfer. Never deployed to testnet.

use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, PanicOnDefault, PromiseOrValue,
};

const STORAGE_DEPOSIT_YOCTO: u128 = 1_250_000_000_000_000_000_000; // 0.00125 NEAR

#[derive(BorshDeserialize, BorshSerialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
enum StorageKey {
    Balances,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    pub owner: AccountId,
    pub total_supply: u128,
    pub balances: LookupMap<AccountId, u128>,
    pub fail_next_transfer: bool,
}

#[near]
impl MockFt {
    #[init]
    pub fn new(owner: AccountId) -> Self {
        Self {
            owner,
            total_supply: 0,
            balances: LookupMap::new(StorageKey::Balances),
            fail_next_transfer: false,
        }
    }

    /// Owner-only mint. Auto-registers the recipient (test convenience).
    pub fn mint(&mut self, to: AccountId, amount: U128) {
        require!(env::predecessor_account_id() == self.owner, "ERR_NOT_OWNER");
        let balance = self.balances.get(&to).copied().unwrap_or(0);
        self.balances.insert(to, balance + amount.0);
        self.total_supply += amount.0;
    }

    /// Owner-only failure injection for S11/S12. While set, `ft_transfer` and
    /// `ft_transfer_call` panic. Clear it with `set_fail_next_transfer(false)`
    /// to re-arm: a panicking receipt rolls back its own writes, so the flag
    /// deliberately does NOT auto-reset on failure.
    pub fn set_fail_next_transfer(&mut self, fail: bool) {
        require!(env::predecessor_account_id() == self.owner, "ERR_NOT_OWNER");
        self.fail_next_transfer = fail;
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: "ft-1.0.0".to_string(),
            name: "Mock USDC".to_string(),
            symbol: "USDC".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.balances
            .contains_key(&account_id)
            .then(|| StorageBalance {
                total: U128(STORAGE_DEPOSIT_YOCTO),
                available: U128(0),
            })
    }

    #[payable]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
        _registration_only: Option<bool>,
    ) -> StorageBalance {
        require!(
            env::attached_deposit().as_yoctonear() >= 1,
            "ERR_DEPOSIT_REQUIRED"
        );
        let account = account_id.unwrap_or_else(env::predecessor_account_id);
        if !self.balances.contains_key(&account) {
            self.balances.insert(account.clone(), 0);
        }
        self.storage_balance_of(account).unwrap()
    }

    #[payable]
    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, _memo: Option<String>) {
        require!(
            env::attached_deposit().as_yoctonear() >= 1,
            "ERR_DEPOSIT_REQUIRED"
        );
        self.maybe_fail("ERR_MOCK_TRANSFER_FAIL");
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id, amount.0);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        _memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::attached_deposit().as_yoctonear() >= 1,
            "ERR_DEPOSIT_REQUIRED"
        );
        self.maybe_fail("ERR_MOCK_TRANSFER_CALL_FAIL");
        let sender = env::predecessor_account_id();
        self.move_tokens(&sender, &receiver_id.clone(), amount.0);
        let promise = ext_ft_receiver::ext(receiver_id.clone())
            .with_static_gas(Gas::from_tgas(25))
            .ft_on_transfer(sender.clone(), amount, msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(10))
                    .ft_resolve_transfer(sender, receiver_id, amount),
            );
        PromiseOrValue::Promise(promise)
    }

    /// Standard NEP-141 resolve callback. Returns the unused amount so the
    /// token contract refunds it to the sender.
    #[private]
    pub fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let unused = match env::promise_result_checked(0, 64) {
            Ok(bytes) => near_sdk::serde_json::from_slice::<U128>(&bytes)
                .map(|v| v.0.min(amount.0))
                .unwrap_or(amount.0),
            Err(_) => amount.0,
        };
        if unused > 0 {
            let receiver_balance = self.balances.get(&receiver_id).copied().unwrap_or(0);
            let refund = unused.min(receiver_balance);
            self.balances.insert(receiver_id, receiver_balance - refund);
            let sender_balance = self.balances.get(&sender_id).copied().unwrap_or(0);
            self.balances.insert(sender_id, sender_balance + refund);
        }
        U128(amount.0 - unused.min(amount.0))
    }
}

impl MockFt {
    fn maybe_fail(&mut self, msg: &str) {
        if self.fail_next_transfer {
            env::panic_str(msg);
        }
    }

    fn move_tokens(&mut self, sender: &AccountId, receiver: &AccountId, amount: u128) {
        require!(self.balances.contains_key(sender), "ERR_NOT_REGISTERED");
        require!(
            self.balances.contains_key(receiver),
            "ERR_RECEIVER_NOT_REGISTERED"
        );
        let sender_balance = self.balances.get(sender).copied().unwrap_or(0);
        require!(sender_balance >= amount, "ERR_INSUFFICIENT_BALANCE");
        self.balances
            .insert(sender.clone(), sender_balance - amount);
        let receiver_balance = self.balances.get(receiver).copied().unwrap_or(0);
        self.balances
            .insert(receiver.clone(), receiver_balance + amount);
    }
}

#[near_sdk::ext_contract(ext_ft_receiver)]
pub trait ExtFtReceiver {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128>;
}

#[near_sdk::ext_contract(ext_self)]
pub trait ExtSelf {
    fn ft_resolve_transfer(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128;
}

// `FungibleTokenMetadata` and `StorageBalance` derive their json
// impls from `#[near(serializers = [json])]`; no manual serde glue needed.
