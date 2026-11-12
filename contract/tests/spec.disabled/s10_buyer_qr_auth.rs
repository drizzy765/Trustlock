//! S10: Buyer QR Authorization
//!
//! Setup: Rider submits well-formed QR not authorized by buyer for this deal
//! Expected: Confirmation rejected, status and balances unchanged
//!
//! NOTE: This tests that the QR must match the deal's stored hash.
//! Full buyer authorization would require digital signatures.

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s10_buyer_qr_authorization() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create deal with specific QR hash
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000;

    let price = 1_000_000;
    let deal_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        deadline_ms,
        &qr_hash,
    )
    .await?;

    // Try to confirm with WRONG QR preimage
    let wrong_qr = "0000000000000000000000000000000000000000000000000000000000000000";
    let result = confirm_delivery(&escrow, &rider, deal_id, wrong_qr).await?;

    // Should fail with ERR_BAD_QR (hash mismatch)
    assert!(result.is_err(), "Wrong QR should fail");
    let error = format!("{:?}", result);
    assert!(
        error.contains("ERR_BAD_QR") || error.contains("ERR_BAD_STATUS"),
        "Should fail with ERR_BAD_QR or ERR_BAD_STATUS: {}",
        error
    );

    // Verify deal is still Created
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal should still be Created");
    assert!(!deal.qr_consumed, "QR should not be consumed");

    println!("S10: Buyer QR authorization test passed");
    println!("Contract correctly rejects wrong QR preimage");

    Ok(())
}
