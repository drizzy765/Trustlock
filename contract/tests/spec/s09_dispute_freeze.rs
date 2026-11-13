//! S09: Dispute Freeze.
//!
//! Setup: `open_dispute` on a Funded deal (by the buyer).
//! Expected: Status `Disputed`; `confirm_delivery` panics until resolved;
//! funds stay locked in escrow.

use crate::utils::*;

#[tokio::test]
async fn s09_dispute_freeze() -> anyhow::Result<()> {
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
    let (preimage, qr_hash) = qr_pair("s09");
    let deal_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(3_600_000),
        &qr_hash,
    )
    .await?;

    fund_deal(&ft, &buyer, escrow.id(), deal_id, price)
        .await?
        .into_result()?;

    open_dispute(&escrow, &buyer, deal_id, "item not as described")
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Disputed");

    // Payout is frozen while disputed.
    let frozen = confirm_delivery(&escrow, &rider, deal_id, &preimage).await?;
    assert!(
        frozen.is_failure(),
        "confirm_delivery must fail on Disputed"
    );
    let error = format!("{:?}", frozen.into_result().unwrap_err());
    assert!(
        error.contains("ERR_BAD_STATUS"),
        "Expected ERR_BAD_STATUS, got: {}",
        error
    );

    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Disputed");
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000 - price);

    Ok(())
}
