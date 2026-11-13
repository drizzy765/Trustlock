"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { contractId, usdcToken } from "@/lib/config";
import { initNear, isSignedIn, getAccountId, signIn, getDeal, getExplorerUrl, fundDeal } from "@/lib/near";
import Link from "next/link";

export default function PayDealPage() {
  const params = useParams();
  const dealId = params.id as string;
  
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [deal, setDeal] = useState<any>(null);
  const [isLoadingDeal, setIsLoadingDeal] = useState(false);
  const [isFunding, setIsFunding] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      setIsLoading(false);
      
      // Load deal by ID
      if (dealId) {
        loadDeal(parseInt(dealId));
      }
    });
  }, [dealId]);

  async function loadDeal(dealIdNum: number) {
    setIsLoadingDeal(true);
    setError(null);
    try {
      const dealData = await getDeal(dealIdNum);
      setDeal(dealData);
    } catch (e) {
      console.error("Failed to load deal:", e);
      setError("Deal not found");
    } finally {
      setIsLoadingDeal(false);
    }
  }

  async function handleConnect() {
    await signIn();
  }

  async function handleFundDeal() {
    if (!deal || !accountId || !dealId) return;
    
    setIsFunding(true);
    try {
      const dealIdNum = parseInt(dealId);
      const amount = deal.price.toString();
      
      // Call ft_transfer_call on USDC token contract
      const result = await fundDeal(dealIdNum, amount, usdcToken);
      
      // Get transaction hash from result
      const txHash = result.transaction.hash;
      setTxHash(txHash);
      
      // Reload deal to show funded status
      await loadDeal(dealIdNum);
    } catch (e) {
      console.error("Fund deal failed:", e);
      alert("Failed to fund deal: " + (e as Error).message);
    } finally {
      setIsFunding(false);
    }
  }

  async function handleConfirmReceipt() {
    if (!deal || !accountId || !dealId) return;
    
    setIsConfirming(true);
    try {
      const dealIdNum = parseInt(dealId);
      
      // Call confirm_receipt on contract
      const { initNear } = await import("@/lib/near");
      const { wallet } = await initNear();
      if (!wallet) throw new Error("Wallet not initialized");
      
      const result = await wallet.account().functionCall({
        contractId: contractId,
        methodName: "confirm_receipt",
        args: { deal_id: dealIdNum },
        gas: "50000000000000", // 50 Tgas
        attachedDeposit: "0"
      });
      
      // Get transaction hash from result
      const txHash = result.transaction.hash;
      setTxHash(txHash);
      
      // Reload deal to show released status
      await loadDeal(dealIdNum);
    } catch (e) {
      console.error("Confirm receipt failed:", e);
      alert("Failed to confirm receipt: " + (e as Error).message);
    } finally {
      setIsConfirming(false);
    }
  }

  const isConnected = !!accountId;
  const isBuyer = deal && accountId === deal.buyer;

  if (isLoading) {
    return (
      <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Deal #{dealId}</h1>
        <p style={{ color: "#888" }}>Review and fund this escrow deal</p>
      </div>

      {/* Wallet Connection */}
      <div style={{ 
        background: "#1a1a1a", 
        padding: 16, 
        borderRadius: 8, 
        marginBottom: 24,
        border: "1px solid #333"
      }}>
        {isConnected ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Connected: <strong>{accountId}</strong></span>
            <span style={{ 
              background: "#22c55e", 
              color: "#000", 
              padding: "4px 8px", 
              borderRadius: 4,
              fontSize: 12,
              fontWeight: "bold"
            }}>
              testnet
            </span>
          </div>
        ) : (
          <button 
            onClick={handleConnect}
            style={{
              background: "#22c55e",
              color: "#000",
              border: "none",
              padding: "12px 24px",
              borderRadius: 6,
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: 14
            }}
          >
            Connect NEAR Wallet
          </button>
        )}
      </div>

      {/* Deal Details */}
      {isLoadingDeal ? (
        <p>Loading deal...</p>
      ) : error ? (
        <div style={{ 
          background: "#1a1a1a", 
          padding: 16, 
          borderRadius: 8,
          border: "1px solid #ef4444"
        }}>
          <p style={{ color: "#ef4444", margin: 0 }}>{error}</p>
        </div>
      ) : deal ? (
        <div style={{ 
          background: "#1a1a1a", 
          padding: 16, 
          borderRadius: 8, 
          marginBottom: 24,
          border: "1px solid #333"
        }}>
          <h3 style={{ marginTop: 0 }}>Deal Details</h3>
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Item:</span>
              <span>{deal.item}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Price:</span>
              <span>{(deal.price / 1000000).toFixed(2)} USDC</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Seller:</span>
              <span>{deal.seller}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Buyer:</span>
              <span>{deal.buyer}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Status:</span>
              <span style={{ 
                padding: "2px 8px", 
                borderRadius: 4,
                background: deal.status === "Created" ? "#374151" : 
                            deal.status === "Funded" ? "#1e3a8a" : 
                            deal.status === "Released" ? "#064e3b" : "#374151",
                color: "#fff",
                fontSize: 12
              }}>
                {deal.status}
              </span>
            </div>
          </div>
          
          {deal.status === "Created" ? (
            <button
              disabled={!isConnected || isFunding}
              onClick={handleFundDeal}
              style={{
                width: "100%",
                background: !isConnected ? "#444" : "#22c55e",
                color: "#fff",
                border: "none",
                padding: "14px 24px",
                borderRadius: 6,
                cursor: !isConnected || isFunding ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: 16
              }}
            >
              {!isConnected 
                ? "Connect Wallet to Fund" 
                : isFunding
                  ? "Locking USDC..."
                  : "🔒 Lock Funds in Escrow"
              }
            </button>
          ) : deal.status === "Funded" ? (
            <div>
              <div style={{ 
                background: "#1e3a8a", 
                padding: 12, 
                borderRadius: 6,
                textAlign: "center",
                marginBottom: 16
              }}>
                <p style={{ margin: 0, color: "#60a5fa" }}>
                  ✅ This deal is funded and ready for delivery
                </p>
              </div>
              
              {isBuyer && (
                <button
                  disabled={isConfirming}
                  onClick={handleConfirmReceipt}
                  style={{
                    width: "100%",
                    background: isConfirming ? "#444" : "#22c55e",
                    color: "#fff",
                    border: "none",
                    padding: "14px 24px",
                    borderRadius: 6,
                    cursor: isConfirming ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    fontSize: 16,
                    marginTop: 12
                  }}
                >
                  {isConfirming 
                    ? "Confirming..." 
                    : "✅ I Received It - Release Funds"
                  }
                </button>
              )}
              
              {!isBuyer && (
                <p style={{ color: "#888", textAlign: "center", fontSize: 14 }}>
                  Waiting for buyer to confirm receipt or rider to scan QR
                </p>
              )}
            </div>
          ) : (
            <div style={{ 
              background: "#064e3b", 
              padding: 12, 
              borderRadius: 6,
              textAlign: "center"
            }}>
              <p style={{ margin: 0, color: "#22c55e" }}>
                ✅ This deal is {deal.status.toLowerCase()}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Transaction Result */}
      {txHash && (
        <div style={{ 
          background: "#064e3b", 
          padding: 16, 
          borderRadius: 8, 
          marginBottom: 24,
          border: "1px solid #22c55e"
        }}>
          <h4 style={{ marginTop: 0, color: "#22c55e" }}>✅ Success!</h4>
          <p>Transaction: <code style={{ fontSize: 12 }}>{txHash}</code></p>
          <a 
            href={getExplorerUrl(txHash)}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#3b82f6" }}
          >
            View on Explorer →
          </a>
        </div>
      )}

      {/* Navigation */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link 
          href="/" 
          style={{ 
            color: "#3b82f6", 
            textDecoration: "none",
            fontSize: 14
          }}
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
