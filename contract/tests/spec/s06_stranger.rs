//! S06: Stranger Confirm Blocked
//!
//! Setup: Random account calls confirm_delivery (not the designated rider)
//! Expected: Panic with ERR_NOT_RIDER

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s06_stranger_confirm_blocked() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?; // NOT the rider

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create deal with rider account
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000;

    let price = 1_000_000;
    let deal_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(), // Designated rider
        buyer.id(),
        price,
        deadline_ms,
        &qr_hash,
    )
    .await?;

    // Stranger tries to confirm delivery (should fail)
    let qr_preimage = generate_qr_preimage(&qr_hash);
    let result = confirm_delivery(&escrow, &stranger, deal_id, &qr_preimage).await?;

    // Should fail with ERR_NOT_RIDER
    assert!(result.is_err(), "Stranger confirm should fail");
    let error = format!("{:?}", result);
    assert!(
        error.contains("ERR_NOT_RIDER"),
        "Should fail with ERR_NOT_RIDER: {}",
        error
    );

    // Verify deal is still Created (never funded anyway)
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal should still be Created");

    println!("S06: Stranger confirm blocked test passed");

    Ok(())
}
