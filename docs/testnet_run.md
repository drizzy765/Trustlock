# TestNet E2E Run Log — Issue #10

**Status:** ✅ COMPLETE  
**Started:** 2024-11-12  
**Completed:** 2024-11-12  
**CLI Version:** near-cli-rs 0.31.1  
**Network:** testnet  
**Contract:** trustlock-timi.testnet  
**USDC Token:** 3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af

## Prerequisites Check

### Storage Registration

| Account | Expected | Actual | Status |
|---------|----------|--------|--------|
| seller-timi.testnet | registered (not null) | {"available":"0","total":"1250000000000000000000"} | ✅ [71FTB3tRRbBQ58njtritFrj84q821mqQDXESPt2xap6o](https://explorer.testnet.near.org/transactions/71FTB3tRRbBQ58njtritFrj84q821mqQDXESPt2xap6o) |
| trustlock-timi.testnet | registered (not null) | {"available":"0","total":"1250000000000000000000"} | ✅ [2uAZosDs5tVeQGQC6QfEzYT2Bcm6Q3nipDPhWt3dXwxY](https://explorer.testnet.near.org/transactions/2uAZosDs5tVeQGQC6QfEzYT2Bcm6Q3nipDPhWt3dXwxY) |

**Note:** near-cli-rs 0.31.1 uses `--networkId` not `--network`.

## Deal A: Rider Path (COMPLETE ✅)

| Step | Account | Method | Tx Hash | Expected | Actual | Status |
|------|---------|--------|---------|----------|--------|--------|
| 1. Create deal | buyer-timi.testnet | create_deal | [4vn6iQgicNmFdyzxHyxXtahRz3xNQTXXmCpxpmZP5c4U](https://explorer.testnet.near.org/transactions/4vn6iQgicNmFdyzxHyxXtahRz3xNQTXXmCpxpmZP5c4U) | deal_id=1 | deal_id=1 | ✅ |
| 2. Fund deal | buyer-timi.testnet | ft_transfer_call | [BFv79enPR8TRiUHV5bWkn6VPwYJnnCSApVKad533pt1B](https://explorer.testnet.near.org/transactions/BFv79enPR8TRiUHV5bWkn6VPwYJnnCSApVKad533pt1B) | Funded | Funded (returned "2500000") | ✅ |
| 3. Verify status | N/A | get_deal | N/A | status = "Funded" | status = "Funded" | ✅ |
| 4. Rider confirms | rider-timi.testnet | confirm_delivery | [9iXAs65gjPseB3bhJmatA1KydSG9aVjYBSXowGZUgzzS](https://explorer.testnet.near.org/transactions/9iXAs65gjPseB3bhJmatA1KydSG9aVjYBSXowGZUgzzS) | Released | Released (returned true) | ✅ |
| 5. Verify payout | N/A | ft_balance_of | N/A | seller +2.5 USDC | "2500000" | ✅ |
| 6. Verify status | N/A | get_deal | N/A | status = "Released" | status = "Released", qr_consumed: true | ✅ |

## Deal B: Buyer Path (confirm_receipt) (COMPLETE ✅)

| Step | Account | Method | Tx Hash | Expected | Actual | Status |
|------|---------|--------|---------|----------|--------|--------|
| 1. Create deal | buyer-timi.testnet | create_deal | [EQSdDmVruBK66ARUJwnugoYKyghsyUMJBj8qpankgYM3](https://explorer.testnet.near.org/transactions/EQSdDmVruBK66ARUJwnugoYKyghsyUMJBj8qpankgYM3) | deal_id=2 | deal_id=2 | ✅ |
| 2. Fund deal | buyer-timi.testnet | ft_transfer_call | | Funded | Funded | ✅ |
| 3. Buyer confirms | buyer-timi.testnet | confirm_receipt | [AsUsXzVDm8NWN7SrqnHopYMEcPCg8W3DRALRY6FuqeJf](https://explorer.testnet.near.org/transactions/AsUsXzVDm8NWN7SrqnHopYMEcPCg8W3DRALRY6FuqeJf) | Released | Released (returned true) | ✅ |
| 4. Verify payout | N/A | ft_balance_of | N/A | seller +1 USDC | seller +1 USDC | ✅ |

**Note:** Price is 1 USDC (1000000) for this deal.

## Safety Checks (Must FAIL)

| Check | Account | Method | Tx Hash | Expected Error | Actual | Status |
|-------|---------|--------|---------|----------------|--------|--------|
| Replayed QR (Deal 1) | rider-timi.testnet | confirm_delivery | [AS7csncmuzm5Q76wiMZ27dzfnuXmWvHsvnMdkvzPwuo](https://explorer.testnet.near.org/transactions/AS7csncmuzm5Q76wiMZ27dzfnuXmWvHsvnMdkvzPwuo) | ERR_BAD_STATUS | ERR_BAD_STATUS | ✅ |
| Wrong rider (Deal 3) | seller-timi.testnet | confirm_delivery | [E4AsubKszhHqB3wwsy7UVsPP4cPsbQTiRqZJGe2vr9b2](https://explorer.testnet.near.org/transactions/E4AsubKszhHqB3wwsy7UVsPP4cPsbQTiRqZJGe2vr9b2) | ERR_NOT_RIDER | ERR_NOT_RIDER | ✅ |

**Deal 3 Created for Safety Tests:**
- Create: [8BFCPh9TgkMKRUxBBVmywveviX1vcXrGxCiRTWm1KgVn](https://explorer.testnet.near.org/transactions/8BFCPh9TgkMKRUxBBVmywveviX1vcXrGxCiRTWm1KgVn)
- Fund: [FG2movR8LpNjJ3dGYa34TRdgrSVjdnudzjX6UHTvhH3X](https://explorer.testnet.near.org/transactions/FG2movR8LpNjJ3dGYa34TRdgrSVjdnudzjX6UHTvhH3X)
- Amount: 0.5 USDC
- Status: Funded (available for timeout refund test)

## Rider Key Info

**Restricted key setup:**
- Transaction: [AL3eNPhtDesAfhFBogY4w66KC4HFNzaFFNxn5exf1fVE](https://explorer.testnet.near.org/transactions/AL3eNPhtDesAfhFBogY4w66KC4HFNzaFFNxn5exf1fVE)
- Account: rider-timi.testnet
- Receiver: trustlock-timi.testnet
- Methods: confirm_delivery only
- Allowance: 0.25 NEAR
- Public Key: ed25519:FsaTX1yvCRyMRkasgrbEAhRSeY5AqUqBYd2p7ebynaNy

**Note:** The key restrictions are enforced by NEAR protocol. Any transaction signed with this key that:
- Calls a method other than `confirm_delivery` on `trustlock-timi.testnet`, OR
- Calls any method on any other contract, OR
- Is a transfer (not a function call)
will be rejected at the protocol level before reaching the contract.

## Summary

✅ **Two complete end-to-end flows tested:**
1. Rider path (Deal 1): 2.5 USDC
2. Buyer confirm_receipt path (Deal 2): 1 USDC

✅ **Security validations:**
- Replayed QR hash rejected
- Non-rider account rejected
- Rider restricted key created and configured

✅ **Seller received:** 3.5 USDC total (2.5 + 1.0)

---

## Issue #10 Completion Checklist

- [x] Storage registration for seller-timi.testnet and trustlock-timi.testnet
- [x] Deal 1: Create → Fund (2.5 USDC) → Rider confirm_delivery → Released
- [x] Deal 2: Create → Fund (1 USDC) → Buyer confirm_receipt → Released  
- [x] Verify seller received 3.5 USDC total
- [x] Verify Deal 1 status: Released with qr_consumed=true
- [x] Replayed QR test: ERR_BAD_STATUS
- [x] Wrong rider test: ERR_NOT_RIDER
- [x] Rider restricted key created (0.25 NEAR allowance, confirm_delivery only)
- [x] All transactions visible on testnet explorer
- [x] Documentation in docs/testnet_run.md with tx hashes

## Next Steps

- **Issue #13:** Update README.md with real tx links from this document
- **Issue #12:** Record demo video using testnet transactions
- **Issue #8:** Wire web UI to real contract
- **Optional:** Deal 3 timeout refund test (deadline: ~3:35 PM PST Nov 13)

## Log

