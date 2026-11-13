//! S10: Buyer Confirm-Receipt Release.
//!
//! Setup: Funded deal; a wrong QR preimage is rejected; then the buyer calls
//! `confirm_receipt` (one-tap release without a rider scan).
//! Expected: Wrong QR panics `ERR_BAD_QR`; buyer release reaches `Released`
//! with the seller paid. Anyone else calling `confirm_receipt` is rejected
//! with `ERR_NOT_BUYER`.

use crate::utils::*;

#[tokio::test]
async fn s10_buyer_confirm_receipt() -> anyhow::Result<()> {
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
    let (_preimage, qr_hash) = qr_pair("s10");
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

    // A QR the buyer never authorized is rejected on the rider path...
    let wrong_qr = "00".repeat(32);
    let wrong = confirm_delivery(&escrow, &rider, deal_id, &wrong_qr).await?;
    assert!(wrong.is_failure(), "Wrong QR must fail");
    let error = format!("{:?}", wrong.into_result().unwrap_err());
    assert!(
        error.contains("ERR_BAD_QR"),
        "Expected ERR_BAD_QR, got: {}",
        error
    );

    // ...but only the buyer may take the one-tap receipt path.
    let stranger_receipt = confirm_receipt(&escrow, &seller, deal_id).await?;
    assert!(
        stranger_receipt.is_failure(),
        "Seller confirm_receipt must fail"
    );
    let error = format!("{:?}", stranger_receipt.into_result().unwrap_err());
    assert!(
        error.contains("ERR_NOT_BUYER"),
        "Expected ERR_NOT_BUYER, got: {}",
        error
    );

    confirm_receipt(&escrow, &buyer, deal_id)
        .await?
        .into_result()?;

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Released");
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000 - price);

    Ok(())
}
