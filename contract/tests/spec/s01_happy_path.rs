//! S01: Happy Path - create, fund, rider release.
//!
//! Setup: Funded deal, fresh QR, rider account confirms.
//! Expected: Status `Released`; seller balance += price; buyer not refunded.

use crate::utils::*;

#[tokio::test]
async fn s01_happy_path() -> anyhow::Result<()> {
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
    mint(&ft, &ft_owner, buyer.id(), 10_000_000).await?; // 10 USDC

    let price = 1_000_000; // 1 USDC
    let (preimage, qr_hash) = qr_pair("s01");
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

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created");
    assert_eq!(deal.price.0, price);

    // Fund through the real NEP-141 path: ft_transfer_call with the plain
    // deal id string as msg.
    fund_deal(&ft, &buyer, escrow.id(), deal_id, price)
        .await?
        .into_result()?;

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Funded");
    assert_eq!(deal.payer, Some(buyer.id().clone()));

    // Rider releases with the one-time QR.
    confirm_delivery(&escrow, &rider, deal_id, &preimage)
        .await?
        .into_result()?;

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Released");
    assert!(deal.qr_consumed);

    assert_eq!(ft_balance_of(&ft, seller.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);
    // Buyer paid exactly the price: not refunded, not overcharged.
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000 - price);

    Ok(())
}
