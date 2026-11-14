"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ScanLine, Wallet } from "lucide-react";
import { initNear, signIn, confirmDelivery, getDeal, getExplorerUrl, txHashOf } from "@/lib/near";
import { setupSelector } from "@/lib/wallet";
import { contractId } from "@/lib/config";
import { fetchHealth, type Mode } from "@/lib/quote";
import ModeBadge from "@/components/ModeBadge";
import { SHA256 as sha256 } from "crypto-js";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Label, Hint } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import ScannerFrame from "@/components/ScannerFrame";
import StatusBadge from "@/components/StatusBadge";
import ChainValue from "@/components/ChainValue";
import AmountDisplay from "@/components/AmountDisplay";
import ReleaseMoment from "@/components/ReleaseMoment";
import NetworkChip from "@/components/NetworkChip";
import { explorerAccountUrl, usdcFromBaseUnits } from "@/lib/format";

export default function ScanPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dealId, setDealId] = useState("");
  const [qrInput, setQrInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mode, setMode] = useState<Mode>("demo");
  const [dealInfo, setDealInfo] = useState<any>(null);
  // UI only: a decoded camera scan waits here until the code field holds it, then submits.
  const [scanned, setScanned] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let unsubscribe: { unsubscribe: () => void } | null = null;
    initNear().then(async ({ accountId }) => {
      setAccountId(accountId);
      // The Connect modal signs in outside React: follow the selector store.
      const selector = await setupSelector();
      unsubscribe = selector.store.observable.subscribe((state) => {
        setAccountId(state.accounts[0]?.accountId ?? null);
      });
      setIsLoading(false);
    });
    fetchHealth().then((health) => {
      if (health?.mode) setMode(health.mode);
    });
    // ?deal=<id> prefills the deal field (from a rider's link).
    const fromLink = new URLSearchParams(window.location.search).get("deal");
    if (fromLink && /^\d+$/.test(fromLink)) setDealId(fromLink);
    return () => {
      unsubscribe?.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        tx_hash: txHashOf(result),
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
        userMessage = "This code was already used. Nothing was paid twice.";
      } else if (errorMessage.includes("ERR_NOT_RIDER")) {
        userMessage = "Only the assigned rider can confirm this delivery.";
      } else if (errorMessage.includes("ERR_ALREADY_RELEASED")) {
        userMessage = "Funds were already released for this deal.";
      } else if (errorMessage.includes("ERR_BAD_QR")) {
        userMessage = "That code doesn't match this deal";
      } else if (errorMessage.includes("ERR_NOT_EXPIRED")) {
        // confirm_delivery panics with ERR_NOT_EXPIRED when now > deadline_ms (not ERR_DEADLINE).
        userMessage = "The deal deadline has passed.";
      } else if (errorMessage.includes("ERR_BAD_STATUS")) {
        userMessage = "Already delivered or not funded";
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
  const canSubmit = Boolean(dealId && qrInput.trim() && !isSubmitting && isConnected && mode !== "demo");

  // A camera decode fills the existing code field, then goes through the existing submit.
  useEffect(() => {
    if (scanned === null || qrInput !== scanned) return;
    setScanned(null);
    if (canSubmit) void handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanned, qrInput]);

  // No endless spinner: after 10 s, say what's going on.
  useEffect(() => {
    if (!isSubmitting) {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(t);
  }, [isSubmitting]);

  const replayed = result && !result.success && String(result.error ?? "").includes("ERR_REPLAYED_QR");
  const amount = dealInfo ? usdcFromBaseUnits(dealInfo.price) : 0;

  return (
    <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14 [&>*]:max-w-[640px]">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] leading-tight md:text-[40px]">Confirm a delivery</h1>
        <span className="flex items-center gap-2 text-sm text-faint">
          App mode <ModeBadge mode={mode} />
        </span>
      </header>
      <p className="mt-2 text-mute">For riders. Scan the buyer&rsquo;s one-time code at the door and the seller is paid.</p>

      <div className="mt-6 flex min-h-11 flex-wrap items-center gap-3">
        {isLoading ? (
          <p role="status" className="text-mute">
            Checking your wallet…
          </p>
        ) : isConnected ? (
          <p className="flex min-w-0 items-center gap-2 text-[15px] text-mute">
            <Wallet aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-faint" />
            Rider <ChainValue value={accountId as string} label="your account" />
            <NetworkChip />
          </p>
        ) : (
          <Button variant="secondary" onClick={handleConnect}>
            <Wallet aria-hidden="true" strokeWidth={1.5} />
            Connect rider wallet
          </Button>
        )}
      </div>

      {/* Deal lookup */}
      <section className="mt-8">
        <Label htmlFor="scan-deal">Deal number</Label>
        <div className="flex gap-2">
          <Input
            id="scan-deal"
            inputMode="numeric"
            autoComplete="off"
            className="font-mono tabular"
            value={dealId}
            onChange={(e) => setDealId(e.target.value.replace(/\D/g, ""))}
            placeholder="12"
          />
          <Button variant="secondary" onClick={lookupDeal} disabled={!dealId || mode === "demo"}>
            Look up
          </Button>
        </div>
        {dealInfo ? (
          <Card className="mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[20px] font-medium">
                Deal #{dealId}
                <span className="sr-only">,</span>
              </p>
              <StatusBadge status={dealInfo.status} />
            </div>
            <p className="mt-1 break-words text-mute">{dealInfo.item}</p>
            <AmountDisplay className="mt-4" amount={amount} size="md" />
            <dl className="mt-4 grid grid-cols-[64px_1fr] gap-x-4 gap-y-2 border-t border-line pt-4 text-[15px]">
              <dt className="text-faint">Seller</dt>
              <dd className="min-w-0">
                <ChainValue value={dealInfo.seller} href={explorerAccountUrl(dealInfo.seller)} label="seller account" />
              </dd>
              <dt className="text-faint">Buyer</dt>
              <dd className="min-w-0">
                <ChainValue value={dealInfo.buyer} href={explorerAccountUrl(dealInfo.buyer)} label="buyer account" />
              </dd>
            </dl>
          </Card>
        ) : null}
      </section>

      {/* Scan, or paste */}
      <section className="mt-10" aria-labelledby="scan-title">
        <h2 id="scan-title" className="text-[20px]">
          Scan the buyer&rsquo;s code
        </h2>
        <p className="mt-1 mb-5 text-[15px] text-mute">Each code works once. A code that was already used is rejected on-chain.</p>

        <ScannerFrame
          onDecode={(text) => {
            setResult(null);
            setScanned(text);
            setQrInput(text);
          }}
          success={Boolean(result?.success)}
          failed={Boolean(result && !result.success)}
          disabled={isSubmitting}
        />

        {result?.success ? (
          <Card className="mt-6 p-5 md:p-6">
            <ReleaseMoment amount={amount} txHash={result.tx_hash} title={dealInfo?.status === "Released" ? "Released." : "Delivered."} />
          </Card>
        ) : null}

        <details className="group mt-6 rounded-[12px] border border-line bg-ink-900" open={!result?.success}>
          <summary className="flex h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-bone">
            Paste code instead
            <ChevronDown aria-hidden="true" strokeWidth={1.5} className="size-5 text-faint transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <div className="px-5 pb-5">
            <Label htmlFor="scan-code" className="sr-only">
              Delivery code
            </Label>
            <Textarea
              id="scan-code"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="64-character delivery code"
              rows={3}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="none"
              className="resize-y font-mono text-[14px]"
            />
          </div>
        </details>

        <Button className="mt-4" block size="lg" onClick={handleSubmit} disabled={!canSubmit && !isSubmitting} loading={isSubmitting}>
          {!isConnected ? (
            "Connect your wallet to confirm"
          ) : mode === "demo" ? (
            "Confirm delivery (off in demo mode)"
          ) : isSubmitting ? (
            "Confirming on NEAR…"
          ) : (
            <>
              <ScanLine aria-hidden="true" strokeWidth={1.5} />
              Confirm delivery
            </>
          )}
        </Button>
        {slow ? (
          <p role="status" className="mt-3 text-[15px] text-mute">
            Still waiting for NEAR. Your code hasn&rsquo;t been used yet.
          </p>
        ) : null}
        {mode === "demo" ? (
          <Hint>The agent reports demo mode, so on-chain confirmation is off. Switch the deployment to live mode to submit.</Hint>
        ) : null}

        {result && !result.success ? (
          <Alert className="mt-4" title={replayed ? "Code already used" : "Delivery not confirmed"}>
            <p>{result.message}</p>
            {result.error ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-faint">Technical details</summary>
                <pre className="mt-2 overflow-x-auto font-mono text-[12px] whitespace-pre-wrap text-faint">{result.error}</pre>
              </details>
            ) : null}
          </Alert>
        ) : null}
      </section>

      <section className="mt-12 text-sm text-faint">
        <p>
          The rider key can only call <span className="font-mono text-mute">confirm_delivery</span>. It can&rsquo;t move funds or touch other deals.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span>{mode === "demo" ? "Demo mode (no blockchain calls)." : "NEAR testnet."} Contract</span>
          <ChainValue value={contractId} href={explorerAccountUrl(contractId)} label="contract id" />
        </p>
      </section>
    </main>
  );
}
