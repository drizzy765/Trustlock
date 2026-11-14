"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ExternalLink, Link2, RotateCw, Wallet } from "lucide-react";
import { initNear, signIn, getDeal } from "@/lib/near";
import { setupSelector } from "@/lib/wallet";
import { contractId } from "@/lib/config";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import StatusBadge from "@/components/StatusBadge";
import ChainValue from "@/components/ChainValue";
import LockMark from "@/components/LockMark";
import { explorerAccountUrl, formatUsdc, usdcFromBaseUnits } from "@/lib/format";
import { cn } from "@/lib/utils";

interface HistoryDeal {
  deal_id: number;
  seller: string;
  buyer: string;
  rider: string;
  item: string;
  price: string;
  status: string;
}

const TABS = [
  { id: "all", label: "All", match: (_s: string) => true },
  { id: "locked", label: "Locked", match: (s: string) => s === "Funded" },
  { id: "released", label: "Released", match: (s: string) => s === "Delivered" || s === "Released" },
  { id: "refunded", label: "Refunded", match: (s: string) => s === "Expired" || s === "Refunded" },
  { id: "disputed", label: "Disputed", match: (s: string) => s === "Disputed" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const MAX_PROBE = 60;
const BATCH = 6;

/**
 * The contract has no list method, so probe get_deal(1, 2, …) until 3 ids in a row are empty
 * (cap 60). Each row keeps its REAL deal id (the old code renumbered rows after filtering).
 */
async function probeDeals(): Promise<HistoryDeal[]> {
  const found: HistoryDeal[] = [];
  let misses = 0;
  let failures = 0;
  for (let start = 1; start <= MAX_PROBE && misses < 3; start += BATCH) {
    const ids = Array.from({ length: Math.min(BATCH, MAX_PROBE - start + 1) }, (_, i) => start + i);
    const results = await Promise.all(
      ids.map((id) =>
        getDeal(id).then(
          (deal) => ({ id, deal, failed: false }),
          () => ({ id, deal: null, failed: true })
        )
      )
    );
    for (const r of results) {
      if (misses >= 3) break;
      if (r.failed) failures += 1;
      if (r.deal) {
        misses = 0;
        found.push({ ...(r.deal as Omit<HistoryDeal, "deal_id">), deal_id: r.id });
      } else {
        misses += 1;
      }
    }
    if (failures > 0 && found.length === 0) throw new Error("rpc");
  }
  return found;
}

export default function HistoryPage() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletReady, setWalletReady] = useState(false);
  const [deals, setDeals] = useState<HistoryDeal[]>([]);
  const [tab, setTab] = useState<TabId>("all");
  const [scope, setScope] = useState<"mine" | "all">("all");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("status");
    if (TABS.some((t) => t.id === q)) setTab(q as TabId);
    let unsubscribe: { unsubscribe: () => void } | null = null;
    initNear().then(async ({ accountId }) => {
      setAccountId(accountId);
      if (accountId) setScope("mine");
      // The Connect modal signs in outside React: follow the selector store.
      const selector = await setupSelector();
      unsubscribe = selector.store.observable.subscribe((state) => {
        const id = state.accounts[0]?.accountId ?? null;
        setAccountId(id);
        if (id) setScope("mine");
      });
      setWalletReady(true);
    });
    return () => {
      unsubscribe?.unsubscribe();
    };
  }, []);

  async function loadDeals() {
    setState("loading");
    try {
      setDeals(await probeDeals());
      setState("ready");
    } catch (e) {
      console.error("Failed to load deals:", e);
      setState("error");
    }
  }

  useEffect(() => {
    if (walletReady) void loadDeals();
  }, [walletReady]);

  useEffect(() => {
    if (state !== "loading") {
      setSlow(false);
      return;
    }
    const t = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(t);
  }, [state]);

  function chooseTab(id: TabId) {
    setTab(id);
    const url = new URL(window.location.href);
    if (id === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", id);
    window.history.replaceState(null, "", url);
  }

  const scoped = useMemo(
    () =>
      scope === "mine" && accountId
        ? deals.filter((d) => d.seller === accountId || d.buyer === accountId || d.rider === accountId)
        : deals,
    [deals, scope, accountId]
  );
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const rows = scoped.filter((d) => active.match(d.status));

  const locked = scoped.filter((d) => d.status === "Funded");
  const lockedSum = locked.reduce((s, d) => s + usdcFromBaseUnits(d.price), 0);
  const released = scoped.filter((d) => d.status === "Delivered" || d.status === "Released").length;
  const refunded = scoped.filter((d) => d.status === "Expired" || d.status === "Refunded").length;
  const summary =
    scoped.length === 0
      ? null
      : `${locked.length} ${locked.length === 1 ? "deal" : "deals"} locked (${formatUsdc(lockedSum)} USDC). ${released} released. ${refunded} refunded.`;

  function counterparty(d: HistoryDeal): { role: string; account: string } {
    if (scope === "mine" && accountId) {
      if (d.seller === accountId) return { role: "Buyer", account: d.buyer };
      return { role: "Seller", account: d.seller };
    }
    return { role: "Seller", account: d.seller };
  }

  return (
    <main className="mx-auto max-w-[1200px] px-5 pt-10 md:px-8 md:pt-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] leading-tight md:text-[40px]">History</h1>
          <p className="mt-2 text-mute">Every deal on the escrow contract, read live from NEAR.</p>
        </div>
        <div className="flex items-center gap-2">
          {accountId ? (
            <div role="group" aria-label="Which deals" className="inline-flex rounded-[8px] border border-line-strong p-0.5">
              {(["mine", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "h-9 rounded-[6px] px-3 text-sm transition-colors duration-150",
                    scope === s ? "bg-ink-800 text-bone" : "text-mute hover:text-bone"
                  )}
                >
                  {s === "mine" ? "Mine" : "All on contract"}
                </button>
              ))}
            </div>
          ) : walletReady ? (
            <Button variant="secondary" size="sm" onClick={() => signIn()}>
              <Wallet aria-hidden="true" strokeWidth={1.5} className="!size-4" />
              Connect to see yours
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" aria-label="Refresh deals" onClick={loadDeals} disabled={state === "loading"}>
            <RotateCw aria-hidden="true" strokeWidth={1.5} />
          </Button>
        </div>
      </header>

      {/* Underline tabs, synced to ?status= */}
      <div role="tablist" aria-label="Filter by status" className="mt-8 flex gap-5 overflow-x-auto border-b border-line md:gap-6">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            onClick={() => chooseTab(t.id)}
            className={cn(
              "relative h-11 shrink-0 text-[15px] transition-colors duration-150",
              tab === t.id ? "text-bone" : "text-mute hover:text-bone"
            )}
          >
            {t.label}
            {tab === t.id ? <span aria-hidden="true" className="absolute right-0 bottom-[-1px] left-0 h-0.5 bg-bone" /> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-6">
        {state === "loading" ? (
          <div>
            <p role="status" className="text-mute">
              {slow ? "Still loading. NEAR RPC is slow right now…" : "Loading deals from NEAR…"}
            </p>
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
        ) : state === "error" ? (
          <Alert title="Couldn’t reach NEAR RPC">
            <p>Your funds are safe on chain; this only affects the view.</p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={loadDeals}>
              <RotateCw aria-hidden="true" strokeWidth={1.5} className="!size-4" />
              Retry
            </Button>
          </Alert>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-start gap-4 py-10">
            <LockMark state="created" size={56} />
            <div>
              <p className="text-[20px] font-medium">
                {scoped.length === 0 ? "No deals yet." : `No ${active.label.toLowerCase()} deals.`}
              </p>
              <p className="mt-1 text-mute">
                {scoped.length === 0
                  ? scope === "mine"
                    ? "Nothing on this contract involves your account. Create a payment link and share it in any chat."
                    : "Create a payment link and share it in any chat."
                  : "Try another filter."}
              </p>
            </div>
            {scoped.length === 0 ? (
              <Link href="/seller/onboard" className={buttonVariants({ variant: "primary" })}>
                <Link2 aria-hidden="true" strokeWidth={1.5} />
                Create a payment link
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            {summary ? <p className="mb-4 text-mute">{summary}</p> : null}
            {/* Desktop table */}
            <Card className="hidden overflow-hidden md:block">
              <table className="w-full text-left text-[15px]">
                <thead>
                  <tr className="border-b border-line text-sm text-faint">
                    <th scope="col" className="px-5 py-3 font-normal">Deal</th>
                    <th scope="col" className="px-5 py-3 font-normal">Item</th>
                    <th scope="col" className="px-5 py-3 font-normal">Counterparty</th>
                    <th scope="col" className="px-5 py-3 text-right font-normal">Amount</th>
                    <th scope="col" className="px-5 py-3 font-normal">Status</th>
                    <th scope="col" className="px-5 py-3 font-normal"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const cp = counterparty(d);
                    return (
                      <tr key={d.deal_id} className="border-b border-line last:border-0 hover:bg-ink-800">
                        <td className="px-5 py-3 font-mono tabular text-bone">#{d.deal_id}</td>
                        <td className="max-w-[260px] truncate px-5 py-3 text-bone" title={d.item}>{d.item || "Untitled"}</td>
                        <td className="px-5 py-3">
                          <span className="mr-2 text-sm text-faint">{cp.role}</span>
                          <ChainValue value={cp.account} href={explorerAccountUrl(cp.account)} label={`${cp.role.toLowerCase()} account`} />
                        </td>
                        <td className="px-5 py-3 text-right font-mono tabular whitespace-nowrap text-bone">
                          {formatUsdc(usdcFromBaseUnits(d.price))} <span className="text-faint">USDC</span>
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                        <td className="px-5 py-3 text-right">
                          <Link href={`/pay/${d.deal_id}?onchain=1`} className="text-mute underline-offset-4 hover:text-bone hover:underline">
                            Open<span className="sr-only"> deal {d.deal_id}</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            {/* Mobile: stacked rows */}
            <ul className="divide-y divide-line rounded-[12px] border border-line bg-ink-900 md:hidden">
              {rows.map((d) => {
                const cp = counterparty(d);
                return (
                  <li key={d.deal_id} className="px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-bone">
                          <span className="font-mono tabular text-faint">#{d.deal_id}</span> {d.item || "Untitled"}
                        </p>
                        <p className="mt-1 font-mono tabular text-bone">
                          {formatUsdc(usdcFromBaseUnits(d.price))} <span className="text-faint">USDC</span>
                        </p>
                      </div>
                      <StatusBadge status={d.status} />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1 text-faint">
                        {cp.role} <ChainValue value={cp.account} label={`${cp.role.toLowerCase()} account`} />
                      </span>
                      <Link href={`/pay/${d.deal_id}?onchain=1`} className="flex h-11 items-center px-2 text-mute hover:text-bone">
                        Open<span className="sr-only"> deal {d.deal_id}</span>
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <p className="mt-8 text-sm text-faint">
        The contract stores no timestamps or transaction list, so no dates are shown.{" "}
        <a
          href={explorerAccountUrl(contractId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-mute underline-offset-4 hover:text-bone hover:underline"
        >
          View all contract activity on NearBlocks
          <ExternalLink aria-hidden="true" strokeWidth={1.5} className="size-3.5" />
        </a>
      </p>
      <p className="mt-2 text-sm text-faint">Disputes are resolved manually in v1, and time out to a refund if unresolved.</p>
    </main>
  );
}
