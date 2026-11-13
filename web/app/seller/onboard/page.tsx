"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { initNear, getAccountId, signIn } from "@/lib/near";
import { agentUrl } from "@/lib/config";

interface DraftResult {
  draftId: number;
  item: string;
  priceNgn: number;
}

export default function SellerOnboardPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState("");
  const [priceNgn, setPriceNgn] = useState("");
  const [buyerAccount, setBuyerAccount] = useState("");
  const [riderAccount, setRiderAccount] = useState("");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [mode, setMode] = useState<"demo" | "dry" | "live">("demo");
  const [isCreating, setIsCreating] = useState(false);
  const [createdDraft, setCreatedDraft] = useState<DraftResult | null>(null);
  const [shareableLink, setShareableLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      setIsLoading(false);
    });
  }, []);

  async function handleConnect() {
    await signIn();
  }

  async function handleCreateDraft() {
    if (!item.trim() || !priceNgn || !buyerAccount.trim() || !riderAccount.trim() || !accountId || mode === "demo") return;
    const price = parseInt(priceNgn, 10);
    if (!Number.isInteger(price) || price <= 0) {
      setError("Enter a valid price in NGN.");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const res = await fetch(`${agentUrl}/deals/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seller_id: accountId,
          buyer_id: buyerAccount.trim(),
          rider_id: riderAccount.trim(),
          item: item.trim(),
          price_ngn: price,
          deadline_hours: parseInt(deadlineHours, 10),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Draft failed (${res.status})`);
      }
      if (typeof data.deal_id !== "number") {
        throw new Error("Agent did not return a draft id.");
      }
      // No money moves here. The buyer locks funds on the pay page.
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      setShareableLink(`${baseUrl}/pay/${data.deal_id}`);
      setCreatedDraft({ draftId: data.deal_id, item: item.trim(), priceNgn: price });
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to create draft. Is the agent running at ${agentUrl}?`);
    } finally {
      setIsCreating(false);
    }
  }

  async function shareToWhatsApp() {
    const text = `Pay for ${createdDraft?.item} - ₦${createdDraft?.priceNgn}\n\n${shareableLink}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, "_blank");
  }

  async function shareToInstagram() {
    // Instagram doesn't have a direct share URL, copy to clipboard
    await navigator.clipboard.writeText(shareableLink);
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
          onChange={(e) => setMode(e.target.value as "demo" | "dry" | "live")}
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

      {!createdDraft ? (
        /* Draft Creation Form — unsigned. No funds move, no QR secret is made here. */
        <div style={{ background: "#1a1a1a", padding: 24, borderRadius: 8, border: "1px solid #333" }}>
          <h3 style={{ marginTop: 0 }}>What are you selling?</h3>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="ob-item" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Item Name *</label>
            <input
              id="ob-item"
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
            <label htmlFor="ob-price" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Price (₦ NGN) *</label>
            <input
              id="ob-price"
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
              ≈ {(parseInt(priceNgn || "0", 10) / 1000).toFixed(2)} USDC
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="ob-buyer" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Buyer Account *</label>
            <input
              id="ob-buyer"
              type="text"
              value={buyerAccount}
              onChange={(e) => setBuyerAccount(e.target.value)}
              placeholder="e.g., buyer-name.testnet"
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
              The buyer&apos;s NEAR account — only that account can lock funds for this deal.
            </p>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="ob-rider" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Rider Account *</label>
            <input
              id="ob-rider"
              type="text"
              value={riderAccount}
              onChange={(e) => setRiderAccount(e.target.value)}
              placeholder="e.g., rider-name.testnet"
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
              The rider who will scan the delivery code
            </p>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="ob-deadline" style={{ display: "block", marginBottom: 8, fontSize: 14 }}>Delivery Deadline</label>
            <select
              id="ob-deadline"
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

          {error && (
            <p role="alert" style={{ color: "#ef4444", fontSize: 14 }}>{error}</p>
          )}

          <button
            disabled={!isConnected || !item.trim() || !priceNgn || !buyerAccount.trim() || !riderAccount.trim() || mode === "demo" || isCreating}
            onClick={handleCreateDraft}
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
                ? "Create Draft (demo mode — disabled)"
                : isCreating
                  ? "Creating draft..."
                  : "Create Draft & Generate Payment Link"
            }
          </button>

          {mode === "demo" && (
            <p style={{ color: "#fbbf24", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              Switch out of demo mode to create a shareable draft
            </p>
          )}
        </div>
      ) : (
        /* Shareable Link Generated */
        <div>
          <div style={{
            background: "#064e3b",
            padding: 16,
            borderRadius: 8,
            marginBottom: 24,
            border: "1px solid #22c55e"
          }}>
            <h4 style={{ marginTop: 0, color: "#22c55e" }}>✅ Draft Ready!</h4>
            <p><strong>{createdDraft.item}</strong> — ₦{createdDraft.priceNgn.toLocaleString()}</p>
            <p style={{ fontSize: 12, margin: "8px 0 0 0" }}>
              Draft ID: <strong>#{createdDraft.draftId}</strong> (unsigned — no funds moved yet)
            </p>
          </div>

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
          </div>

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
              <li style={{ marginBottom: 8 }}>Buyer clicks link and locks USDC in escrow</li>
              <li style={{ marginBottom: 8 }}>Buyer shows the rider a one-time delivery code</li>
              <li style={{ marginBottom: 8 }}>You deliver the item via rider</li>
              <li>Rider scans the code → You get paid instantly</li>
            </ol>
          </div>

          <div style={{ marginTop: 24, textAlign: "center" }}>
            <button
              onClick={() => {
                setCreatedDraft(null);
                setShareableLink("");
                setError(null);
                setItem("");
                setPriceNgn("");
                setBuyerAccount("");
                setRiderAccount("");
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
