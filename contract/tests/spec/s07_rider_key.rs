//! S07: Rider Key Confinement.
//!
//! Setup: A function-call access key limited to `confirm_delivery` (the same
//! shape scripts/add-rider-key.sh attaches) tries `claim_timeout_refund_for`
//! and `open_dispute`.
//! Expected: Both rejected at the key (runtime access-key check), before the
//! contract runs. The same key CAN still release via `confirm_delivery`.

use crate::utils::*;

/// A key-level rejection never reaches contract logic: the runtime answers
/// `InvalidAccessKeyError(MethodNameMismatch)` before the contract runs.
/// Rejections surface either as a failed receipt or as a broadcast-time error,
/// depending on how far the transaction gets; both must name the method
/// mismatch and carry no contract error code.
fn assert_key_level_rejection(
    label: &str,
    result: anyhow::Result<near_workspaces::result::ExecutionFinalResult>,
) {
    let error = match result {
        Ok(outcome) => {
            assert!(
                outcome.is_failure(),
                "{} with the restricted key must fail",
                label
            );
            format!("{:?}", outcome.into_result().unwrap_err())
        }
        Err(e) => format!("{:?}", e),
    };
    println!("{} rejected: {}", label, error);
    assert!(
        error.contains("MethodNameMismatch"),
        "{} must be rejected for the method name, got: {}",
        label,
        error
    );
    assert!(
        !error.contains("ERR_"),
        "{} reached contract logic (forbidden): {}",
        label,
        error
    );
}

#[tokio::test]
async fn s07_rider_key_confinement() -> anyhow::Result<()> {
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
    let (preimage, qr_hash) = qr_pair("s07");
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

    // Rider's real key shape: FunctionCall, receiver = escrow, one method.
    let restricted =
        restricted_key_account(&worker, &rider, escrow.id(), &["confirm_delivery"]).await?;

    // claim_timeout_refund_for with the rider key: rejected at the key.
    let refund_attempt = claim_timeout_refund(&escrow, &restricted, deal_id).await;
    assert_key_level_rejection("claim_timeout_refund_for", refund_attempt);

    // open_dispute with the rider key: rejected at the key.
    let dispute_attempt = open_dispute(&escrow, &restricted, deal_id, "rider try").await;
    assert_key_level_rejection("open_dispute", dispute_attempt);

    // The deal is untouched by both attempts.
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Funded");

    // And the key still works for its one allowed method.
    confirm_delivery(&escrow, &restricted, deal_id, &preimage)
        .await?
        .into_result()?;
    assert_eq!(get_deal(&escrow, deal_id).await?.status, "Released");
    assert_eq!(ft_balance_of(&ft, seller.id()).await?, price);

    Ok(())
}
