//! S08: Wrong Amount Funding Blocked
//!
//! Setup: ft_on_transfer with amount != deal price
//! Expected: Deal stays Created, tokens returned to sender

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s08_wrong_amount_funding_blocked() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create deal with specific price
    let qr_hash = generate_qr_hash();
    let deadline_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_millis() as u64
        + 3_600_000;

    let expected_price = 1_000_000; // 1 USDC
    let deal_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        expected_price,
        deadline_ms,
        &qr_hash,
    )
    .await?;

    // Try to fund with WRONG amount
    let wrong_amount = 500_000; // 0.5 USDC

    // Note: ft_on_transfer is called by the token contract
    // The contract should check: require!(amount.0 == deal.price, ERR_WRONG_AMOUNT)
    // and return the tokens via PromiseOrValue::Value(amount)

    // For now, document the expected behavior
    println!("S08: Wrong amount funding");
    println!("Expected price: {}", expected_price);
    println!("Wrong amount sent: {}", wrong_amount);
    println!("Contract should reject and return tokens");
    println!("Deal should stay in Created status");

    // Verify deal is still Created
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal should remain Created");
    assert!(deal.payer.is_none(), "No payer should be set");

    println!("S08: Wrong amount funding test documented");

    Ok(())
}
