"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { contractId, usdcToken, network, agentUrl } from "@/lib/config";
import { initNear, getAccountId, signIn, getDeal, getExplorerUrl, fundDeal, createDeal } from "@/lib/near";
import { fetchHealth, fetchQuote, displayMode, assetLabel, shortQuoteId, verifiedAmount, isQuoteExpired, quoteDeadlineMs, type Mode, type Quote } from "@/lib/quote";
import ModeBadge from "@/components/ModeBadge";
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
  agent_metadata?: { intents_quote: Quote | null };
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

/** Pre-create key: written BEFORE create_deal so a wallet redirect can never strand the secret. */
function draftSecretKey(draftId: number): string {
  return `trustlock:secret:draft:${draftId}`;
}

function pendingKey(draftId: number): string {
  return `trustlock:pending:${draftId}`;
}

interface PendingAttempt {
  secret: string;
  priceUsdc: number;
  deadlineMs: number;
  onchainId?: number;
}

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function clearKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage already unavailable — nothing to clear */
  }
}

function readPending(draftId: number): PendingAttempt | null {
  const raw = readKey(pendingKey(draftId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingAttempt>;
    if (typeof parsed.secret !== "string" || !/^[0-9a-f]{64}$/.test(parsed.secret)) return null;
    return {
      secret: parsed.secret,
      priceUsdc: typeof parsed.priceUsdc === "number" ? parsed.priceUsdc : 0,
      deadlineMs: typeof parsed.deadlineMs === "number" ? parsed.deadlineMs : 0,
      onchainId: typeof parsed.onchainId === "number" ? parsed.onchainId : undefined,
    };
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
  const [pending, setPending] = useState<PendingAttempt | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [agentMode, setAgentMode] = useState<Mode>("demo");
  const [quoteNow, setQuoteNow] = useState(() => Date.now());
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  /** Fetch a fresh verified quote for this draft. Amounts render only on success. */
  async function loadQuote(dealId: number) {
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      setQuote(await fetchQuote(dealId));
    } catch (e) {
      setQuote(null);
      setQuoteError(e instanceof Error ? e.message : "Quote unavailable.");
    } finally {
      setQuoteLoading(false);
    }
  }

  async function loadDealById(onchainDealId: number) {
    const dealData = await getDeal(onchainDealId);
    if (!dealData) {
      throw new Error("Deal not found on-chain.");
    }
    setDeal(dealData as OnchainDeal);
    setOnchainId(onchainDealId);
    if ((dealData as OnchainDeal).status === "Funded") {
      // Funded means the flow finished — drop any stale resume record (keep the secret).
      const id = parseInt(pageId, 10);
      if (Number.isInteger(id)) {
        clearKey(pendingKey(id));
        setPending(null);
      }
    }
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
      setPending(readPending(data.deal_id));
      const storedQuote = (data as Draft).agent_metadata?.intents_quote ?? null;
      if (storedQuote?.signature_verified && !isQuoteExpired(storedQuote)) {
        // Reuse only an unexpired quote; it carries a quote id, never a tx hash.
        setQuote(storedQuote);
        setQuoteError(null);
      } else {
        void loadQuote(data.deal_id);
      }
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

  // The badge follows the backend, never a user choice. No dropdown can select live.
  useEffect(() => {
    fetchHealth().then((health) => {
      if (health?.intents_mode) setAgentMode(health.intents_mode);
    });
  }, []);

  // Re-render when the displayed quote reaches its deadline.
  useEffect(() => {
    setQuoteNow(Date.now());

    if (!quote?.signature_verified) return;

    const deadline = quoteDeadlineMs(quote);
    if (deadline === null) return;

    const remaining = deadline - Date.now();
    if (remaining <= 0) return;

    const timer = window.setTimeout(() => setQuoteNow(Date.now()), remaining + 1);
    return () => window.clearTimeout(timer);
  }, [quote]);

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

  /** Create the on-chain deal. The secret is persisted BEFORE this runs. */
  async function createOnchainDeal(deliverySecret: string, priceUsdc: number, deadlineMs: number): Promise<number> {
    if (!draft || !accountId) throw new Error("Deal draft missing.");
    const qrHashHex = sha256(deliverySecret).toString();
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
    // Record the id immediately: a redirect during funding must be resumable.
    writeKey(secretStorageKey(newOnchainId), deliverySecret);
    writeKey(pendingKey(draft.deal_id), JSON.stringify({ secret: deliverySecret, priceUsdc, deadlineMs, onchainId: newOnchainId }));
    setPending(readPending(draft.deal_id));
    return newOnchainId;
  }

  /** Link the draft to its on-chain deal, then fund it. */
  async function linkAndFund(draftId: number, newOnchainId: number, priceUsdc: number): Promise<void> {
    const linkRes = await fetch(`${agentUrl}/deals/${draftId}/onchain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onchain_deal_id: newOnchainId }),
    });
    const linkData = await linkRes.json();
    if (!linkRes.ok) {
      if (linkData?.error === "ERR_ALREADY_LINKED") {
        // A redirect landed the link already — reload instead of failing.
        await load();
        return;
      }
      throw new Error(linkData?.message || linkData?.error || `Draft link failed (${linkRes.status})`);
    }
    setDraft(linkData as Draft);

    const fundResult = await fundDeal(newOnchainId, priceUsdc.toString(), usdcToken);
    setTxHash(fundResult.transaction.hash as string);
    await loadDealById(newOnchainId);
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
      const priceUsdc = Math.round(draft.price_ngn * 1000);
      if (priceUsdc <= 0) {
        throw new Error("Draft price converts to zero USDC.");
      }
      const deadlineMs = Date.now() + draft.deadline_hours * 3600 * 1000;

      // Persist BEFORE any wallet redirect: a reload must find the secret, never re-roll it.
      if (!writeKey(draftSecretKey(draft.deal_id), deliverySecret)) {
        throw new Error("This browser refused to save the delivery code. Without storage a wallet redirect would strand the secret — enable it and retry.");
      }
      writeKey(pendingKey(draft.deal_id), JSON.stringify({ secret: deliverySecret, priceUsdc, deadlineMs }));

      const newOnchainId = await createOnchainDeal(deliverySecret, priceUsdc, deadlineMs);
      await linkAndFund(draft.deal_id, newOnchainId, priceUsdc);
      clearKey(pendingKey(draft.deal_id));
      setPending(null);
      setSecret(deliverySecret);
      setSecretRevealed(true);
    } catch (e) {
      console.error("Create and fund failed:", e);
      alert("Failed to lock funds: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsWorking(false);
    }
  }

  /** Resume after a redirect that landed between create and fund. */
  async function handleResumeFunding() {
    if (!draft || !pending?.onchainId || isWorking) return;
    setIsWorking(true);
    setError(null);
    try {
      const priceUsdc = pending.priceUsdc > 0 ? pending.priceUsdc : Math.round(draft.price_ngn * 1000);
      await linkAndFund(draft.deal_id, pending.onchainId, priceUsdc);
      clearKey(pendingKey(draft.deal_id));
      setPending(null);
    } catch (e) {
      console.error("Resume funding failed:", e);
      alert("Failed to resume funding: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setIsWorking(false);
    }
  }

  /** Retry a create that was interrupted before the deal existed. Same secret — never re-rolled. */
  async function handleRetryCreate() {
    if (!draft || !pending || pending.onchainId || !accountId || isWorking) return;
    if (accountId !== draft.buyer_id) return;
    setIsWorking(true);
    setError(null);
    try {
      const priceUsdc = pending.priceUsdc > 0 ? pending.priceUsdc : Math.round(draft.price_ngn * 1000);
      const deadlineMs = pending.deadlineMs > Date.now() ? pending.deadlineMs : Date.now() + draft.deadline_hours * 3600 * 1000;
      const newOnchainId = await createOnchainDeal(pending.secret, priceUsdc, deadlineMs);
      await linkAndFund(draft.deal_id, newOnchainId, priceUsdc);
      clearKey(pendingKey(draft.deal_id));
      setPending(null);
      setSecret(pending.secret);
      setSecretRevealed(true);
    } catch (e) {
      console.error("Retry create failed:", e);
      alert("Failed to retry: " + (e instanceof Error ? e.message : String(e)));
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
  // Every place the secret can live: memory, on-chain key, pre-create draft key, pending record.
  const availableSecret =
    secret ??
    (onchainId !== null ? readKey(secretStorageKey(onchainId)) : null) ??
    (draft !== null ? readKey(draftSecretKey(draft.deal_id)) : null) ??
    pending?.secret ??
    null;
  const visibleSecret = secret ?? (secretRevealed ? availableSecret : null);
  const hasStoredSecret = secret === null && availableSecret !== null;
  const canCreateAndFund =
    draft !== null && !legacy && draft.onchain_deal_id == null && !buyerMismatch;
  const quoteAmount = verifiedAmount(quote, quoteNow);
  const quoteExpired = isQuoteExpired(quote, quoteNow);

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

      {draft && draft.onchain_deal_id == null && pending && !buyerMismatch && (
        <div style={{
          background: "#1a1a1a",
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
          border: "1px solid #3b82f6"
        }}>
          {pending.onchainId ? (
            <div>
              <p style={{ color: "#60a5fa", marginTop: 0 }}>
                A previous attempt created on-chain deal #{pending.onchainId} but did not finish funding.
              </p>
              <button
                disabled={!isConnected || isWorking}
                onClick={handleResumeFunding}
                style={{
                  width: "100%",
                  background: !isConnected ? "#444" : "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 6,
                  cursor: !isConnected || isWorking ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                {isWorking ? "Resuming…" : "Resume funding"}
              </button>
            </div>
          ) : (
            <div>
              <p style={{ color: "#60a5fa", marginTop: 0 }}>
                A previous attempt was interrupted before the deal was created.
                Your delivery code survived — retrying reuses the same code.
              </p>
              <button
                disabled={!isConnected || isWorking}
                onClick={handleRetryCreate}
                style={{
                  width: "100%",
                  background: !isConnected ? "#444" : "#3b82f6",
                  color: "#fff",
                  border: "none",
                  padding: "12px 24px",
                  borderRadius: 6,
                  cursor: !isConnected || isWorking ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                {isWorking ? "Retrying…" : "Retry — same delivery code"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Intents route: a verified 1Click quote, or nothing. No dropdown can force live. */}
      {draft && !legacy && (
        <div style={{
          background: "#111827",
          padding: 16,
          borderRadius: 8,
          marginBottom: 24,
          border: "1px solid #1f2937"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Intents funding route</h3>
            <ModeBadge mode={displayMode(quote, agentMode)} />
          </div>

          {quoteLoading ? (
            <p style={{ color: "#9ca3af", margin: 0 }}>Checking the 1Click quote…</p>
          ) : quoteError ? (
            <div>
              <p role="alert" style={{ color: "#fbbf24", marginTop: 0 }}>
                Quote unavailable. {quoteError} No amount is shown.
              </p>
              <button
                onClick={() => loadQuote(draft.deal_id)}
                style={{
                  background: "transparent",
                  color: "#fbbf24",
                  border: "1px solid #fbbf24",
                  padding: "8px 16px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Try again
              </button>
            </div>
          ) : quote && quote.signature_verified ? (
            <div>
              {quoteAmount ? (
                <p style={{ fontSize: 20, fontWeight: "bold", margin: "4px 0" }}>
                  {quote.amount_in_formatted} USDC on {assetLabel(quote.origin_asset)}
                  {" → "}
                  {quoteAmount} USDC on {assetLabel(quote.destination_asset)}
                </p>
              ) : (
                <p style={{ color: "#fbbf24", margin: "4px 0" }}>
                  Quote expired. Refresh before trusting an amount.
                </p>
              )}
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0" }}>
                Quote {shortQuoteId(quote.quote_id)} · 1Click signature verified ·{" "}
                {quoteExpired
                  ? "expired"
                  : `good until ${quote.deadline ? new Date(quote.deadline).toLocaleTimeString() : "shortly"}`}
              </p>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0" }}>
                {quote.dry
                  ? "Dry quote: real 1Click data with dry: true. There is no deposit address and no transaction hash, and no funds move."
                  : "This build has not executed this quote."}
              </p>
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "8px 0" }}>
                Off-chain context only: a Lagos bank transfer, Nairobi M-Pesa, or Accra MoMo message does not fund escrow. Only a USDC transfer into escrow does. No live telecom rail is connected.
              </p>
              <button
                onClick={() => loadQuote(draft.deal_id)}
                disabled={quoteLoading}
                style={{
                  background: "transparent",
                  color: "#60a5fa",
                  border: "1px solid #60a5fa",
                  padding: "8px 16px",
                  borderRadius: 6,
                  cursor: quoteLoading ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                Refresh quote
              </button>
            </div>
          ) : quote ? (
            <p role="alert" style={{ color: "#ef4444", margin: 0 }}>
              Quote rejected: signature not verified. No amount is shown.
            </p>
          ) : null}
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
              ) : hasStoredSecret ? (
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
