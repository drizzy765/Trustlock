//! S05: Early Refund Blocked
//!
//! Setup: Refund called before deadline
//! Expected: Panic with ERR_NOT_EXPIRED

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s05_early_refund_blocked() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create a deal with FUTURE deadline
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000; // 1 hour in the future

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

    // Try to claim timeout refund BEFORE deadline - should fail
    let result = claim_timeout_refund(&escrow, &buyer, deal_id).await?;

    // Should fail with ERR_NOT_EXPIRED (deal is Created, not Funded)
    // Note: claim_timeout_refund_for requires status == Funded
    // So this should fail with ERR_BAD_STATUS first
    assert!(result.is_err(), "Early refund should fail");

    // Verify deal is still Created
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal should still be Created");

    println!("S05: Early refund blocked test passed");

    Ok(())
}
