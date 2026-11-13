//! S03: Replayed QR Protection.
//!
//! Setup: Two deals share one QR hash. Fund both, confirm the first.
//! Expected: Second confirm panics `ERR_REPLAYED_QR`; creating a third deal
//! with the same hash also panics `ERR_REPLAYED_QR`.

use crate::utils::*;

#[tokio::test]
async fn s03_replayed_qr_protection() -> anyhow::Result<()> {
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
    let (preimage, qr_hash) = qr_pair("s03");
    let deadline = now_ms_plus(3_600_000);

    // Same QR hash on two deals is allowed at creation (neither is consumed).
    let deal_1 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        deadline,
        &qr_hash,
    )
    .await?;
    let deal_2 = create_test_deal(
        &escrow,
        &seller,
        rider.id(),
        buyer.id(),
        price,
        deadline,
        &qr_hash,
    )
    .await?;

    for deal_id in [deal_1, deal_2] {
        fund_deal(&ft, &buyer, escrow.id(), deal_id, price)
            .await?
            .into_result()?;
    }

    confirm_delivery(&escrow, &rider, deal_1, &preimage)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_1).await?.status, "Released");

    // The same QR now replays on deal 2: hash matches, but it is consumed.
    let replay = confirm_delivery(&escrow, &rider, deal_2, &preimage).await?;
    assert!(replay.is_failure(), "Replayed QR must fail");
    let error = format!("{:?}", replay.into_result().unwrap_err());
    assert!(
        error.contains("ERR_REPLAYED_QR"),
        "Expected ERR_REPLAYED_QR, got: {}",
        error
    );
    assert_eq!(get_deal(&escrow, deal_2).await?.status, "Funded");

    // A new deal reusing the consumed hash is rejected at creation.
    let third = escrow
        .as_account()
        .call(escrow.id(), "create_deal")
        .args_json(serde_json::json!({
            "seller": seller.id(),
            "rider": rider.id(),
            "buyer": buyer.id(),
            "item": "Test Item 3",
            "price": price.to_string(),
            "deadline_ms": deadline,
            "qr_hash_hex": qr_hash,
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(third.is_failure(), "Reused QR hash must fail at creation");
    let error = format!("{:?}", third.into_result().unwrap_err());
    assert!(
        error.contains("ERR_REPLAYED_QR"),
        "Expected ERR_REPLAYED_QR, got: {}",
        error
    );

    Ok(())
}
