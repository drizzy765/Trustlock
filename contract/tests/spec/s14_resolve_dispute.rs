//! S14: Admin Dispute Resolution.
//!
//! Setup: Funded deals opened into dispute, then resolved by the owner (the
//! escrow account itself, which deployed the contract) or the arbiter.
//! Expected: `resolve_dispute` with `"release"` pays the seller
//! (`Released`); with `"refund"` refunds the payer (`Refunded`).
//! Strangers are rejected with `ERR_NOT_ADMIN`, unknown outcomes with
//! `ERR_BAD_OUTCOME`, non-`Disputed` deals with `ERR_BAD_STATUS`.
//! `set_arbiter` is owner-only and hands resolution to a new arbiter.

use crate::utils::*;

#[tokio::test]
async fn s14_admin_dispute_resolution() -> anyhow::Result<()> {
    let worker = locked_sandbox().await?;

    let ft_owner = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let rider = worker.dev_create_account().await?;
    let buyer = worker.dev_create_account().await?;
    let stranger = worker.dev_create_account().await?;
    let arbiter2 = worker.dev_create_account().await?;

    let ft = deploy_mock_ft(&worker, &ft_owner).await?;
    // ft_owner doubles as arbiter here; s15-style specs use their own.
    let escrow = deploy_trustlock(&worker, ft.id(), ft_owner.id()).await?;
    // The escrow account itself is the owner (it called `new` on itself).
    let owner = escrow.as_account();

    for account in [&seller, &buyer, escrow.as_account()] {
        register_storage(&ft, account).await?;
    }
    mint(&ft, &ft_owner, buyer.id(), 30_000_000).await?;

    let price = 1_000_000;

    // Deal 1: owner resolves with a release to the seller.
    let (_, qr1) = qr_pair("s14a");
    let deal_1 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(3_600_000),
        &qr1,
    )
    .await?;
    fund_deal(&ft, &buyer, escrow.id(), deal_1, price)
        .await?
        .into_result()?;
    open_dispute(&escrow, &buyer, deal_1, "item not as described")
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_1).await?.status, "Disputed");

    resolve_dispute(&escrow, owner, deal_1, "release")
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_1).await?.status, "Released");
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, price);

    // Deal 2: arbiter resolves with a refund to the payer.
    let (_, qr2) = qr_pair("s14b");
    let deal_2 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(3_600_000),
        &qr2,
    )
    .await?;
    fund_deal(&ft, &buyer, escrow.id(), deal_2, price)
        .await?
        .into_result()?;
    open_dispute(&escrow, &seller, deal_2, "cannot deliver")
        .await?
        .into_result()?;

    resolve_dispute(&escrow, &ft_owner, deal_2, "refund")
        .await?
        .into_result()?;
    let deal = get_deal(&escrow, deal_2).await?;
    assert_eq!(deal.status, "Refunded");
    // Buyer funded deal 2 (price) and was refunded; seller keeps deal-1 payout.
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 30_000_000 - price);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);

    // Deal 3: auth and outcome guards.
    let (_, qr3) = qr_pair("s14c");
    let deal_3 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(3_600_000),
        &qr3,
    )
    .await?;
    fund_deal(&ft, &buyer, escrow.id(), deal_3, price)
        .await?
        .into_result()?;
    open_dispute(&escrow, &buyer, deal_3, "late")
        .await?
        .into_result()?;

    // Stranger (not owner, not arbiter) cannot resolve.
    let attempt = resolve_dispute(&escrow, &stranger, deal_3, "release").await?;
    assert!(attempt.is_failure(), "Stranger resolve must fail");
    let error = format!("{:?}", attempt.into_result().unwrap_err());
    assert!(
        error.contains("ERR_NOT_ADMIN"),
        "Expected ERR_NOT_ADMIN, got: {}",
        error
    );

    // Unknown outcome is rejected.
    let bad = resolve_dispute(&escrow, owner, deal_3, "split").await?;
    assert!(bad.is_failure(), "Unknown outcome must fail");
    let error = format!("{:?}", bad.into_result().unwrap_err());
    assert!(
        error.contains("ERR_BAD_OUTCOME"),
        "Expected ERR_BAD_OUTCOME, got: {}",
        error
    );

    // Owner hands resolution to a new arbiter, who resolves.
    set_arbiter(&escrow, owner, arbiter2.id())
        .await?
        .into_result()?;
    let stranger_set = set_arbiter(&escrow, &stranger, buyer.id()).await?;
    assert!(stranger_set.is_failure(), "Stranger set_arbiter must fail");
    let error = format!("{:?}", stranger_set.into_result().unwrap_err());
    assert!(
        error.contains("ERR_NOT_OWNER"),
        "Expected ERR_NOT_OWNER, got: {}",
        error
    );

    resolve_dispute(&escrow, &arbiter2, deal_3, "release")
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_3).await?.status, "Released");
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 2 * price);

    // Resolving a non-Disputed deal is rejected.
    let (_, qr4) = qr_pair("s14d");
    let deal_4 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(3_600_000),
        &qr4,
    )
    .await?;
    let early = resolve_dispute(&escrow, owner, deal_4, "refund").await?;
    assert!(early.is_failure(), "Resolve on Created must fail");
    let error = format!("{:?}", early.into_result().unwrap_err());
    assert!(
        error.contains("ERR_BAD_STATUS"),
        "Expected ERR_BAD_STATUS, got: {}",
        error
    );

    Ok(())
}
