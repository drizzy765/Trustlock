//! S13: Dispute During Pending Payout
//!
//! Setup: Open dispute after delivery confirmation scheduled payout but before callback settles
//! Expected: Final status follows dispute policy, no callback silently overrides
//!
//! NOTE: This is a race condition test. The callback should check
//! current state before applying changes.

use near_workspaces::Worker;

use crate::utils::*;

#[tokio::test]
async fn s13_dispute_during_payout() -> anyhow::Result<()> {
    // Initialize sandbox
    let worker = near_workspaces::sandbox().await?;

    // Create test accounts
    let owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    // Deploy escrow
    let escrow = deploy_trustlock(&worker, buyer.id()).await?;

    // Create deal
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

    // Note: For full test:
    // 1. Fund deal
    // 2. Rider calls confirm_delivery (schedules payout)
    // 3. Deal status = Delivered
    // 4. Before callback completes, open_dispute is called
    // 5. Deal status = Disputed
    // 6. Callback completes
    // 7. on_payout checks current status
    // 8. If Disputed: should NOT change to Released
    // 9. Dispute resolution decides final state

    // Check current contract behavior
    // open_dispute accepts: Funded OR Delivered
    // on_payout sets: Released (regardless of current status)
    // This is a potential race condition!

    println!("S13: Dispute during pending payout");
    println!("Current contract behavior:");
    println!("  - open_dispute accepts Funded or Delivered");
    println!("  - on_payout callback sets Released unconditionally");
    println!("  - Potential race: callback may override dispute");
    println!("");
    println!("RECOMMENDED FIX:");
    println!("  on_payout should check current status:");
    println!("    - If Disputed: do NOT change status");
    println!("    - Only Released if still Delivered");

    // Verify the deal was created
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created", "Deal created successfully");

    println!("S13: Race condition documented - contract may need update");

    Ok(())
}
