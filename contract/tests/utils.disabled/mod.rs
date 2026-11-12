//! Test utilities and shared helpers for TrustLock sandbox tests

use near_workspaces::{Account, AccountId, Contract, Worker};
use std::path::Path;

/// Compile the TrustLock contract WASM
pub fn compile_contract_wasm() -> anyhow::Result<Vec<u8>> {
    // Build the contract
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let workspace_dir = manifest_dir.parent().unwrap();

    let output = std::process::Command::new("cargo")
        .args([
            "build",
            "--target",
            "wasm32-unknown-unknown",
            "--release",
            "-p",
            "trustlock",
        ])
        .current_dir(&workspace_dir)
        .output()?;

    if !output.status.success() {
        anyhow::bail!(
            "Failed to compile contract: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let wasm_path = workspace_dir.join("target/wasm32-unknown-unknown/release/trustlock.wasm");
    let wasm = std::fs::read(&wasm_path)?;

    Ok(wasm)
}

/// Deploy the TrustLock contract
pub async fn deploy_trustlock(
    worker: &Worker<near_workspaces::network::Sandbox>,
    usdc_account: &AccountId,
) -> anyhow::Result<Contract> {
    let wasm = compile_contract_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;

    // Initialize with USDC token
    contract
        .call("new")
        .args_json(serde_json::json!({"usdc": usdc_account}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

/// View structure for deal (matches contract's DealView)
#[derive(Debug, serde::Deserialize)]
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

/// Get deal from contract
pub async fn get_deal(escrow: &Contract, deal_id: u64) -> anyhow::Result<DealView> {
    let result = escrow
        .call("get_deal")
        .args_json(serde_json::json!({"deal_id": deal_id}))
        .view()
        .await?;

    let deal: Option<DealView> = result.json()?;
    deal.ok_or_else(|| anyhow::anyhow!("Deal not found"))
}

/// Create a deal with test parameters
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
        .call("create_deal")
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

/// Confirm delivery with QR code
pub async fn confirm_delivery(
    escrow: &Contract,
    rider: &Account,
    deal_id: u64,
    qr_preimage: &str,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let result = escrow
        .as_account()
        .call(escrow.id(), "confirm_delivery")
        .args_json(serde_json::json!({
            "deal_id": deal_id,
            "qr_preimage_hex": qr_preimage,
        }))
        .max_gas()
        .transact()
        .await;

    result
}

/// Claim timeout refund
pub async fn claim_timeout_refund(
    escrow: &Contract,
    caller: &Account,
    deal_id: u64,
) -> anyhow::Result<near_workspaces::result::ExecutionFinalResult> {
    let result = caller
        .call(escrow.id(), "claim_timeout_refund_for")
        .args_json(serde_json::json!({"deal_id": deal_id}))
        .max_gas()
        .transact()
        .await;

    result
}

/// Generate a 64-char hex QR hash
pub fn generate_qr_hash() -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
        .hash(&mut hasher);

    let hash = hasher.finish();
    format!("{:064x}", hash)
}

/// Generate a QR preimage
pub fn generate_qr_preimage(hash: &str) -> String {
    // For testing, preimage is the hash itself (contract uses sha256)
    hash.to_string()
}

/// Check if a result failed with a specific error message
pub fn failed_with(result: &near_workspaces::result::ExecutionFinalResult, expected: &str) -> bool {
    if let Err(e) = result.clone().into_result() {
        let error_string = format!("{:?}", e);
        error_string.contains(expected)
    } else {
        false
    }
}
