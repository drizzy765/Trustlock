//! S06: Stranger Confirm Blocked.
//!
//! Setup: A random account (not the designated rider) calls
//! `confirm_delivery` on a Funded deal.
//! Expected: Panic `ERR_NOT_RIDER`; deal stays `Funded`.

use crate::utils::*;

#[tokio::test]
async fn s06_stranger_confirm_blocked() -> anyhow::Result<()> {
    let worker = locked_sandbox().await?;

    let ft_owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &ft_owner).await?;
    let escrow = deploy_trustlock(&worker, ft.id()).await?;

    for account in [&seller, &buyer, escrow.as_account()] {
        register_storage(&ft, account).await?;
    }
    mint(&ft, &ft_owner, buyer.id(), 10_000_000).await?;

    let price = 1_000_000;
    let (preimage, qr_hash) = qr_pair("s06");
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

    let attempt = confirm_delivery(&escrow, &stranger, deal_id, &preimage).await?;
    assert!(attempt.is_failure(), "Stranger confirm must fail");
    let error = format!("{:?}", attempt.into_result().unwrap_err());
    assert!(
        error.contains("ERR_NOT_RIDER"),
        "Expected ERR_NOT_RIDER, got: {}",
        error
    );

    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);

    Ok(())
}
