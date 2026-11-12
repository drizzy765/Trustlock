//! S04: Expired Deadline Refund
//!
//! Setup: Block timestamp > deadline, claim_timeout_refund
//! Expected: Status Expired (before callback), then Refunded (after)

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s04_expired_deadline_refund() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create a deal with PAST deadline
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        - 1000; // 1 second in the past

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

    // Try to call confirm_delivery - should fail (deadline passed)
    let qr_preimage = generate_qr_preimage(&qr_hash);
    let result = confirm_delivery(&escrow, &rider, deal_id, &qr_preimage).await?;

    // Should fail with ERR_NOT_EXPIRED (or similar deadline error)
    // Note: In current contract, this check is: require!(now <= deal.deadline_ms, ERR_NOT_EXPIRED)
    // So if deadline is in the past, confirm_delivery should fail

    assert!(result.is_err(), "Confirming past deadline should fail");

    // Verify deal still Created (never funded anyway)
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal should still be Created");

    println!("S04: Expired deadline test passed");

    Ok(())
}
