//! S15: Dispute Timeout Exit.
//!
//! Setup: A Funded deal is disputed and left open past DISPUTE_WINDOW_MS
//! (7 days, advanced with fast_forward).
//! Expected: Before the window, `claim_dispute_timeout_refund` panics
//! `ERR_DISPUTE_OPEN`; non-buyers panic `ERR_NOT_BUYER` even after it; the
//! buyer claims after the window and the deal reaches `Refunded` with the
//! payer made whole. Nothing stays `Disputed` forever.

use crate::utils::*;

#[tokio::test]
async fn s15_dispute_timeout_exit() -> anyhow::Result<()> {
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
    let (_preimage, qr_hash) = qr_pair("s15");
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

    open_dispute(&escrow, &buyer, deal_id, "no resolution in sight")
        .await?
        .into_result()?;
    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Disputed");
    assert!(deal.disputed_at_ms > 0, "Dispute must record its timestamp");

    // Inside the window the exit is closed, even for the buyer.
    let early = claim_dispute_timeout_refund(&escrow, &buyer, deal_id).await?;
    assert!(early.is_failure(), "Early timeout claim must fail");
    let error = format!("{:?}", early.into_result().unwrap_err());
    assert!(
        error.contains("ERR_DISPUTE_OPEN"),
        "Expected ERR_DISPUTE_OPEN, got: {}",
        error
    );
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Disputed");

    // Advance past the 7-day window (sandbox blocks are ~1s; chunked so a
    // slow box can still make progress between attempts).
    let mut exited = false;
    for _ in 0..20 {
        let attempt = claim_dispute_timeout_refund(&escrow, &buyer, deal_id).await?;
        match attempt.into_result() {
            Ok(_) => {
                exited = true;
                break;
            }
            Err(e) => {
                let msg = format!("{:?}", e);
                assert!(
                    msg.contains("ERR_DISPUTE_OPEN"),
                    "Only ERR_DISPUTE_OPEN expected while waiting, got: {}",
                    msg
                );
                worker.fast_forward(100_000).await?;
            }
        }
    }
    assert!(exited, "Dispute window never elapsed after fast_forward rounds");

    // Non-buyers still cannot take the exit, even after the window.
    let (_, qr2) = qr_pair("s15b");
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
    open_dispute(&escrow, &buyer, deal_2, "stuck too")
        .await?
        .into_result()?;
    // The window already passed on-chain, so the seller's attempt must fail
    // on identity, not on timing.
    let stranger = claim_dispute_timeout_refund(&escrow, &seller, deal_2).await?;
    assert!(stranger.is_failure(), "Seller timeout claim must fail");
    let error = format!("{:?}", stranger.into_result().unwrap_err());
    assert!(
        error.contains("ERR_NOT_BUYER"),
        "Expected ERR_NOT_BUYER, got: {}",
        error
    );

    // The buyer takes the exit: Refunded, payer whole, escrow empty.
    // (deal_1 already refunded the buyer to 10M; deal_2 funds then refunds.)
    claim_dispute_timeout_refund(&escrow, &buyer, deal_2)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_2).await?.status, "Refunded");
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, 0);

    Ok(())
}
