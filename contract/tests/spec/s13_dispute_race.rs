//! S13: Callback Privacy and Post-Release Disputes.
//!
//! Setup: Call the `#[private]` payout/refund callbacks directly, and try to
//! dispute an already-Released deal.
//! Expected: Direct callback calls panic (only the contract itself may run
//! them, so no one can force `Released`/`Refunded`); `open_dispute` on a
//! terminal deal panics `ERR_BAD_STATUS`.

use crate::utils::*;

#[tokio::test]
async fn s13_dispute_during_payout() -> anyhow::Result<()> {
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
    let (preimage, qr_hash) = qr_pair("s13");
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

    // The payout callback cannot be forced from outside the contract.
    let forced_payout = buyer
        .call(escrow.id(), "on_payout")
        .args_json(serde_json::json!({"deal_id": deal_id, "prev_status": "Funded"}))
        .max_gas()
        .transact()
        .await?;
    assert!(
        forced_payout.is_failure(),
        "Direct on_payout call must fail (private)"
    );

    // The refund callback cannot be forced either.
    let forced_refund = buyer
        .call(escrow.id(), "on_refund")
        .args_json(serde_json::json!({"deal_id": deal_id}))
        .max_gas()
        .transact()
        .await?;
    assert!(
        forced_refund.is_failure(),
        "Direct on_refund call must fail (private)"
    );

    // The real release still works.
    confirm_delivery(&escrow, &rider, deal_id, &preimage)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Released");

    // A terminal deal cannot be reopened into dispute.
    let late_dispute = open_dispute(&escrow, &buyer, deal_id, "too late").await?;
    assert!(late_dispute.is_failure(), "Dispute on Released must fail");
    let error = format!("{:?}", late_dispute.into_result().unwrap_err());
    assert!(
        error.contains("ERR_BAD_STATUS"),
        "Expected ERR_BAD_STATUS, got: {}",
        error
    );
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Released");

    Ok(())
}
