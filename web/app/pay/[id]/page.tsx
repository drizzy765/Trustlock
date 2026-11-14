"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { contractId, usdcToken, network, agentUrl } from "@/lib/config";
import { initNear, getAccountId, signIn, getDeal, getExplorerUrl, fundDeal, createDeal } from "@/lib/near";
import { fetchHealth, fetchQuote, displayMode, assetLabel, shortQuoteId, verifiedAmount, isQuoteExpired, quoteDeadlineMs, type Mode, type Quote } from "@/lib/quote";
import ModeBadge from "@/components/ModeBadge";
import { SHA256 as sha256 } from "crypto-js";
import { toast } from "sonner";
import { Send, ChevronDown, Lock, PackageCheck, QrCode, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import StatusBadge from "@/components/StatusBadge";
import NetworkChip from "@/components/NetworkChip";
import ChainValue from "@/components/ChainValue";
import AmountDisplay from "@/components/AmountDisplay";
import LockMark from "@/components/LockMark";
import DealTimeline, { stepsForStatus } from "@/components/DealTimeline";
import QrCard from "@/components/QrCard";
import ReleaseMoment from "@/components/ReleaseMoment";
import { dealState } from "@/components/status";
import { explorerAccountUrl, formatUsdc, usdcFromBaseUnits } from "@/lib/format";
import { formatLocal, isLocalCurrency, type LocalCurrency } from "@/lib/fx";

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
  // Display only: the seller's local-currency price rides in the link (?cur=NGN&amt=18000).
  // Escrow is always the USDC amount from the draft; this never feeds a handler.
  const [local, setLocal] = useState<{ currency: LocalCurrency; amount: number } | null>(null);
  const lockedToastFor = useRef<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cur = q.get("cur");
    const amt = Number(q.get("amt"));
    if (isLocalCurrency(cur) && Number.isFinite(amt) && amt > 0) setLocal({ currency: cur, amount: amt });
  }, []);

  // Escrow locked: one neutral toast with the explorer link.
  useEffect(() => {
    if (!txHash || deal?.status !== "Funded" || lockedToastFor.current === txHash) return;
    lockedToastFor.current = txHash;
    toast("Locked on NEAR", {
      description: "The USDC is in escrow until delivery.",
      action: { label: "View on NearBlocks", onClick: () => window.open(getExplorerUrl(txHash), "_blank", "noopener,noreferrer") },
    });
  }, [txHash, deal?.status]);


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
      // History links use /pay/<on-chain id>?onchain=1 so a draft with the same numeric
      // id cannot shadow the on-chain deal. Draft links (/pay/<draft id>) are unchanged.
      const forceOnchain = new URLSearchParams(window.location.search).get("onchain") === "1";
      if (forceOnchain) {
        const onchainData = await getDeal(draftId);
        if (!onchainData) {
          throw new Error("Deal not found. The link may be invalid.");
        }
        setLegacy(true);
        setDeal(onchainData as OnchainDeal);
        setOnchainId(draftId);
        return;
      }
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
      toast.error("Failed to lock funds: " + (e instanceof Error ? e.message : String(e)), { duration: Infinity });
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
      toast.error("Failed to resume funding: " + (e instanceof Error ? e.message : String(e)), { duration: Infinity });
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
      toast.error("Failed to retry: " + (e instanceof Error ? e.message : String(e)), { duration: Infinity });
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
      toast.error("Failed to fund deal: " + (e instanceof Error ? e.message : String(e)), { duration: Infinity });
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
      toast.error("Failed to confirm receipt: " + (e instanceof Error ? e.message : String(e)), { duration: Infinity });
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
  const summaryStatus = deal?.status ?? (draft ? "Created" : null);
  const summaryItem = deal?.item ?? draft?.item ?? "";
  // Same conversion the handlers use: draft price × 1000 = USDC base units (6 decimals).
  const summaryAmount = deal ? usdcFromBaseUnits(deal.price) : draft ? (draft.price_ngn * 1000) / 1_000_000 : 0;
  const summarySeller = deal?.seller ?? draft?.seller_id ?? null;
  const summaryBuyer = deal?.buyer ?? draft?.buyer_id ?? null;
  const summaryRider = deal?.rider ?? draft?.rider_id ?? null;
  const timeline = stepsForStatus(summaryStatus, { txHref: txHash ? getExplorerUrl(txHash) : undefined });
  const releasedNow = deal?.status === "Delivered" || deal?.status === "Released";
  const refundedNow = deal?.status === "Expired" || deal?.status === "Refunded";
  const showFundExisting =
    deal?.status === "Created" && !canCreateAndFund && onchainId !== null && (legacy || (draft !== null && draft.onchain_deal_id != null));
  const localLabel = local && summaryAmount > 0 ? formatLocal(local.amount, local.currency) : null;

  if (isLoading) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14 [&>*]:max-w-[640px]">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="mt-8 h-44 w-full rounded-[12px]" />
        <Skeleton className="mt-6 h-56 w-full rounded-[12px]" />
        <p role="status" className="mt-6 text-mute">
          Loading this deal from NEAR…
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14 [&>*]:max-w-[640px]">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] leading-tight md:text-[40px]">Deal #{onchainId ?? pageId}</h1>
        {summaryStatus ? <StatusBadge status={summaryStatus} /> : null}
        <NetworkChip />
      </header>
      <p className="mt-2 text-mute">
        {deal?.status === "Funded"
          ? "The USDC is locked in escrow until the order arrives."
          : releasedNow
            ? "Delivered. This deal is complete."
            : refundedNow
              ? "The deadline passed, so the USDC goes back to the buyer."
              : deal?.status === "Disputed"
                ? "This deal is under manual review."
                : "Review the order, then lock USDC. It’s released only when the order arrives."}
      </p>

      <div className="mt-6 flex min-h-11 flex-wrap items-center gap-3">
        {isConnected ? (
          <p className="flex min-w-0 items-center gap-2 text-[15px] text-mute">
            <Wallet aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-faint" />
            Connected as <ChainValue value={accountId as string} label="your account" />
          </p>
        ) : (
          <Button variant="secondary" onClick={handleConnect}>
            <Wallet aria-hidden="true" strokeWidth={1.5} />
            Connect NEAR wallet
          </Button>
        )}
      </div>

      <div className="mt-6 space-y-4">
        {error ? <Alert title="This deal didn’t load">{error}</Alert> : null}

        {buyerMismatch && draft ? (
          <Alert tone="lock" title="Wrong wallet for this link">
            This link names <span className="font-mono text-bone">{draft.buyer_id}</span> as the buyer, but you connected as{" "}
            <span className="font-mono text-bone">{accountId}</span>. Connect with the named buyer wallet to continue.
          </Alert>
        ) : null}

        {draft && draft.onchain_deal_id == null && pending && !buyerMismatch ? (
          <Card className="p-5">
            {pending.onchainId ? (
              <>
                <p className="text-bone">A previous attempt created on-chain deal #{pending.onchainId} but didn&rsquo;t finish locking USDC.</p>
                <Button className="mt-4" block size="lg" disabled={!isConnected} loading={isWorking} onClick={handleResumeFunding}>
                  {isWorking ? "Resuming…" : "Resume locking USDC"}
                </Button>
              </>
            ) : (
              <>
                <p className="text-bone">
                  A previous attempt was interrupted before the deal was created. Your delivery code is saved, and retrying reuses the same code.
                </p>
                <Button className="mt-4" block size="lg" disabled={!isConnected} loading={isWorking} onClick={handleRetryCreate}>
                  {isWorking ? "Retrying…" : "Retry with the same delivery code"}
                </Button>
              </>
            )}
          </Card>
        ) : null}
      </div>

      {deal || draft ? (
        <>
          {/* Order summary (Stripe Checkout shape): item, seller, one big amount, deadline. */}
          <Card className="mt-6">
            <div className="flex items-start justify-between gap-4 px-5 pt-5 md:px-6">
              <div className="min-w-0">
                <p className="text-sm text-faint">Order</p>
                <p className="mt-1 text-[20px] font-medium break-words">{summaryItem || "Untitled item"}</p>
              </div>
              <LockMark state={dealState(summaryStatus)} size={44} />
            </div>
            <div className="px-5 pt-4 md:px-6">
              <AmountDisplay amount={summaryAmount} local={localLabel} />
              {localLabel && local ? (
                <p className="mt-2 text-sm text-faint">
                  Seller&rsquo;s price in {local.currency} when the link was made. You lock the USDC amount.
                </p>
              ) : null}
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-line px-5 py-4 text-[15px] sm:grid-cols-[120px_1fr] md:px-6">
              {summarySeller ? (
                <>
                  <dt className="text-faint">Seller</dt>
                  <dd className="min-w-0">
                    <ChainValue value={summarySeller} href={explorerAccountUrl(summarySeller)} label="seller account" />
                  </dd>
                </>
              ) : null}
              {summaryBuyer ? (
                <>
                  <dt className="text-faint">Buyer</dt>
                  <dd className="min-w-0">
                    <ChainValue value={summaryBuyer} href={explorerAccountUrl(summaryBuyer)} label="buyer account" />
                  </dd>
                </>
              ) : null}
              {summaryRider ? (
                <>
                  <dt className="text-faint">Rider</dt>
                  <dd className="min-w-0">
                    <ChainValue value={summaryRider} href={explorerAccountUrl(summaryRider)} label="rider account" />
                  </dd>
                </>
              ) : null}
              <dt className="text-faint">Deadline</dt>
              <dd className="text-bone">
                {deal?.deadline_ms
                  ? new Date(deal.deadline_ms).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })
                  : draft
                    ? `${draft.deadline_hours} hours after you lock USDC`
                    : "Not set"}
              </dd>
            </dl>
          </Card>

          {/* Where the deal is. Driven by the contract status. */}
          <section aria-labelledby="progress-title" className="mt-10">
            <h2 id="progress-title" className="text-[20px]">
              Progress
            </h2>
            <DealTimeline className="mt-4" steps={timeline.steps} current={timeline.current} tone={timeline.tone} done={timeline.done} />
          </section>

          {/* Action: whichever existing branch applies. Same handlers. */}
          <section aria-label="Next step" className="mt-10">
            {canCreateAndFund ? (
              <Card className="p-5 md:p-6">
                <p className="text-[20px] font-medium">Lock {formatUsdc(summaryAmount)} USDC in escrow</p>
                <p className="mt-1 text-[15px] text-mute">
                  Your wallet creates the deal and locks the USDC. This device keeps a one-time delivery code for the rider.
                </p>
                <Button className="mt-5" block size="lg" disabled={!isConnected} loading={isWorking} onClick={handleCreateAndFund}>
                  {!isConnected ? (
                    "Connect your wallet to lock USDC"
                  ) : isWorking ? (
                    "Locking USDC…"
                  ) : (
                    <>
                      <Lock aria-hidden="true" strokeWidth={1.5} />
                      Lock USDC in escrow
                    </>
                  )}
                </Button>
                <p className="mt-3 text-sm text-faint">Testnet. No real money moves.</p>
              </Card>
            ) : null}

            {showFundExisting ? (
              <Card className="p-5 md:p-6">
                <p className="text-[20px] font-medium">Lock {formatUsdc(summaryAmount)} USDC in escrow</p>
                <p className="mt-1 text-[15px] text-mute">This deal exists on NEAR but isn&rsquo;t funded yet.</p>
                <Button className="mt-5" block size="lg" disabled={!isConnected} loading={isWorking} onClick={handleFundExisting}>
                  {!isConnected ? (
                    "Connect your wallet to lock USDC"
                  ) : isWorking ? (
                    "Locking USDC…"
                  ) : (
                    <>
                      <Lock aria-hidden="true" strokeWidth={1.5} />
                      Lock USDC in escrow
                    </>
                  )}
                </Button>
                <p className="mt-3 text-sm text-faint">Testnet. No real money moves.</p>
              </Card>
            ) : null}

            {deal?.status === "Funded" ? (
              <div className="space-y-5">
                <div className="flex items-center gap-4">
                  <LockMark state="funded" size={56} />
                  <div>
                    <p className="text-[20px] font-medium">Locked on NEAR</p>
                    <p className="text-[15px] text-mute">The USDC is held in escrow until delivery.</p>
                  </div>
                </div>

                {/* Delivery code: generated on this device, shown once, re-openable here. */}
                {visibleSecret ? (
                  <QrCard secret={visibleSecret} />
                ) : hasStoredSecret ? (
                  <Button variant="secondary" block onClick={() => setSecretRevealed(true)}>
                    <QrCode aria-hidden="true" strokeWidth={1.5} />
                    Show my delivery code
                  </Button>
                ) : (
                  <p className="text-[15px] text-mute">
                    The delivery code lives in the buyer&rsquo;s browser. If you locked the USDC on this device, it shows here.
                  </p>
                )}

                {isConnected && accountId === deal.buyer ? (
                  <Button block size="lg" loading={isConfirming} onClick={() => setShowConfirmModal(true)}>
                    {isConfirming ? (
                      "Confirming…"
                    ) : (
                      <>
                        <PackageCheck aria-hidden="true" strokeWidth={1.5} />
                        I received it, release funds
                      </>
                    )}
                  </Button>
                ) : null}

                {!isConnected || accountId !== deal.buyer ? (
                  <p className="text-[15px] text-mute">Waiting for the buyer to confirm receipt, or the rider to scan the code.</p>
                ) : null}
              </div>
            ) : null}

            {releasedNow ? (
              <Card className="p-5 md:p-6">
                <ReleaseMoment amount={summaryAmount} txHash={txHash} title={deal?.status === "Delivered" ? "Delivered." : "Released."} />
              </Card>
            ) : null}

            {refundedNow ? (
              <Card className="p-5 md:p-6">
                <ReleaseMoment refund amount={summaryAmount} txHash={txHash} title={deal?.status === "Expired" ? "Expired." : "Refunded."} />
              </Card>
            ) : null}

            {deal?.status === "Disputed" ? (
              <Alert title="Manual review">
                This deal is disputed. Funds stay locked in escrow until the dispute is resolved or times out. Nothing moves without that.
              </Alert>
            ) : null}
          </section>

          {txHash && !releasedNow && !refundedNow ? (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-faint">
              <Send aria-hidden="true" strokeWidth={1.5} className="size-4 text-faint" />
              <span>Transaction sent</span>
              <ChainValue value={txHash} href={getExplorerUrl(txHash)} label="transaction" />
            </div>
          ) : null}
        </>
      ) : !error ? (
        <p role="status" className="mt-8 text-mute">
          Loading this deal from NEAR…
        </p>
      ) : null}

      {/* Intents route: a verified 1Click quote, or nothing. Quote card JSX unchanged (owned by the intents work). */}
      {draft && !legacy ? (
        <details className="group mt-10 rounded-[12px] border border-line bg-ink-900">
          <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-bone md:px-6">
            Pay from another chain (quote only)
            <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-5 text-faint transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="px-5 pb-5 md:px-6">
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
          </div>
        </details>
      ) : null}

      <p className="mt-10 text-[15px] text-mute">
        Used to paying by bank transfer, M-Pesa or MoMo? Here you lock USDC instead, and it&rsquo;s released only when your order arrives.
        TrustLock doesn&rsquo;t connect to banks or mobile-money networks.
      </p>

      {/* Confirm dialog: releasing funds cannot be undone. Same handler as before. */}
      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent aria-describedby="confirm-release-desc">
          <DialogTitle id="confirm-release-title">Release funds?</DialogTitle>
          <DialogDescription id="confirm-release-desc">
            This sends the locked USDC to the seller and <strong className="font-medium text-bone">can&rsquo;t be undone</strong>. Only confirm
            if you have the item.
          </DialogDescription>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => setShowConfirmModal(false)}>
              Cancel
            </Button>
            <Button ref={confirmButtonRef} className="flex-1" loading={isConfirming} onClick={handleConfirmReceipt}>
              {isConfirming ? "Releasing…" : "Yes, release funds"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
