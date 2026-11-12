#!/bin/bash
# TrustLock End-to-End Test Script
# Run this to verify the full flow works before recording demo

set -e

CONTRACT="trustlock-timi.testnet"
TOKEN="3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af"
BUYER="buyer-timi.testnet"
SELLER="seller-timi.testnet"
RIDER="rider-timi.testnet"

echo "=========================================="
echo "TrustLock E2E Test"
echo "=========================================="
echo ""

# Generate QR hash (in real scenario, buyer generates this)
QR_HASH="0000000000000000000000000000000000000000000000000000000000000001"
QR_PREIMAGE="0000000000000000000000000000000000000000000000000000000000000001"

# Calculate deadline (24 hours from now in milliseconds)
DEADLINE=$(($(date +%s%3N) + 86400000))

echo "Step 1: Create Deal"
echo "------------------"
near call $CONTRACT create_deal \
  '{"seller":"'$SELLER'","rider":"'$RIDER'","buyer":"'$BUYER'","item":"black sandal","price":"2500000","deadline_ms":'$DEADLINE',"qr_hash_hex":"'$QR_HASH'"}' \
  --accountId $BUYER \
  --deposit 0.1

echo ""
echo "Step 2: Check Deal Created"
echo "-------------------------"
near view $CONTRACT get_deal '{"deal_id": 1}'

echo ""
echo "Step 3: Fund Deal (Buyer sends USDC to escrow)"
echo "---------------------------------------------"
near call $TOKEN ft_transfer_call \
  '{"receiver_id":"'$CONTRACT'","amount":"2500000","msg":"1"}' \
  --accountId $BUYER \
  --deposit 0.000000000000000000000001

echo ""
echo "Step 4: Verify Deal is Funded"
echo "-----------------------------"
near view $CONTRACT get_deal '{"deal_id": 1}'

echo ""
echo "Step 5: Check Balances Before Payout"
echo "-----------------------------------"
echo "Seller balance:"
near view $TOKEN ft_balance_of '{"account_id":"'$SELLER'"}'
echo ""
echo "Escrow balance:"
near view $TOKEN ft_balance_of '{"account_id":"'$CONTRACT'"}'

echo ""
echo "Step 6: Rider Confirms Delivery"
echo "--------------------------------"
near call $CONTRACT confirm_delivery \
  '{"deal_id":1,"qr_preimage_hex":"'$QR_PREIMAGE'"}' \
  --accountId $RIDER

echo ""
echo "Step 7: Verify Payout"
echo "---------------------"
echo "Seller balance (should have increased):"
near view $TOKEN ft_balance_of '{"account_id":"'$SELLER'"}'
echo ""
echo "Escrow balance (should be 0 or decreased):"
near view $TOKEN ft_balance_of '{"account_id":"'$CONTRACT'"}'
echo ""
echo "Deal status (should be Released):"
near view $CONTRACT get_deal '{"deal_id": 1}'

echo ""
echo "=========================================="
echo "E2E Test Complete!"
echo "=========================================="
