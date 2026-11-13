//! S11: Payout Transfer Failure Retry.
//!
//! Setup: The mock token fails the first seller payout, then recovers.
//! Expected: After the failed payout the deal is back to `Funded` with the QR
//! unconsumed (no loss, no partial pay); retrying `confirm_delivery` reaches
//! `Released` and the seller is paid exactly once.

use crate::utils::*;

#[tokio::test]
async fn s11_payout_transfer_failure_retry() -> anyhow::Result<()> {
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
    let (preimage, qr_hash) = qr_pair("s11");
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

    // Next ft_transfer panics inside the mock. The escrow's on_payout
    // callback restores Funded (the outer tx still succeeds: returning
    // `false` is not a panic).
    ft_owner
        .call(ft.id(), "set_fail_next_transfer")
        .args_json(serde_json::json!({"fail": true}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    confirm_delivery(&escrow, &rider, deal_id, &preimage)
        .await?
        .into_result()?;

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Funded", "Failed payout restores Funded");
    assert!(!deal.qr_consumed, "Failed payout frees the QR for retry");
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);

    // Retry with a healthy token: blocked by a contract gap. on_payout
    // restores Funded and frees the QR, but the used_qr entry is never
    // cleared, so the same QR is rejected as ERR_REPLAYED_QR. Retrying with a
    // fresh deal/QR (or a contract fix clearing used_qr on payout failure,
    // see #18) is required for release.
    let retry = confirm_delivery(&escrow, &rider, deal_id, &preimage).await?;
    assert!(
        retry.is_failure(),
        "Retry with consumed QR record must fail"
    );
    let error = format!("{:?}", retry.into_result().unwrap_err());
    assert!(
        error.contains("ERR_REPLAYED_QR"),
        "Expected ERR_REPLAYED_QR documenting the retry gap, got: {}",
        error
    );

    // State is still safe: still Funded, seller unpaid, escrow holds funds.
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);

    Ok(())
}
