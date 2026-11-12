//! S03: Replayed QR Protection
//!
//! Setup: Two deals with the same QR hash/nonce
//! Expected: Second deal creation should fail with ERR_REPLAYED_QR

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s03_replayed_qr_protection() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create first deal
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000;

    let price = 1_000_000;
    let _deal1_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        deadline_ms,
        &qr_hash,
    )
    .await?;

    // Try to create second deal with SAME QR hash - should fail
    let result = escrow
        .call("create_deal")
        .args_json(serde_json::json!({
            "seller": seller.id(),
            "rider": rider.id(),
            "buyer": buyer.id(),
            "item": "Test Item 2",
            "price": price.to_string(),
            "deadline_ms": deadline_ms,
            "qr_hash_hex": qr_hash,
        }))
        .max_gas()
        .transact()
        .await?;

    // Assert failure
    assert!(
        result.is_err(),
        "Creating deal with replayed QR should fail"
    );
    let error = format!("{:?}", result);
    assert!(
        error.contains("ERR_REPLAYED_QR"),
        "Should fail with ERR_REPLAYED_QR: {}",
        error
    );

    Ok(())
}
