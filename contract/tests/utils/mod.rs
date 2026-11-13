//! Shared harness for the TrustLock workspaces safety battery (S01-S13).
//!
//! Every helper exercises the contracts through their public interfaces only:
//! the escrow (`trustlock`) and a test-only mock NEP-141 token
//! (`trustlock-mock-ft`). No contract internals are touched.

use near_workspaces::types::{AccessKey, KeyType, NearToken, SecretKey};
use near_workspaces::{Account, AccountId, Contract, Worker};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicU64, Ordering};

/// Build a workspace WASM. `package` is the cargo package, `file_stem` the
/// output file name without extension.
pub fn compile_wasm(package: &str, file_stem: &str) -> anyhow::Result<Vec<u8>> {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_dir = manifest_dir.parent().unwrap();

    let output = std::process::Command::new("cargo")
        .args([
            "build",
            "--target",
            "wasm32-unknown-unknown",
            "--release",
            "-p",
            package,
        ])
        .current_dir(workspace_dir)
        .output()?;

    if !output.status.success() {
        anyhow::bail!(
            "Failed to compile {}: {}",
            package,
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let wasm_path = workspace_dir.join(format!(
        "target/wasm32-unknown-unknown/release/{}.wasm",
        file_stem
    ));
    Ok(std::fs::read(&wasm_path)?)
}

/// Deploy the TrustLock escrow, initialized with `usdc` as its token.
pub async fn deploy_trustlock(
    worker: &Worker<near_workspaces::network::Sandbox>,
    usdc_account: &AccountId,
) -> anyhow::Result<Contract> {
    let wasm = compile_wasm("trustlock", "trustlock")?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(serde_json::json!({"usdc": usdc_account}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

/// Deploy the mock FT and register `owner` as its owner/minter.
pub async fn deploy_mock_ft(
    worker: &Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
) -> anyhow::Result<Contract> {
    let wasm = compile_wasm("trustlock-mock-ft", "trustlock_mock_ft")?;
    let ft = worker.dev_deploy(&wasm).await?;

    ft.call("new")
        .args_json(serde_json::json!({"owner": owner.id()}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    Ok(ft)
}

const STORAGE_DEPOSIT: u128 = 1_250_000_000_000_000_000_000; // 0.00125 NEAR

/// NEP-145 registration so `account` can hold the mock token.
pub async fn register_storage(ft: &Contract, account: &Account) -> anyhow::Result<()> {
    account
        .call(ft.id(), "storage_deposit")
        .args_json(serde_json::json!({
            "account_id": account.id(),
            "registration_only": true,
        }))
        .deposit(NearToken::from_yoctonear(STORAGE_DEPOSIT))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Owner-only mint on the mock FT (auto-registers the recipient).
pub async fn mint(
    ft: &Contract,
    owner: &Account,
    to: &AccountId,
    amount: u128,
) -> anyhow::Result<()> {
    owner
        .call(ft.id(), "mint")
        .args_json(serde_json::json!({
            "to": to,
            "amount": amount.to_string(),
        }))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

/// Token balance view.
pub async fn ft_balance_of(ft: &Contract, account_id: &AccountId) -> anyhow::Result<u128> {
    let result = ft
        .call("ft_balance_of")
        .args_json(serde_json::json!({"account_id": account_id}))
        .view()
        .await?;
    let raw: String = result.json()?;
    Ok(raw.parse()?)
}

/// Fund a deal: `payer` sends exactly `amount` via `ft_transfer_call` with the
/// plain deal id string as `msg` (the on-chain funding path).
pub async fn fund_deal(
    ft: &Contract,
    payer: &Account,
    escrow_id: &AccountId,
    deal_id: u64,
    amount: u128,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(payer
        .call(ft.id(), "ft_transfer_call")
        .args_json(serde_json::json!({
            "receiver_id": escrow_id,
            "amount": amount.to_string(),
            "memo": Option::<String>::None,
            "msg": deal_id.to_string(),
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?)
}

/// View structure for a deal (matches the contract's DealView).
/// Fields mirror the contract; individual tests assert the ones they need.
#[derive(Debug, serde::Deserialize)]
#[allow(dead_code)]
pub struct DealView {
    pub seller: AccountId,
    pub rider: AccountId,
    pub buyer: AccountId,
    pub payer: Option<AccountId>,
    pub item: String,
    pub price: near_sdk::json_types::U128,
    pub deadline_ms: u64,
    pub status: String,
    pub qr_consumed: bool,
}

/// Get deal from contract.
pub async fn get_deal(escrow: &Contract, deal_id: u64) -> anyhow::Result<DealView> {
    let result = escrow
        .call("get_deal")
        .args_json(serde_json::json!({"deal_id": deal_id}))
        .view()
        .await?;

    let deal: Option<DealView> = result.json()?;
    deal.ok_or_else(|| anyhow::anyhow!("Deal not found"))
}

/// Create a deal with test parameters. Any account can sign; the escrow
/// account itself signs here to keep call sites short.
pub async fn create_test_deal(
    escrow: &Contract,
    seller: &Account,
    rider: &AccountId,
    buyer: &AccountId,
    price: u128,
    deadline_ms: u64,
    qr_hash: &str,
) -> anyhow::Result<u64> {
    let result = escrow
        .as_account()
        .call(escrow.id(), "create_deal")
        .args_json(serde_json::json!({
            "seller": seller.id(),
            "rider": rider,
            "buyer": buyer,
            "item": "Test Item",
            "price": price.to_string(),
            "deadline_ms": deadline_ms,
            "qr_hash_hex": qr_hash,
        }))
        .max_gas()
        .transact()
        .await?;

    let outcome = result.into_result()?;
    let deal_id: u64 = outcome.json()?;

    Ok(deal_id)
}

/// Rider confirms delivery with the QR preimage. Signs as `rider`, so the
/// contract's `ERR_NOT_RIDER` check is exercised for real.
pub async fn confirm_delivery(
    escrow: &Contract,
    rider: &Account,
    deal_id: u64,
    qr_preimage: &str,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(rider
        .call(escrow.id(), "confirm_delivery")
        .args_json(serde_json::json!({
            "deal_id": deal_id,
            "qr_preimage_hex": qr_preimage,
        }))
        .max_gas()
        .transact()
        .await?)
}

/// Claim a timeout refund for a deal.
pub async fn claim_timeout_refund(
    escrow: &Contract,
    caller: &Account,
    deal_id: u64,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(caller
        .call(escrow.id(), "claim_timeout_refund_for")
        .args_json(serde_json::json!({"deal_id": deal_id}))
        .max_gas()
        .transact()
        .await?)
}

/// Open a dispute over a deal.
/// NOTE: the contract names the field `_reason` (with underscore).
pub async fn open_dispute(
    escrow: &Contract,
    caller: &Account,
    deal_id: u64,
    reason: &str,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(caller
        .call(escrow.id(), "open_dispute")
        .args_json(serde_json::json!({"deal_id": deal_id, "_reason": reason}))
        .max_gas()
        .transact()
        .await?)
}

/// Buyer confirms receipt (one-tap release without a rider scan).
pub async fn confirm_receipt(
    escrow: &Contract,
    buyer: &Account,
    deal_id: u64,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(buyer
        .call(escrow.id(), "confirm_receipt")
        .args_json(serde_json::json!({"deal_id": deal_id}))
        .max_gas()
        .transact()
        .await?)
}

/// Attach a function-call access key limited to `method_names` on the escrow
/// to `owner`'s account, and return a handle that signs with ONLY that key.
/// Mirrors the real rider key from scripts/add-rider-key.sh, except the
/// allowance is larger: a rejected attempt still burns gas, and the sandbox
/// attempt fee (~1 NEAR) exceeds the production 0.25 NEAR allowance. The
/// production shape (0.25 NEAR, confirm_delivery-only) is proven separately by
/// the on-chain reference key (docs/testnet_run.md) and #44. A real
/// confirm_delivery costs less than 0.25 NEAR, which is why the production key
/// works for its one method.
pub async fn restricted_key_account(
    worker: &Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    escrow_id: &AccountId,
    method_names: &[&str],
) -> anyhow::Result<Account> {
    let sk = SecretKey::from_random(KeyType::ED25519);
    let pk = sk.public_key();
    let ak = AccessKey::function_call_access(
        escrow_id,
        method_names,
        Some(NearToken::from_yoctonear(5_000_000_000_000_000_000_000_000)),
    );
    owner
        .batch(owner.id())
        .add_key(pk, ak)
        .transact()
        .await?
        .into_result()?;
    Ok(Account::from_secret_key(owner.id().clone(), sk, worker))
}

/// Fresh QR pair using the contract's real scheme: the preimage is a 64-char
/// hex string, and the stored hash is `hex(sha256(preimage_ascii_bytes))`
/// (see `hex_keccak` in the contract).
pub fn qr_pair(seed: &str) -> (String, String) {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nonce = COUNTER.fetch_add(1, Ordering::Relaxed);
    let now_nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let preimage_bytes = Sha256::digest(format!("trustlock-qr-{seed}-{now_nanos}-{nonce}"));
    let preimage_hex = hex_encode(&preimage_bytes);
    let hash_bytes = Sha256::digest(preimage_hex.as_bytes());
    (preimage_hex, hex_encode(&hash_bytes))
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Milliseconds since epoch, `offset_ms` in the future (negative = past).
pub fn now_ms_plus(offset_ms: i64) -> u64 {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    if offset_ms >= 0 {
        now + offset_ms as u64
    } else {
        now - (-offset_ms) as u64
    }
}

/// Start a sandbox node, serialized across tests in this binary.
/// Parallel `cargo test` threads otherwise race N sandbox processes for
/// ports and startup fails with "Failed to bind to available ports".
/// The lock only covers startup; tests still run concurrently afterwards.
///
/// The readiness timeout is raised for slow/loaded machines (default 10s in
/// near-sandbox is too short when several nodes start at once). An explicit
/// `NEAR_RPC_TIMEOUT_SECS` in the environment still wins.
pub async fn locked_sandbox() -> anyhow::Result<Worker<near_workspaces::network::Sandbox>> {
    static STARTUP_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = STARTUP_LOCK.lock().unwrap();
    if std::env::var_os("NEAR_RPC_TIMEOUT_SECS").is_none() {
        std::env::set_var("NEAR_RPC_TIMEOUT_SECS", "120");
    }
    let worker = near_workspaces::sandbox().await?;
    Ok(worker)
}
