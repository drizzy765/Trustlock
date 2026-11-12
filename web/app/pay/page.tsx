"use client";

import { useWallet } from "@/lib/wallet-provider";
import { agentUrl } from "@/lib/config";
import { useState } from "react";

export default function PayPage() {
  const { accountId, isConnected, isLoading, showModal } = useWallet();
  const [dealText, setDealText] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [mode, setMode] = useState<"demo" | "dry" | "live">("demo");

  async function handlePreview() {
    if (!dealText.trim()) return;
    
    setIsPreviewLoading(true);
    try {
      const res = await fetch(`${agentUrl}/deals/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: dealText, language_hint: "pcm" }),
      });
      const data = await res.json();
      setPreview(data);
    } catch (e) {
      console.error("Preview failed:", e);
    } finally {
      setIsPreviewLoading(false);
    }
  }

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Buyer — Lock Funds</h1>
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
        {isLoading ? (
          <p>Loading wallet...</p>
        ) : isConnected ? (
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
            Connect NEAR Wallet
          </button>
        )}
      </div>

      {/* Deal Preview */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>Describe your deal</h3>
        <p style={{ color: "#888", fontSize: 14 }}>
          Example: &quot;abeg hold 2k5 for the black sandal, deliver tomorrow&quot;
        </p>
        <textarea
          value={dealText}
          onChange={(e) => setDealText(e.target.value)}
          placeholder="Enter deal details..."
          rows={3}
          style={{
            width: "100%",
            padding: 12,
            background: "#1a1a1a",
            color: "#fff",
            border: "1px solid #333",
            borderRadius: 6,
            fontFamily: "inherit",
            fontSize: 14,
            resize: "vertical"
          }}
        />
        <button
          onClick={handlePreview}
          disabled={!dealText.trim() || isPreviewLoading}
          style={{
            marginTop: 12,
            background: isPreviewLoading ? "#444" : "#3b82f6",
            color: "#fff",
            border: "none",
            padding: "10px 20px",
            borderRadius: 6,
            cursor: isPreviewLoading ? "not-allowed" : "pointer",
            fontWeight: "bold"
          }}
        >
          {isPreviewLoading ? "Analyzing..." : "Preview Terms"}
        </button>
      </div>

      {/* Preview Result */}
      {preview && (
        <div style={{ 
          background: "#1a1a1a", 
          padding: 16, 
          borderRadius: 8, 
          marginBottom: 24,
          border: "1px solid #333"
        }}>
          <h4 style={{ marginTop: 0 }}>Parsed Terms</h4>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Item:</span>
              <span>{preview.item}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Price:</span>
              <span>₦{preview.price_ngn?.toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Deadline:</span>
              <span>{preview.deadline_hours} hours</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#888" }}>Language:</span>
              <span style={{ textTransform: "uppercase" }}>{preview.language}</span>
            </div>
          </div>
          
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #333" }}>
            <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
              Status: <span style={{ color: "#fbbf24" }}>Preview only</span>. 
              Connect wallet and click &quot;Lock Funds&quot; to create the deal on-chain.
            </p>
          </div>

          <button
            disabled={!isConnected || mode === "demo"}
            onClick={() => alert("This would call ft_on_transfer to fund the deal on-chain")}
            style={{
              marginTop: 16,
              width: "100%",
              background: !isConnected ? "#444" : mode === "demo" ? "#854d0e" : "#22c55e",
              color: "#fff",
              border: "none",
              padding: "14px 24px",
              borderRadius: 6,
              cursor: !isConnected ? "not-allowed" : "pointer",
              fontWeight: "bold",
              fontSize: 16
            }}
          >
            {!isConnected 
              ? "Connect Wallet to Lock Funds" 
              : mode === "demo" 
                ? "Lock Funds (demo mode — disabled)" 
                : "Lock Funds on NEAR"
            }
          </button>
        </div>
      )}

      {/* Mode Badges */}
      <div style={{ 
        marginTop: 32, 
        padding: 16, 
        background: "#1a1a1a", 
        borderRadius: 8,
        border: "1px solid #333",
        fontSize: 12,
        color: "#888"
      }}>
        <strong>Network:</strong> {mode === "demo" ? "demo (no blockchain)" : "testnet"} | 
        <strong> Contract:</strong> trustlock.testnet | 
        <strong> Agent:</strong> {agentUrl}
      </div>
    </main>
  );
}
