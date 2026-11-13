//! S12: Refund Transfer Failure Retry.
//!
//! Setup: The mock token fails the timeout refund transfer, then recovers.
//! Expected: After the failed refund the deal is back to `Funded` with funds
//! preserved (no loss, no double refund); retrying `claim_timeout_refund_for`
//! reaches `Refunded` and the payer is made whole.

use crate::utils::*;

#[tokio::test]
async fn s12_refund_transfer_failure() -> anyhow::Result<()> {
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
    let (_preimage, qr_hash) = qr_pair("s12");
    let deal_id = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(60_000),
        &qr_hash,
    )
    .await?;

    fund_deal(&ft, &buyer, escrow.id(), deal_id, price)
        .await?
        .into_result()?;

    // Expire the deal first (healthy token path, like S04).
    let mut claimed = false;
    for _ in 0..15 {
        match claim_timeout_refund(&escrow, &buyer, deal_id)
            .await?
            .into_result()
        {
            Ok(_) => {
                claimed = true;
                break;
            }
            Err(e) => {
                let msg = format!("{:?}", e);
                assert!(msg.contains("ERR_NOT_EXPIRED"), "Unexpected: {}", msg);
                worker.fast_forward(20).await?;
            }
        }
    }
    assert!(claimed, "Deal never expired");

    // That healthy claim already refunded; set up a second deal for the
    // failure case.
    let (_preimage2, qr_hash2) = qr_pair("s12b");
    let deal_2 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        now_ms_plus(60_000),
        &qr_hash2,
    )
    .await?;
    fund_deal(&ft, &buyer, escrow.id(), deal_2, price)
        .await?
        .into_result()?;

    ft_owner
        .call(ft.id(), "set_fail_next_transfer")
        .args_json(serde_json::json!({"fail": true}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Expire deal 2, then trigger the failing refund.
    let mut triggered = false;
    for _ in 0..15 {
        let attempt = claim_timeout_refund(&escrow, &buyer, deal_2).await?;
        match attempt.into_result() {
            Ok(_) => {
                triggered = true;
                break;
            }
            Err(e) => {
                let msg = format!("{:?}", e);
                assert!(msg.contains("ERR_NOT_EXPIRED"), "Unexpected: {}", msg);
                worker.fast_forward(20).await?;
            }
        }
    }
    assert!(triggered, "Refund never triggered");

    // on_refund restored Funded: funds preserved, nobody double-paid.
    // (buyer was refunded for deal 1 earlier, so it holds 10M - price now.)
    assert_eq!(get_deal(&escrow, deal_2).await?.status, "Funded");
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000 - price);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);

    // Retry with a healthy token: the refund goes through this time.
    claim_timeout_refund(&escrow, &buyer, deal_2)
        .await?
        .into_result()?;

    let deal = get_deal(&escrow, deal_2).await?;
    assert_eq!(deal.status, "Refunded");
    // Payer whole, escrow empty, seller untouched: no loss, no double refund.
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);

    Ok(())
}
