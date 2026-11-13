//! S02: Double Release Protection.
//!
//! Setup: Fund, confirm once (Released), confirm again.
//! Expected: Second `confirm_delivery` panics `ERR_BAD_STATUS`; seller
//! balance unchanged (benchmark also accepts `ERR_ALREADY_RELEASED`).

use crate::utils::*;

#[tokio::test]
async fn s02_double_release_protection() -> anyhow::Result<()> {
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
    let (preimage, qr_hash) = qr_pair("s02");
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

    confirm_delivery(&escrow, &rider, deal_id, &preimage)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Released");

    // Second confirm with the same QR must fail: the deal is Released.
    let second = confirm_delivery(&escrow, &rider, deal_id, &preimage).await?;
    assert!(second.is_failure(), "Second confirm_delivery must fail");
    let error = format!("{:?}", second.into_result().unwrap_err());
    assert!(
        error.contains("ERR_BAD_STATUS") || error.contains("ERR_ALREADY_RELEASED"),
        "Expected release-rejection, got: {}",
        error
    );

    // No double payout.
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Released");

    Ok(())
}
