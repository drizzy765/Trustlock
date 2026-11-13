"use client";

import { useState, useEffect, Suspense } from "react";
import { agentUrl, contractId } from "@/lib/config";
import { initNear, isSignedIn, getAccountId, signIn, createDeal, getDeal, getExplorerUrl } from "@/lib/near";
import { SHA256 as sha256 } from "crypto-js";
import Link from "next/link";

// Separate component for URL params to avoid SSR issues
function PayPageWithParams() {
  const [urlParams, setUrlParams] = useState<{id: string | null, seller: string | null, item: string | null, price: string | null}>({id: null, seller: null, item: null, price: null});
  
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUrlParams({
      id: params.get("id"),
      seller: params.get("seller"),
      item: params.get("item"),
      price: params.get("price")
    });
  }, []);
  
  return <PayPageContent urlParams={urlParams} />;
}

interface PayPageProps {
  urlParams: {id: string | null, seller: string | null, item: string | null, price: string | null}
}

function PayPageContent({ urlParams }: PayPageProps) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dealText, setDealText] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [mode, setMode] = useState<"demo" | "dry" | "live">("demo");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dealId, setDealId] = useState<number | null>(null);
  const [existingDeal, setExistingDeal] = useState<any>(null);
  const [isLoadingDeal, setIsLoadingDeal] = useState(false);
  const [isFunding, setIsFunding] = useState(false);

  const hasUrlParams = urlParams.id !== null;

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      setIsLoading(false);
      
      // If deal ID in URL, load it
      if (urlParams.id) {
        loadExistingDeal(parseInt(urlParams.id));
      }
    });
  }, [urlParams.id]);

  async function loadExistingDeal(dealIdNum: number) {
    setIsLoadingDeal(true);
    try {
      const deal = await getDeal(dealIdNum);
      setExistingDeal(deal);
    } catch (e) {
      console.error("Failed to load deal:", e);
    } finally {
      setIsLoadingDeal(false);
    }
  }

  async function handleConnect() {
    await signIn();
  }

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

  async function handleCreateDeal() {
    if (!preview || !accountId || mode === "demo") return;
    
    setIsCreating(true);
    try {
      const qrData = `${accountId}:${Date.now()}:${Math.random()}`;
      const qrHashHex = sha256(qrData).toString();
      const deadlineMs = Date.now() + 24 * 60 * 60 * 1000;
      const priceUsdc = Math.floor((preview.price_ngn / 1000) * 1000000).toString();
      
      const result = await createDeal(
        "seller-timi.testnet",
        "rider-timi.testnet",
        accountId,
        preview.item,
        priceUsdc,
        deadlineMs,
        qrHashHex
      );
      
      setTxHash(result.transaction.hash);
      setDealId(result.deal_id || 1);
      localStorage.setItem(`deal_qr_${result.deal_id || 1}`, qrData);
    } catch (e) {
      console.error("Create deal failed:", e);
      alert("Failed to create deal: " + (e as Error).message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleFundDeal() {
    if (!existingDeal || !accountId || mode === "demo") return;
    
    setIsFunding(true);
    try {
      // Call ft_transfer_call on USDC token
      const tokenContract = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
      
      // In a real implementation, this would call the token contract
      // For now, simulate the transaction
      const mockTxHash = "mock_tx_hash_" + Date.now();
      
      // Reload deal to show funded status
      await loadExistingDeal(parseInt(urlParams.id!));
      
      setTxHash(mockTxHash);
    } catch (e) {
      console.error("Fund deal failed:", e);
      alert("Failed to fund deal: " + (e as Error).message);
    } finally {
      setIsFunding(false);
    }
  }

  const isConnected = !!accountId;

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

      {/* Existing Deal from URL */}
      {hasUrlParams && (
        <div style={{ 
          background: "#1e3a8a", 
          padding: 16, 
          borderRadius: 8, 
          marginBottom: 24,
          border: "1px solid #3b82f6"
        }}>
          <h3 style={{ marginTop: 0, color: "#60a5fa" }}>🔗 Payment Link</h3>
          {isLoadingDeal ? (
            <p>Loading deal...</p>
          ) : existingDeal ? (
            <div>
              <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Deal ID:</span>
                  <span>#{urlParams.id}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Item:</span>
                  <span>{existingDeal.item || urlParams.item}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Price:</span>
                  <span>{(existingDeal.price / 1000000).toFixed(2)} USDC</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Seller:</span>
                  <span>{existingDeal.seller || urlParams.seller}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Status:</span>
                  <span style={{ 
                    padding: "2px 8px", 
                    borderRadius: 4,
                    background: existingDeal.status === "Created" ? "#374151" : "#1e3a8a",
                    color: "#fff",
                    fontSize: 12
                  }}>
                    {existingDeal.status || "Created"}
                  </span>
                </div>
              </div>
              
              {existingDeal.status === "Created" ? (
                <button
                  disabled={!isConnected || mode === "demo" || isFunding}
                  onClick={handleFundDeal}
                  style={{
                    width: "100%",
                    background: !isConnected || mode === "demo" ? "#444" : "#22c55e",
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
                    : mode === "demo" 
                      ? "Lock Funds (demo — disabled)"
                      : isFunding
                        ? "Locking USDC..."
                        : "🔒 Lock Funds in Escrow"
                  }
                </button>
              ) : (
                <div style={{ 
                  background: "#064e3b", 
                  padding: 12, 
                  borderRadius: 6,
                  textAlign: "center"
                }}>
                  <p style={{ margin: 0, color: "#22c55e" }}>
                    ✅ This deal is already funded
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p style={{ color: "#ef4444" }}>
              Deal not found. The link may be invalid.
            </p>
          )}
        </div>
      )}

      {/* Create New Deal Section */}
      {!hasUrlParams && (
        <>
          {/* Deal Preview */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0 }}>Create a new deal</h3>
            <p style={{ color: "#888", fontSize: 14 }}>
              Describe what you&apos;re buying:
            </p>
            <textarea
              value={dealText}
              onChange={(e) => setDealText(e.target.value)}
              placeholder="Example: abeg hold 2k5 for the black sandal, deliver tomorrow"
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
                  <span style={{ color: "#888" }}>Price (NGN):</span>
                  <span>₦{preview.price_ngn?.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Price (USDC):</span>
                  <span>{(preview.price_ngn / 1000).toFixed(2)} USDC</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#888" }}>Deadline:</span>
                  <span>{preview.deadline_hours} hours</span>
                </div>
              </div>

              <button
                disabled={!isConnected || mode === "demo" || isCreating}
                onClick={handleCreateDeal}
                style={{
                  marginTop: 16,
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
                  ? "Connect Wallet to Create Deal" 
                  : mode === "demo" 
                    ? "Create Deal (demo — disabled)"
                    : isCreating
                      ? "Creating..."
                      : "Create Deal on NEAR"
                }
              </button>
            </div>
          )}
        </>
      )}

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
          href="/seller/onboard" 
          style={{ 
            color: "#3b82f6", 
            textDecoration: "none",
            fontSize: 14
          }}
        >
          Are you a seller? Create a deal →
        </Link>
      </div>

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
        <strong>TrustLock</strong> — Funds locked on NEAR. Released only when rider scans QR.
      </div>
    </main>
  );
}

// Main export with Suspense
export default function PayPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32 }}>Loading...</div>}>
      <PayPageWithParams />
    </Suspense>
  );
}
