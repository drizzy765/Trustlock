//! S05: Early Refund Blocked.
//!
//! Setup: `claim_timeout_refund_for` on a Funded deal before the deadline.
//! Expected: Panic `ERR_NOT_EXPIRED`; deal stays `Funded`; funds untouched.

use crate::utils::*;

#[tokio::test]
async fn s05_early_refund_blocked() -> anyhow::Result<()> {
    let worker = locked_sandbox().await?;

    let ft_owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &ft_owner).await?;
    let escrow = deploy_trustlock(&worker, ft.id(), ft_owner.id()).await?;

    for account in [&seller, &buyer, escrow.as_account()] {
        register_storage(&ft, account).await?;
    }
    mint(&ft, &ft_owner, buyer.id(), 10_000_000).await?;

    let price = 1_000_000;
    let (_preimage, qr_hash) = qr_pair("s05");
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

    let early = claim_timeout_refund(&escrow, &buyer, deal_id).await?;
    assert!(early.is_failure(), "Early refund must fail");
    let error = format!("{:?}", early.into_result().unwrap_err());
    assert!(
        error.contains("ERR_NOT_EXPIRED"),
        "Expected ERR_NOT_EXPIRED, got: {}",
        error
    );

    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000 - price);

    Ok(())
}
