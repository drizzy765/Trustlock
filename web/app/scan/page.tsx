"use client";

import { useState, useEffect } from "react";
import { initNear, isSignedIn, getAccountId, signIn, confirmDelivery, getDeal, getExplorerUrl } from "@/lib/near";
import { fetchHealth, type Mode } from "@/lib/quote";
import ModeBadge from "@/components/ModeBadge";
import { SHA256 as sha256 } from "crypto-js";

export default function ScanPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dealId, setDealId] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [dealInfo, setDealInfo] = useState<any>(null);

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      setIsLoading(false);
    });
    fetchHealth().then((health) => {
      if (health?.mode) setMode(health.mode);
    });
  }, []);

  async function handleConnect() {
    await signIn();
  }

  async function lookupDeal() {
    if (!dealId) return;
    try {
      const deal = await getDeal(parseInt(dealId));
      setDealInfo(deal);
    } catch (e) {
      console.error("Failed to get deal:", e);
      setDealInfo(null);
    }
  }

  async function handleSubmit() {
    if (!dealId || !qrInput.trim()) return;
    
    setIsSubmitting(true);
    
    try {
      // Calculate QR hash from preimage
      const calculatedHash = sha256(qrInput).toString();
      
      // Call contract
      const result = await confirmDelivery(parseInt(dealId), qrInput);
      
      setResult({
        success: true,
        message: "Delivery confirmed! Funds released to seller.",
        tx_hash: result.transaction.hash,
        deal_id: dealId,
        mode: mode,
      });
      
      // Refresh deal info
      await lookupDeal();
    } catch (e: any) {
      // Check for specific contract errors
      const errorMessage = e.message || "";
      let userMessage = "Failed to confirm delivery.";
      
      if (errorMessage.includes("ERR_REPLAYED_QR")) {
        userMessage = "❌ This QR code was already used. Replay rejected.";
      } else if (errorMessage.includes("ERR_NOT_RIDER")) {
        userMessage = "❌ Only the assigned rider can confirm this delivery.";
      } else if (errorMessage.includes("ERR_ALREADY_RELEASED")) {
        userMessage = "❌ Funds were already released for this deal.";
      } else if (errorMessage.includes("ERR_DEADLINE")) {
        userMessage = "❌ Deal deadline has passed.";
      } else if (errorMessage.includes("ERR_BAD_STATUS")) {
        userMessage = "❌ Deal is not in Funded status.";
      }
      
      setResult({
        success: false,
        message: userMessage,
        error: errorMessage,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const isConnected = !!accountId;

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Rider — Confirm Delivery</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888" }}>App mode:</span>
          <ModeBadge mode={mode} />
        </div>
      </div>

      {/* Wallet Connection */}
      <div style={{ 
        background: "#1a1a1a", 
        padding: 16, 
        borderRadius: 8, 
        marginBottom: 24,
        border: "1px solid #333"
      }}>
        {isLoading ? (
          <p>Loading wallet...</p>
        ) : isConnected ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Rider Account: <strong>{accountId}</strong></span>
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
            Connect Rider Wallet
          </button>
        )}
      </div>

      {/* Deal Lookup */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Deal ID</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="number"
            value={dealId}
            onChange={(e) => setDealId(e.target.value)}
            placeholder="Enter deal ID (e.g., 1)"
            style={{
              flex: 1,
              padding: 12,
              background: "#1a1a1a",
              color: "#fff",
              border: "1px solid #333",
              borderRadius: 6,
              fontSize: 14
            }}
          />
          <button
            onClick={lookupDeal}
            disabled={!dealId || mode === "demo"}
            style={{
              padding: "12px 20px",
              background: mode === "demo" ? "#444" : "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: mode === "demo" ? "not-allowed" : "pointer",
              fontWeight: "bold"
            }}
          >
            Lookup
          </button>
        </div>
        
        {dealInfo && (
          <div style={{ 
            marginTop: 12,
            padding: 12, 
            background: "#1a1a1a", 
            borderRadius: 6,
            border: "1px solid #333"
          }}>
            <h4 style={{ marginTop: 0 }}>Deal #{dealInfo.deal_id}</h4>
            <p style={{ margin: "4px 0" }}>Status: <strong>{dealInfo.status}</strong></p>
            <p style={{ margin: "4px 0" }}>Item: {dealInfo.item}</p>
            <p style={{ margin: "4px 0" }}>Price: {(dealInfo.price / 1000000).toFixed(2)} USDC</p>
            <p style={{ margin: "4px 0" }}>Seller: {dealInfo.seller}</p>
            <p style={{ margin: "4px 0" }}>Buyer: {dealInfo.buyer}</p>
          </div>
        )}
      </div>

      {/* QR Input */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Scan Buyer QR Code</h3>
        <p style={{ color: "#888", fontSize: 14 }}>
          Enter the one-time QR code from the buyer to confirm delivery.
          <br />
          <span style={{ color: "#f87171" }}>Replayed QR codes will fail on-chain.</span>
        </p>
        
        {/* Camera placeholder */}
        <div style={{ 
          background: "#1a1a1a", 
          border: "2px dashed #333",
          borderRadius: 8,
          padding: 40,
          textAlign: "center",
          marginBottom: 16
        }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📷</div>
          <p style={{ color: "#888", margin: 0 }}>
            Camera access not implemented in demo
          </p>
          <p style={{ color: "#666", fontSize: 12, margin: "8px 0 0 0" }}>
            Use text input below
          </p>
        </div>
        
        <textarea
          value={qrInput}
          onChange={(e) => setQrInput(e.target.value)}
          placeholder="Paste QR code data here..."
          rows={4}
          style={{
            width: "100%",
            padding: 12,
            background: "#1a1a1a",
            color: "#fff",
            border: "1px solid #333",
            borderRadius: 6,
            fontFamily: "monospace",
            fontSize: 12,
            resize: "vertical"
          }}
        />
        
        <button
          onClick={handleSubmit}
          disabled={!dealId || !qrInput.trim() || isSubmitting || !isConnected || mode === "demo"}
          style={{
            marginTop: 12,
            width: "100%",
            background: !isConnected || mode === "demo" ? "#444" : "#22c55e",
            color: "#fff",
            border: "none",
            padding: "14px 24px",
            borderRadius: 6,
            cursor: !isConnected || mode === "demo" ? "not-allowed" : "pointer",
            fontWeight: "bold",
            fontSize: 16
          }}
        >
          {!isConnected 
            ? "Connect Wallet to Submit" 
            : mode === "demo"
              ? "Confirm Delivery (demo — disabled)"
              : isSubmitting 
                ? "Submitting..." 
                : "Confirm Delivery"
          }
        </button>
        
        {mode === "demo" && (
          <p style={{ color: "#fbbf24", fontSize: 12, marginTop: 8 }}>
            Switch to &quot;live&quot; mode to submit on-chain
          </p>
        )}
      </div>

      {/* Result */}
      {result && (
        <div style={{ 
          background: result.success ? "#064e3b" : "#7f1d1d", 
          padding: 16, 
          borderRadius: 8, 
          border: "1px solid",
          borderColor: result.success ? "#22c55e" : "#ef4444"
        }}>
          <h4 style={{ marginTop: 0 }}>
            {result.success ? "✅ Success" : "❌ Failed"}
          </h4>
          <p>{result.message}</p>
          {result.tx_hash && (
            <div style={{ marginTop: 12 }}>
              <p style={{ margin: "4px 0", fontSize: 12, color: "#888" }}>
                Transaction: <code>{result.tx_hash}</code>
              </p>
              <a 
                href={getExplorerUrl(result.tx_hash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3b82f6", fontSize: 12 }}
              >
                View on Explorer →
              </a>
            </div>
          )}
          {result.error && (
            <details style={{ marginTop: 8 }}>
              <summary style={{ color: "#888", fontSize: 12, cursor: "pointer" }}>Technical details</summary>
              <pre style={{ fontSize: 10, color: "#666", marginTop: 8 }}>{result.error}</pre>
            </details>
          )}
        </div>
      )}

      {/* Info */}
      <div style={{ 
        marginTop: 32, 
        padding: 16, 
        background: "#1a1a1a", 
        borderRadius: 8,
        border: "1px solid #333",
        fontSize: 12,
        color: "#888"
      }}>
        <p style={{ margin: "0 0 8px 0" }}>
          <strong>Security Note:</strong> The rider key is restricted to only call 
          <code>confirm_delivery</code>. It cannot move funds or access other deals.
        </p>
        <p style={{ margin: 0 }}>
          Network: {mode === "demo" ? "demo (no blockchain)" : "testnet"} | 
          Contract: trustlock-timi.testnet
        </p>
      </div>
    </main>
  );
}
