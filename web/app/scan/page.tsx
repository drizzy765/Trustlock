"use client";

import { useWallet } from "@/lib/wallet-provider";
import { useState } from "react";

export default function ScanPage() {
  const { accountId, isConnected, showModal } = useWallet();
  const [qrInput, setQrInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<"demo" | "dry" | "live">("demo");

  async function handleSubmit() {
    if (!qrInput.trim()) return;
    
    setIsSubmitting(true);
    
    // Simulate the contract call
    try {
      // In real implementation, this would call confirm_delivery on the contract
      // const tx = await contract.confirm_delivery({
      //   deal_id: dealId,
      //   qr_preimage_hex: qrInput
      // });
      
      // Simulate response
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setResult({
        success: true,
        message: "Delivery confirmed!",
        tx_hash: "ABCDEF123456...",
        mode: mode,
      });
    } catch (e) {
      setResult({
        success: false,
        message: "Failed to confirm delivery. QR may be invalid or already used.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Rider — Confirm Delivery</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#888" }}>Mode:</span>
          <select 
            value={mode} 
            onChange={(e) => setMode(e.target.value as any)}
            style={{ 
              padding: "4px 8px", 
              background: "#1a1a1a", 
              color: "#fff", 
              border: "1px solid #333",
              borderRadius: 4
            }}
          >
            <option value="demo">demo</option>
            <option value="dry">dry</option>
            <option value="live">live</option>
          </select>
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
        {isConnected ? (
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
            onClick={showModal}
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
          disabled={!qrInput.trim() || isSubmitting || !isConnected || mode === "demo"}
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
            Switch to &quot;dry&quot; or &quot;live&quot; mode to enable on-chain submission
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
                href={`https://testnet.nearblocks.io/txns/${result.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3b82f6", fontSize: 12 }}
              >
                View on Explorer →
              </a>
            </div>
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
          Contract: trustlock.testnet
        </p>
      </div>
    </main>
  );
}
