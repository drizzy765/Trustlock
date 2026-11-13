"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { initNear, isSignedIn, getAccountId, signIn, createDeal, getExplorerUrl } from "@/lib/near";
import { agentUrl } from "@/lib/config";
import { SHA256 as sha256 } from "crypto-js";

export default function SellerOnboardPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState("");
  const [priceNgn, setPriceNgn] = useState("");
  const [description, setDescription] = useState("");
  const [riderAccount, setRiderAccount] = useState("rider-timi.testnet");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [isCreating, setIsCreating] = useState(false);
  const [createdDeal, setCreatedDeal] = useState<any>(null);
  const [shareableLink, setShareableLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [mode, setMode] = useState<"demo" | "dry" | "live">("demo");

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      setIsLoading(false);
    });
  }, []);

  async function handleConnect() {
    await signIn();
  }

  async function handleCreateDeal() {
    if (!item || !priceNgn || !accountId || mode === "demo") return;

    setIsCreating(true);
    try {
      // Generate QR data (buyer will receive this)
      const qrData = `${accountId}:${Date.now()}:${Math.random()}`;
      const qrHashHex = sha256(qrData).toString();
      
      // Calculate deadline
      const deadlineMs = Date.now() + parseInt(deadlineHours) * 60 * 60 * 1000;
      
      // Convert NGN to USDC (1 USDC = 1000 NGN for demo)
      const priceUsdc = Math.floor((parseInt(priceNgn) / 1000) * 1000000).toString();
      
      const buyerAccount = "buyer-timi.testnet"; // For testing
      
      const result = await createDeal(
        accountId, // seller
        riderAccount,
        buyerAccount,
        item,
        priceUsdc,
        deadlineMs,
        qrHashHex
      );

      const dealId = result.deal_id || 1;
      
      // Store QR data for later
      localStorage.setItem(`deal_qr_${dealId}`, qrData);
      
      // Generate shareable link
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const link = `${baseUrl}/pay?id=${dealId}&seller=${accountId}&item=${encodeURIComponent(item)}&price=${priceNgn}`;
      
      setCreatedDeal({
        dealId,
        item,
        priceNgn,
        priceUsdc: (parseInt(priceNgn) / 1000).toFixed(2),
        txHash: result.transaction.hash,
        qrData,
      });
      
      setShareableLink(link);
      
      // Generate simple QR code (in production, use a library)
      setQrCode(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`);
      
    } catch (e) {
      console.error("Create deal failed:", e);
      alert("Failed to create deal: " + (e as Error).message);
    } finally {
      setIsCreating(false);
    }
  }

  async function shareToWhatsApp() {
    const text = `Pay for ${item} - ₦${priceNgn}\n\n${shareableLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  }

  async function shareToInstagram() {
    // Instagram doesn't have a direct share URL, copy to clipboard
    navigator.clipboard.writeText(shareableLink);
    alert("Link copied to clipboard! Paste in Instagram DM.");
  }

  const isConnected = !!accountId;

  return (
    <main style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Seller — Create Deal</h1>
        <Link href="/" style={{ color: "#3b82f6", textDecoration: "none" }}>
          ← Back to Home
        </Link>
      </div>

      {/* Mode Selector */}
      <div style={{ marginBottom: 24, display: "flex", gap: 8, alignItems: "center", justifyContent: "flex-end" }}>
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
            <span>Seller Account: <strong>{accountId}</strong></span>
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
              fontSize: 14,
              width: "100%"
            }}
          >
            Connect Seller Wallet
          </button>
        )}
      </div>

      {!createdDeal ? (
        /* Deal Creation Form */
        <div style={{ background: "#1a1a1a", padding: 24, borderRadius: 8, border: "1px solid #333" }}>
          <h3 style={{ marginTop: 0 }}>What are you selling?</h3>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Item Name *</label>
            <input
              type="text"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              placeholder="e.g., Black Sandals"
              style={{
                width: "100%",
                padding: 12,
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 14
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Price (₦ NGN) *</label>
            <input
              type="number"
              value={priceNgn}
              onChange={(e) => setPriceNgn(e.target.value)}
              placeholder="e.g., 2500"
              style={{
                width: "100%",
                padding: 12,
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 14
              }}
            />
            <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0 0" }}>
              ≈ {(parseInt(priceNgn || "0") / 1000).toFixed(2)} USDC
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Size, color, delivery instructions..."
              rows={3}
              style={{
                width: "100%",
                padding: 12,
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 14,
                resize: "vertical"
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Rider Account *</label>
            <input
              type="text"
              value={riderAccount}
              onChange={(e) => setRiderAccount(e.target.value)}
              placeholder="e.g., rider-timi.testnet"
              style={{
                width: "100%",
                padding: 12,
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 14
              }}
            />
            <p style={{ fontSize: 12, color: "#888", margin: "4px 0 0 0" }}>
              The rider who will scan the delivery QR
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Delivery Deadline</label>
            <select
              value={deadlineHours}
              onChange={(e) => setDeadlineHours(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                background: "#111",
                color: "#fff",
                border: "1px solid #333",
                borderRadius: 6,
                fontSize: 14
              }}
            >
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
              <option value="72">72 hours</option>
              <option value="168">1 week</option>
            </select>
          </div>

          <button
            disabled={!isConnected || !item || !priceNgn || mode === "demo" || isCreating}
            onClick={handleCreateDeal}
            style={{
              width: "100%",
              background: !isConnected || mode === "demo" ? "#444" : "#22c55e",
              color: "#fff",
              border: "none",
              padding: "14px 24px",
              borderRadius: 6,
              cursor: !isConnected || isCreating ? "not-allowed" : "pointer",
              fontWeight: "bold",
              fontSize: 16
            }}
          >
            {!isConnected 
              ? "Connect Wallet First" 
              : mode === "demo"
                ? "Create Deal (demo mode — disabled)"
                : isCreating
                  ? "Creating on NEAR..."
                  : "Create Deal & Generate Payment Link"
            }
          </button>

          {mode === "demo" && (
            <p style={{ color: "#fbbf24", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              Switch to "live" mode to create a real deal on testnet
            </p>
          )}
        </div>
      ) : (
        /* Shareable Link Generated */
        <div>
          {/* Success Message */}
          <div style={{ 
            background: "#064e3b", 
            padding: 16, 
            borderRadius: 8, 
            marginBottom: 24,
            border: "1px solid #22c55e"
          }}>
            <h4 style={{ marginTop: 0, color: "#22c55e" }}>✅ Deal Created!</h4>
            <p><strong>{createdDeal.item}</strong> — ₦{createdDeal.priceNgn} ({createdDeal.priceUsdc} USDC)</p>
            <p style={{ fontSize: 12, margin: "8px 0 0 0" }}>
              Deal ID: <strong>#{createdDeal.dealId}</strong> | 
              <a 
                href={getExplorerUrl(createdDeal.txHash)}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#3b82f6", marginLeft: 8 }}
              >
                View on Explorer →
              </a>
            </p>
          </div>

          {/* Shareable Link */}
          <div style={{ 
            background: "#1a1a1a", 
            padding: 24, 
            borderRadius: 8, 
            marginBottom: 24,
            border: "1px solid #333",
            textAlign: "center"
          }}>
            <h3 style={{ marginTop: 0 }}>Share this link with your buyer</h3>
            
            <div style={{ 
              background: "#111", 
              padding: 12, 
              borderRadius: 6, 
              marginBottom: 16,
              wordBreak: "break-all",
              fontSize: 14,
              fontFamily: "monospace"
            }}>
              {shareableLink}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              <button
                onClick={() => navigator.clipboard.writeText(shareableLink)}
                style={{
                  background: "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                📋 Copy Link
              </button>
              <button
                onClick={shareToWhatsApp}
                style={{
                  background: "#22c55e",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                WhatsApp
              </button>
              <button
                onClick={shareToInstagram}
                style={{
                  background: "#ec4899",
                  color: "#fff",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Instagram
              </button>
            </div>

            {/* QR Code */}
            {qrCode && (
              <div>
                <p style={{ fontSize: 14, color: "#888", marginBottom: 8 }}>Or scan this QR code:</p>
                <img 
                  src={qrCode} 
                  alt="Payment QR Code" 
                  style={{ maxWidth: 200, borderRadius: 8 }}
                />
              </div>
            )}
          </div>

          {/* Instructions */}
          <div style={{ 
            background: "#1a1a1a", 
            padding: 16, 
            borderRadius: 8,
            border: "1px solid #333",
            fontSize: 14
          }}>
            <h4 style={{ marginTop: 0 }}>What happens next?</h4>
            <ol style={{ margin: 0, paddingLeft: 20, color: "#888" }}>
              <li style={{ marginBottom: 8 }}>Share the link with your buyer via WhatsApp/Instagram</li>
              <li style={{ marginBottom: 8 }}>Buyer clicks link and pays with USDC</li>
              <li style={{ marginBottom: 8 }}>Funds are locked in escrow</li>
              <li style={{ marginBottom: 8 }}>You deliver the item via rider</li>
              <li>Rider scans QR → You get paid instantly</li>
            </ol>
          </div>

          {/* Create Another */}
          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              onClick={() => {
                setCreatedDeal(null);
                setShareableLink("");
                setQrCode("");
                setItem("");
                setPriceNgn("");
              }}
              style={{
                background: "transparent",
                color: "#3b82f6",
                border: "1px solid #3b82f6",
                padding: "10px 20px",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Create Another Deal →
            </button>
          </div>
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
        <strong>TrustLock</strong> — Pay on delivery for African social commerce. 
        The rider scan releases funds, not an AI opinion.
      </div>
    </main>
  );
}
