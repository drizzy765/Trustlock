"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Copy, Link2, MessageCircle, Plus, Share2, Store, Wallet } from "lucide-react";
import { initNear, getAccountId, signIn } from "@/lib/near";
import { agentUrl } from "@/lib/config";
import { fetchHealth, type Mode } from "@/lib/quote";
import ModeBadge from "@/components/ModeBadge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select, Label, Hint } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import ChainValue from "@/components/ChainValue";
import AmountDisplay from "@/components/AmountDisplay";
import StatusBadge from "@/components/StatusBadge";
import LockMark from "@/components/LockMark";
import DealTimeline, { stepsForStatus } from "@/components/DealTimeline";
import NetworkChip from "@/components/NetworkChip";
import { formatUsdc } from "@/lib/format";
import {
  CURRENCIES,
  formatLocal,
  formatUpdated,
  isLocalCurrency,
  loadRates,
  toUsdc,
  type Currency,
  type FxRates,
} from "@/lib/fx";

interface DraftResult {
  draftId: number;
  item: string;
  priceUsdc: number;
  localLabel: string | null;
}

/**
 * Escrow is USDC only. The seller may type a local price; the browser converts it to USDC and
 * the USDC amount is what the draft stores and the buyer locks. The draft's integer price field
 * (named price_ngn by the agent API) is USDC × 1000, the same scale the pay page and the agent
 * already use (price × 1000 = USDC base units).
 */
function draftPriceFromUsdc(usdc: number): number {
  return Math.round(usdc * 1000);
}

export default function SellerOnboardPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [item, setItem] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [currency, setCurrency] = useState<Currency>("USDC");
  const [fx, setFx] = useState<FxRates | null>(null);
  const [fxError, setFxError] = useState(false);
  const [buyerAccount, setBuyerAccount] = useState("");
  const [riderAccount, setRiderAccount] = useState("");
  const [deadlineHours, setDeadlineHours] = useState("24");
  const [mode, setMode] = useState<Mode>("demo");
  const [isCreating, setIsCreating] = useState(false);
  const [createdDraft, setCreatedDraft] = useState<DraftResult | null>(null);
  const [shareableLink, setShareableLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  useEffect(() => {
    initNear().then(() => {
      setAccountId(getAccountId());
      setIsLoading(false);
    });
    fetchHealth().then((health) => {
      if (health?.mode) setMode(health.mode);
    });
  }, []);

  // Rates are needed only for a local currency. If both sources fail, local input is disabled.
  useEffect(() => {
    if (currency === "USDC" || fx) return;
    let alive = true;
    loadRates()
      .then((r) => alive && (setFx(r), setFxError(false)))
      .catch(() => {
        if (!alive) return;
        setFxError(true);
        setCurrency("USDC");
        toast.error("Exchange rates are unavailable right now. Enter the price in USDC.");
      });
    return () => {
      alive = false;
    };
  }, [currency, fx]);

  const amountNumber = Number(priceInput);
  const localCurrency = isLocalCurrency(currency) ? currency : null;
  const priceUsdc =
    !Number.isFinite(amountNumber) || amountNumber <= 0
      ? 0
      : localCurrency
        ? fx
          ? toUsdc(amountNumber, localCurrency, fx)
          : 0
        : Math.floor(amountNumber * 1000) / 1000;
  const localLabel = localCurrency && amountNumber > 0 ? formatLocal(amountNumber, localCurrency) : null;
  const ratesPending = Boolean(localCurrency && !fx);

  async function handleConnect() {
    await signIn();
  }

  async function handleCreateDraft() {
    // A draft is unsigned and moves no money, so it is allowed in every mode.
    if (!item.trim() || !priceInput || !buyerAccount.trim() || !riderAccount.trim() || !accountId) return;
    const price = draftPriceFromUsdc(priceUsdc);
    if (!Number.isInteger(price) || price <= 0) {
      setError(localCurrency ? "That price converts to less than 0.001 USDC. Enter a larger amount." : "Enter a price in USDC, for example 12.50.");
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
      // The local price rides in the link for display only; the draft holds the USDC amount.
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const q = localCurrency ? `?cur=${localCurrency}&amt=${encodeURIComponent(String(amountNumber))}` : "";
      setShareableLink(`${baseUrl}/pay/${data.deal_id}${q}`);
      setCreatedDraft({ draftId: data.deal_id, item: item.trim(), priceUsdc: price / 1000, localLabel });
      toast("Payment link ready", { description: "Share it with your buyer in any chat." });
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to create draft. Is the agent running at ${agentUrl}?`);
    } finally {
      setIsCreating(false);
    }
  }

  function shareText() {
    const local = createdDraft?.localLabel ? ` (≈ ${createdDraft.localLabel})` : "";
    return `Pay for ${createdDraft?.item}: ${formatUsdc(createdDraft?.priceUsdc ?? 0)} USDC${local}, locked until delivery.\n\n${shareableLink}`;
  }

  async function shareToWhatsApp() {
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText())}`;
    window.open(whatsappUrl, "_blank");
  }

  async function shareToInstagram() {
    // Instagram doesn't have a direct share URL, copy to clipboard
    await navigator.clipboard.writeText(shareableLink);
    toast("Link copied", { description: "Paste it in your Instagram DM." });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(shareableLink);
    toast("Link copied");
  }

  async function nativeShare() {
    try {
      await navigator.share({ title: "TrustLock payment link", text: shareText(), url: shareableLink });
    } catch {
      /* share sheet dismissed */
    }
  }

  const isConnected = !!accountId;
  const created = stepsForStatus("Created");
  const formReady = isConnected && item.trim() && priceUsdc > 0 && buyerAccount.trim() && riderAccount.trim();

  return (
    <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-[32px] leading-tight md:text-[40px]">Create a payment link</h1>
        {/* App mode label. Read-only: no one can select live from a dropdown. */}
        <span className="flex items-center gap-2 text-sm text-faint">
          App mode <ModeBadge mode={mode} />
        </span>
      </header>
      <p className="mt-2 max-w-[640px] text-mute">
        Describe the order and who&rsquo;s involved. Your buyer gets a link, locks USDC, and the rider&rsquo;s scan at the door pays you.
      </p>

      <div className="mt-6 flex min-h-11 flex-wrap items-center gap-3">
        {isLoading ? (
          <p role="status" className="text-mute">
            Checking your wallet…
          </p>
        ) : isConnected ? (
          <p className="flex min-w-0 items-center gap-2 text-[15px] text-mute">
            <Store aria-hidden="true" strokeWidth={1.5} className="size-5 shrink-0 text-faint" />
            Selling as <ChainValue value={accountId as string} label="your account" />
            <NetworkChip />
          </p>
        ) : (
          <Button variant="secondary" onClick={handleConnect}>
            <Wallet aria-hidden="true" strokeWidth={1.5} />
            Connect seller wallet
          </Button>
        )}
      </div>

      {!createdDraft ? (
        <div className="mt-8 grid gap-8 lg:grid-cols-12">
          {/* Draft form: unsigned. No funds move and no delivery code is made here. */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle>What are you selling?</CardTitle>
            </CardHeader>
            <CardBody>
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleCreateDraft();
                }}
              >
                <div>
                  <Label htmlFor="ob-item">Item</Label>
                  <Input id="ob-item" name="item" autoComplete="off" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Black leather sandals, size 40" />
                </div>

                <div>
                  <Label htmlFor="ob-price">Price</Label>
                  <div className="flex gap-2">
                    <Input
                      id="ob-price"
                      name="price"
                      inputMode="decimal"
                      autoComplete="off"
                      className="font-mono tabular"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder={localCurrency ? "18000" : "12.50"}
                      aria-describedby="ob-price-hint"
                    />
                    <Select
                      aria-label="Currency"
                      className="w-[112px] shrink-0"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as Currency)}
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code} disabled={c.code !== "USDC" && fxError}>
                          {c.code}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div id="ob-price-hint" aria-live="polite">
                    {localCurrency ? (
                      ratesPending ? (
                        <Hint>Loading exchange rates…</Hint>
                      ) : fx ? (
                        <>
                          <p className="mt-2 text-[15px] text-bone">
                            Buyer locks <span className="font-mono tabular">{formatUsdc(priceUsdc)} USDC</span>
                          </p>
                          <Hint className="mt-1">
                            Rate from{" "}
                            <a href={fx.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-bone">
                              {fx.source}
                            </a>
                            , updated {formatUpdated(fx.updatedAt)}. Escrow holds USDC, not {localCurrency}.
                          </Hint>
                        </>
                      ) : null
                    ) : (
                      <Hint>
                        Escrow holds USDC (testnet).{fxError ? " Exchange rates are unavailable, so local currencies are off for now." : " Pick a local currency to price in it instead."}
                      </Hint>
                    )}
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <Label htmlFor="ob-buyer">Buyer&rsquo;s NEAR account</Label>
                    <Input
                      id="ob-buyer"
                      name="buyer"
                      autoComplete="off"
                      spellCheck={false}
                      autoCapitalize="none"
                      className="font-mono"
                      value={buyerAccount}
                      onChange={(e) => setBuyerAccount(e.target.value)}
                      placeholder="buyer-name.testnet"
                    />
                    <Hint>Only this account can lock funds for the deal.</Hint>
                  </div>
                  <div>
                    <Label htmlFor="ob-rider">Rider&rsquo;s NEAR account</Label>
                    <Input
                      id="ob-rider"
                      name="rider"
                      autoComplete="off"
                      spellCheck={false}
                      autoCapitalize="none"
                      className="font-mono"
                      value={riderAccount}
                      onChange={(e) => setRiderAccount(e.target.value)}
                      placeholder="rider-name.testnet"
                    />
                    <Hint>The rider scans the delivery code at the door.</Hint>
                  </div>
                </div>

                <div>
                  <Label htmlFor="ob-deadline">Delivery deadline</Label>
                  <Select id="ob-deadline" value={deadlineHours} onChange={(e) => setDeadlineHours(e.target.value)}>
                    <option value="24">24 hours</option>
                    <option value="48">48 hours</option>
                    <option value="72">72 hours</option>
                    <option value="168">1 week</option>
                  </Select>
                  <Hint>If the rider hasn&rsquo;t scanned by then, the buyer can get a refund.</Hint>
                </div>

                {error ? <Alert title="The link wasn’t created">{error}</Alert> : null}

                <Button type="submit" block size="lg" disabled={!formReady} loading={isCreating}>
                  {!isConnected ? (
                    "Connect your wallet first"
                  ) : isCreating ? (
                    "Creating the link…"
                  ) : (
                    <>
                      <Link2 aria-hidden="true" strokeWidth={1.5} />
                      Create payment link
                    </>
                  )}
                </Button>
                <p className="text-sm text-faint">Creating a link moves no money. Testnet. No real money moves.</p>
              </form>
            </CardBody>
          </Card>

          {/* Live preview: what the buyer will see. */}
          <aside aria-label="Deal preview" className="lg:col-span-5">
            <div className="lg:sticky lg:top-24">
              <p className="text-sm text-faint">Your buyer sees</p>
              <Card className="mt-2 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[20px] font-medium break-words">{item.trim() || "Your item"}</p>
                    <StatusBadge status="Created" className="mt-2" />
                  </div>
                  <LockMark state="created" size={44} />
                </div>
                <AmountDisplay className="mt-5" amount={priceUsdc} local={localLabel} />
                <dl className="mt-5 grid grid-cols-[72px_1fr] gap-x-4 gap-y-2 border-t border-line pt-4 text-[15px]">
                  <dt className="text-faint">Buyer</dt>
                  <dd className="truncate font-mono text-[14px] text-bone">{buyerAccount.trim() || "Not set"}</dd>
                  <dt className="text-faint">Rider</dt>
                  <dd className="truncate font-mono text-[14px] text-bone">{riderAccount.trim() || "Not set"}</dd>
                  <dt className="text-faint">Deadline</dt>
                  <dd className="text-bone">{deadlineHours === "168" ? "1 week" : `${deadlineHours} hours`} after locking</dd>
                </dl>
              </Card>
              <DealTimeline className="mt-6" steps={created.steps} current={created.current} tone={created.tone} />
            </div>
          </aside>
        </div>
      ) : (
        /* Shareable link generated */
        <div className="mt-8 max-w-[640px] space-y-6">
          <Card>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>Share this link with your buyer</CardTitle>
                <p className="mt-1 text-[15px] text-mute">
                  {createdDraft.item}, <span className="font-mono tabular text-bone">{formatUsdc(createdDraft.priceUsdc)} USDC</span>
                  {createdDraft.localLabel ? <span> (≈ {createdDraft.localLabel})</span> : null}. Draft #{createdDraft.draftId}, unsigned, no funds moved yet.
                </p>
              </div>
              <ModeBadge mode={mode} />
            </CardHeader>
            <CardBody>
              <div className="rounded-[6px] border border-line-strong bg-ink-800 px-3 py-3">
                <ChainValue value={shareableLink} full label="payment link" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={copyLink}>
                  <Copy aria-hidden="true" strokeWidth={1.5} />
                  Copy link
                </Button>
                <Button variant="secondary" onClick={shareToWhatsApp}>
                  <MessageCircle aria-hidden="true" strokeWidth={1.5} />
                  WhatsApp
                </Button>
                <Button variant="secondary" onClick={shareToInstagram}>
                  Instagram
                </Button>
                {canShare ? (
                  <Button variant="secondary" onClick={nativeShare}>
                    <Share2 aria-hidden="true" strokeWidth={1.5} />
                    More apps
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <section aria-labelledby="next-title">
            <h2 id="next-title" className="text-[20px]">
              What happens next
            </h2>
            <DealTimeline
              className="mt-4"
              numbered
              steps={[
                { title: "Your buyer opens the link", detail: "In WhatsApp, Instagram or any chat." },
                { title: "The buyer locks USDC", detail: "It sits in escrow on NEAR. You can see it but not spend it yet." },
                { title: "Your rider delivers and scans", detail: "The buyer shows a one-time delivery code at the door." },
                { title: "You get paid", detail: "The scan releases the USDC to your account." },
              ]}
            />
          </section>

          <Button
            variant="ghost"
            onClick={() => {
              setCreatedDraft(null);
              setShareableLink("");
              setError(null);
              setItem("");
              setPriceInput("");
              setBuyerAccount("");
              setRiderAccount("");
            }}
          >
            <Plus aria-hidden="true" strokeWidth={1.5} />
            Create another link
          </Button>
        </div>
      )}

      <p className="mt-12 max-w-[640px] text-sm text-faint">
        The rider&rsquo;s scan releases funds, not an AI opinion. The AI agent can draft and check deals; it can&rsquo;t move money.
      </p>
    </main>
  );
}
