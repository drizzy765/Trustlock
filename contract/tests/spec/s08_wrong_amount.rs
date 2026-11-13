//! S08: Wrong Amount and Double Funding.
//!
//! Setup: `ft_transfer_call` with an amount != price; then a second funding
//! on an already-Funded deal.
//! Expected: Both fail and the deal keeps its status; tokens stay with the
//! sender (NEP-141 refunds the failed `ft_transfer_call`).

use crate::utils::*;

#[tokio::test]
async fn s08_wrong_amount_funding_blocked() -> anyhow::Result<()> {
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
    let (_preimage, qr_hash) = qr_pair("s08");
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

    // Wrong amount on a Created deal: the escrow's ft_on_transfer panics
    // (ERR_WRONG_AMOUNT), so the mock token's resolve callback refunds the
    // sender in full. NEP-141 semantics: the outer ft_transfer_call succeeds
    // with 0 kept, the deal stays Created, nothing moves.
    let wrong = fund_deal(&ft, &buyer, escrow.id(), deal_id, 500_000).await?;
    let wrong_outcome = wrong.into_result()?;
    let kept: String = wrong_outcome.json()?;
    assert_eq!(kept, "0", "Refunded in full, nothing kept");

    let deal = get_deal(&escrow, deal_id).await?;
    assert_eq!(deal.status, "Created");
    assert!(deal.payer.is_none());
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, 0);

    // Correct funding works.
    fund_deal(&ft, &buyer, escrow.id(), deal_id, price)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");

    // Second funding on a Funded deal: ft_on_transfer panics (ERR_BAD_STATUS)
    // and the tokens are refunded the same way; payer not charged twice.
    let double = fund_deal(&ft, &buyer, escrow.id(), deal_id, price).await?;
    let double_outcome = double.into_result()?;
    let kept: String = double_outcome.json()?;
    assert_eq!(kept, "0", "Double fund refunded in full");

    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");
    assert_eq!(ft_balance_of(&ft, buyer.id()).await?, 10_000_000 - price);
    assert_eq!(ft_balance_of(&ft, escrow.id()).await?, price);

    Ok(())
}
