//! S01: Happy Path - Complete end-to-end flow
//!
//! Setup: Create deal
//! Expected: Deal is created with correct parameters

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s01_happy_path() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy TrustLock escrow (using buyer as mock USDC for now)
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create a deal
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000; // 1 hour from now

    let price = 1_000_000; // 1 USDC
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

    // Verify deal was created
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal should be Created");
    assert_eq!(deal.seller, *seller.id(), "Seller should match");
    assert_eq!(deal.rider, *rider.id(), "Rider should match");
    assert_eq!(deal.buyer, *buyer.id(), "Buyer should match");
    assert_eq!(deal.price.0, price, "Price should match");
    assert!(!deal.qr_consumed, "QR should not be consumed yet");

    Ok(())
}
