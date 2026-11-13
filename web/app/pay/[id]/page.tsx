"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { contractId, usdcToken, network, agentUrl } from "@/lib/config";
import { initNear, getAccountId, signIn, getDeal, getExplorerUrl, fundDeal, createDeal } from "@/lib/near";
import { SHA256 as sha256 } from "crypto-js";
import Link from "next/link";

// Network badge component - shows actual network from config
function NetworkBadge() {
  const isMainnet = network === "mainnet";
  const isTestnet = network === "testnet";

  return (
    <span style={{
      background: isMainnet ? "#22c55e" : isTestnet ? "#3b82f6" : "#6b7280",
      color: "#000",
      padding: "4px 8px",
      borderRadius: 4,
      fontSize: 12,
      fontWeight: "bold"
    }}>
      {network}
    </span>
  );
}

interface Draft {
  deal_id: number;
  seller_id: string;
  buyer_id: string;
  rider_id: string | null;
  item: string;
  price_ngn: number;
  deadline_hours: number;
  onchain_deal_id: number | null;
  status: string;
}

interface OnchainDeal {
  seller: string;
  rider: string;
  buyer: string;
  item: string;
  price: string;
  status: string;
  deadline_ms?: number;
}

/** 32 random bytes, hex-encoded. The delivery code the buyer shows the rider. */
function newSecretHex(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function secretStorageKey(onchainDealId: number): string {
  return `trustlock:secret:${onchainDealId}`;
}

function readStoredSecret(onchainDealId: number): string | null {
  try {
    return window.localStorage.getItem(secretStorageKey(onchainDealId));
  } catch {
    return null;
  }
}

/** The contract returns the new deal id directly (u64). Anything else is a bug — never guess. */
function parseOnchainDealId(raw: unknown): number {
  const id = typeof raw === "number" ? raw : (raw as { deal_id?: unknown } | null)?.deal_id;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) {
    throw new Error("Contract did not return a deal id — refusing to continue with a guessed id.");
  }
  return id;
}

export default function PayDealPage() {
  const params = useParams();
  const pageId = params.id as string;

  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [legacy, setLegacy] = useState(false);
  const [deal, setDeal] = useState<OnchainDeal | null>(null);
  const [onchainId, setOnchainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [secretRevealed, setSecretRevealed] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  async function loadDealById(onchainDealId: number) {
    const dealData = await getDeal(onchainDealId);
    if (!dealData) {
      throw new Error("Deal not found on-chain.");
    }
    setDeal(dealData as OnchainDeal);
    setOnchainId(onchainDealId);
  }

  async function load() {
    const draftId = parseInt(pageId, 10);
    if (!Number.isInteger(draftId) || draftId < 1) {
      setError("Invalid link. Ask the seller for a fresh payment link.");
      setIsLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await fetch(`${agentUrl}/deals/${draftId}`);
      if (res.status === 404) {
        // Legacy link: /pay?id=<onchain id> shared before drafts existed.
        const onchainData = await getDeal(draftId);
        if (!onchainData) {
          throw new Error("Deal not found. The link may be invalid.");
        }
        setLegacy(true);
        setDeal(onchainData as OnchainDeal);
        setOnchainId(draftId);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || `Draft failed to load (${res.status})`);
      }
      setDraft(data as Draft);
      if (typeof data.onchain_deal_id === "number") {
        await loadDealById(data.onchain_deal_id);
      }
    } catch (e) {
      console.error("Failed to load deal:", e);
      setError(e instanceof Error ? e.message : "Failed to load this deal.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      load().catch((e) => {
        console.error("Failed to load deal:", e);
        setError(e instanceof Error ? e.message : "Failed to load this deal.");
        setIsLoading(false);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // Focus the confirm button when the modal opens; Escape closes it.
  useEffect(() => {
    if (!showConfirmModal) return;
    confirmButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowConfirmModal(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showConfirmModal]);

  async function handleConnect() {
    await signIn();
  }

  /** Buyer creates the on-chain deal from the draft, links it, then funds it. */
  async function handleCreateAndFund() {
    if (!draft || !accountId || isWorking) return;
    if (draft.onchain_deal_id !== null && draft.onchain_deal_id !== undefined) return;
    if (accountId !== draft.buyer_id) return;

    setIsWorking(true);
    setError(null);
    try {
      // The buyer invents the secret here. The contract only ever sees its hash.
      const deliverySecret = newSecretHex();
      const qrHashHex = sha256(deliverySecret).toString();
      const priceUsdc = Math.floor(draft.price_ngn / 1000) * 1000000;
      if (priceUsdc <= 0) {
        throw new Error("Draft price converts to zero USDC.");
      }
      const deadlineMs = Date.now() + draft.deadline_hours * 3600 * 1000;

      const raw = await createDeal(
        draft.seller_id,
        draft.rider_id ?? "",
        accountId,
        draft.item,
        priceUsdc.toString(),
        deadlineMs,
        qrHashHex
      );
      const newOnchainId = parseOnchainDealId(raw);

      const linkRes = await fetch(`${agentUrl}/deals/${draft.deal_id}/onchain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onchain_deal_id: newOnchainId }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) {
        throw new Error(linkData?.message || linkData?.error || `Draft link failed (${linkRes.status})`);
      }

      const fundResult = await fundDeal(newOnchainId, priceUsdc.toString(), usdcToken);
      setTxHash(fundResult.transaction.hash as string);

      try {
        window.localStorage.setItem(secretStorageKey(newOnchainId), deliverySecret);
      } catch {
        // Storage throwing must be visible, not silent.
        setError("Funds locked, but this browser refused to save the delivery code. Copy it now — it is shown once.");
      }
      setSecret(deliverySecret);
      setSecretRevealed(true);
      setDraft(linkData as Draft);
      await loadDealById(newOnchainId);
    } catch (e) {
      console.error("Create and fund failed:", e);
      alert("Failed to lock funds: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsWorking(false);
    }
  }

  /** Fund an already-created on-chain deal: legacy links, or a retry after a failed funding tx. */
  async function handleFundExisting() {
    if (!deal || onchainId === null || !accountId || isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const fundResult = await fundDeal(onchainId, deal.price.toString(), usdcToken);
      setTxHash(fundResult.transaction.hash as string);
      await loadDealById(onchainId);
    } catch (e) {
      console.error("Fund deal failed:", e);
      alert("Failed to fund deal: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsWorking(false);
    }
  }

  async function handleConfirmReceipt() {
    if (!deal || onchainId === null || !accountId) return;
    setIsConfirming(true);
    setError(null);
    try {
      const { initNear } = await import("@/lib/near");
      const { wallet } = await initNear();
      if (!wallet) throw new Error("Wallet not initialized");

      const result = await wallet.account().functionCall({
        contractId: contractId,
        methodName: "confirm_receipt",
        args: { deal_id: onchainId },
        gas: BigInt("50000000000000"), // 50 Tgas
        attachedDeposit: BigInt(0)
      });

      setTxHash(result.transaction.hash as string);
      await loadDealById(onchainId);
    } catch (e) {
      console.error("Confirm receipt failed:", e);
      alert("Failed to confirm receipt: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsConfirming(false);
      setShowConfirmModal(false);
    }
  }

  const isConnected = !!accountId;
  const buyerMismatch =
    draft !== null && !legacy && isConnected && accountId !== draft.buyer_id;
  const storedSecret =
    onchainId !== null && deal?.status === "Funded" && !secret
      ? readStoredSecret(onchainId)
      : null;
  const visibleSecret = secret ?? (secretRevealed ? storedSecret : null);
  const canCreateAndFund =
    draft !== null && !legacy && draft.onchain_deal_id == null && !buyerMismatch;

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
        <h1 style={{ margin: 0 }}>Deal #{onchainId ?? pageId}</h1>
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
            <NetworkBadge />
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

      {error && (
        <div style={{
          background: "#1a1a1a",
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
          border: "1px solid #ef4444"
        }}>
          <p role="alert" style={{ color: "#ef4444", margin: 0 }}>{error}</p>
        </div>
      )}

      {buyerMismatch && draft && (
        <div style={{
          background: "#1a1a1a",
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
          border: "1px solid #fbbf24"
        }}>
          <p role="alert" style={{ color: "#fbbf24", margin: 0 }}>
            This link names <strong>{draft.buyer_id}</strong> as buyer, but you connected
            as <strong>{accountId}</strong>. Connect with the named buyer wallet to continue.
          </p>
        </div>
      )}

      {/* Deal Details */}
      {deal ? (
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
              <span>{(Number(deal.price) / 1000000).toFixed(2)} USDC</span>
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

          {deal.status === "Created" && !canCreateAndFund && onchainId !== null && (legacy || (draft !== null && draft.onchain_deal_id != null)) ? (
            <button
              disabled={!isConnected || isWorking}
              onClick={handleFundExisting}
              style={{
                width: "100%",
                background: !isConnected ? "#444" : "#22c55e",
                color: "#fff",
                border: "none",
                padding: "14px 24px",
                borderRadius: 6,
                cursor: !isConnected || isWorking ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: 16
              }}
            >
              {!isConnected
                ? "Connect Wallet to Fund"
                : isWorking
                  ? "Locking USDC..."
                  : "🔒 Lock Funds in Escrow"
              }
            </button>
          ) : null}

          {canCreateAndFund && (
            <button
              disabled={!isConnected || isWorking}
              onClick={handleCreateAndFund}
              style={{
                width: "100%",
                background: !isConnected ? "#444" : "#22c55e",
                color: "#fff",
                border: "none",
                padding: "14px 24px",
                borderRadius: 6,
                cursor: !isConnected || isWorking ? "not-allowed" : "pointer",
                fontWeight: "bold",
                fontSize: 16
              }}
            >
              {!isConnected
                ? "Connect Wallet to Fund"
                : isWorking
                  ? "Locking USDC..."
                  : "🔒 Lock Funds in Escrow"
              }
            </button>
          )}

          {deal.status === "Funded" ? (
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

              {/* Delivery code: generated on this device, shown once, re-openable here. */}
              {visibleSecret ? (
                <div style={{
                  background: "#111",
                  padding: 16,
                  borderRadius: 6,
                  marginBottom: 16,
                  border: "1px solid #fbbf24",
                  textAlign: "center"
                }}>
                  <p style={{ color: "#fbbf24", fontSize: 14, marginTop: 0 }}>
                    Your one-time delivery code — show it to the rider, no one else:
                  </p>
                  <code style={{ fontSize: 16, wordBreak: "break-all" }}>{visibleSecret}</code>
                  <div>
                    <button
                      onClick={() => navigator.clipboard.writeText(visibleSecret)}
                      style={{
                        marginTop: 12,
                        background: "#3b82f6",
                        color: "#fff",
                        border: "none",
                        padding: "10px 20px",
                        borderRadius: 6,
                        cursor: "pointer",
                        fontWeight: "bold"
                      }}
                    >
                      📋 Copy Code
                    </button>
                  </div>
                </div>
              ) : storedSecret ? (
                <button
                  onClick={() => setSecretRevealed(true)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    color: "#fbbf24",
                    border: "1px solid #fbbf24",
                    padding: "12px 24px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontWeight: "bold",
                    fontSize: 14,
                    marginBottom: 16
                  }}
                >
                  Show my delivery code
                </button>
              ) : (
                <p style={{ color: "#888", textAlign: "center", fontSize: 14 }}>
                  The delivery code lives in the buyer&apos;s browser. Funded on this device? It is shown above.
                </p>
              )}

              {isConnected && accountId === deal.buyer && (
                <button
                  disabled={isConfirming}
                  onClick={() => setShowConfirmModal(true)}
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

              {(!isConnected || accountId !== deal.buyer) && (
                <p style={{ color: "#888", textAlign: "center", fontSize: 14 }}>
                  Waiting for buyer to confirm receipt or rider to scan the code
                </p>
              )}
            </div>
          ) : null}

          {deal.status !== "Created" && deal.status !== "Funded" ? (
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
          ) : null}
        </div>
      ) : !error ? (
        <p>Loading deal...</p>
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

      {/* Confirm modal — releasing funds cannot be undone. */}
      {showConfirmModal && (
        <div
          role="presentation"
          onClick={() => setShowConfirmModal(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-release-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#1a1a1a",
              padding: 24,
              borderRadius: 8,
              border: "1px solid #ef4444",
              maxWidth: 440,
              width: "100%"
            }}
          >
            <h3 id="confirm-release-title" style={{ marginTop: 0 }}>Release funds?</h3>
            <p style={{ color: "#ccc", fontSize: 14 }}>
              This sends the locked USDC to the seller and <strong>cannot be undone</strong>.
              Only confirm if you have received the item.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid #555",
                  padding: "12px 16px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Cancel
              </button>
              <button
                ref={confirmButtonRef}
                onClick={handleConfirmReceipt}
                disabled={isConfirming}
                style={{
                  flex: 1,
                  background: isConfirming ? "#444" : "#ef4444",
                  color: "#fff",
                  border: "none",
                  padding: "12px 16px",
                  borderRadius: 6,
                  cursor: isConfirming ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                {isConfirming ? "Releasing..." : "Yes, release funds"}
              </button>
            </div>
          </div>
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
