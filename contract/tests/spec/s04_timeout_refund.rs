//! S04: Expired Deadline Refund.
//!
//! Setup: Funded deal, wall clock past the deadline, `claim_timeout_refund`.
//! Expected: Status `Refunded`; buyer (payer) balance += price.

use crate::utils::*;

#[tokio::test]
async fn s04_expired_deadline_refund() -> anyhow::Result<()> {
    let worker = locked_sandbox().await?;

    let ft_owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &ft_owner).await?;
    let escrow = deploy_trustlock(&worker, ft.id()).await?;

    for account in [&seller, &buyer, escrow.as_account()] {
        register_storage(&ft, account).await?;
    }
    mint(&ft, &ft_owner, buyer.id(), 10_000_000).await?;

    let price = 1_000_000;
    let (_preimage, qr_hash) = qr_pair("s04");
    let deal_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(60_000), // 1 minute: expiry is reachable via fast_forward
        &qr_hash,
    )
    .await?;

    fund_deal(&ft, &buyer, escrow.id(), deal_id, price)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");

    // Advance the chain until the deadline passes. The retry loop keeps this
    // deterministic regardless of sandbox block time.
    let mut claimed = false;
    for _ in 0..15 {
        let attempt = claim_timeout_refund(&escrow, &buyer, deal_id).await?;
        match attempt.into_result() {
            Ok(_) => {
                claimed = true;
                break;
            }
            Err(e) => {
                let msg = format!("{:?}", e);
                assert!(
                    msg.contains("ERR_NOT_EXPIRED"),
                    "Only ERR_NOT_EXPIRED expected while waiting, got: {}",
                    msg
                );
                worker.fast_forward(20).await?;
            }
        }
    }
    assert!(claimed, "Deadline never expired after fast_forward rounds");

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Refunded");

    // Payer made whole, escrow empty, seller got nothing.
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);

    Ok(())
}
