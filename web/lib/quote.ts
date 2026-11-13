import { agentUrl } from "./config";

export type Mode = "demo" | "dry" | "live";

/** A quote from the agent. Amounts are only meaningful when signature_verified. */
export interface Quote {
  mode: Mode;
  dry: boolean;
  quote_id: string;
  correlation_id: string | null;
  signature: string;
  signer: string;
  signature_verified: boolean;
  origin_asset: string;
  destination_asset: string;
  recipient: string;
  amount_in: string | null;
  amount_in_formatted: string | null;
  amount_in_usd: string | null;
  amount_out: string | null;
  amount_out_formatted: string | null;
  amount_out_usd: string | null;
  min_amount_out: string | null;
  deadline: string | null;
  expired: boolean;
  deposit_address: string | null;
  tx_hash: string | null;
  executed: boolean;
  created_at: string;
}

export interface Health {
  ok: boolean;
  mode: Mode;
  intents_mode: Mode;
  network: string;
  contract: string;
}

export async function fetchHealth(): Promise<Health | null> {
  try {
    const response = await fetch(`${agentUrl}/health`);
    if (!response.ok) return null;
    return (await response.json()) as Health;
  } catch {
    return null;
  }
}

export async function fetchQuote(dealId: number): Promise<Quote> {
  const response = await fetch(`${agentUrl}/intents/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deal_id: dealId }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Quote failed (${response.status})`);
  }
  return data as Quote;
}

/**
 * `live` requires proof, not a dropdown: the quote must be verified, labelled live,
 * and carry both a real execute and a transaction hash.
 */
export function displayMode(quote: Quote | null, fallback: Mode): Mode {
  if (quote?.signature_verified && quote.mode === "live" && quote.executed && quote.tx_hash) {
    return "live";
  }
  if (quote?.dry) return "dry";
  return fallback === "live" ? "demo" : fallback;
}

const ISO_DEADLINE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse the quote deadline strictly. Returns null for anything that is not an
 * ISO 8601 datetime with a real calendar date, so callers fail closed.
 */
export function quoteDeadlineMs(quote: Quote | null): number | null {
  const value = quote?.deadline;
  const match = value ? ISO_DEADLINE.exec(value) : null;
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const zone = match[8];

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const check = new Date(localAsUtc);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second ||
    check.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  if (zone === "Z") return localAsUtc;

  const sign = zone[0] === "-" ? -1 : 1;
  const offsetHours = Number(zone.slice(1, 3));
  const offsetMinutes = Number(zone.slice(4, 6));
  if (
    offsetHours > 14 ||
    offsetMinutes > 59 ||
    (offsetHours === 14 && offsetMinutes !== 0)
  ) {
    return null;
  }
  return localAsUtc - sign * (offsetHours * 60 + offsetMinutes) * 60_000;
}

/** Expired unless the quote carries a valid deadline in the future. */
export function isQuoteExpired(quote: Quote | null, now = Date.now()): boolean {
  const deadline = quoteDeadlineMs(quote);
  return deadline === null || deadline <= now;
}

/** An amount is renderable only after verification and before the deadline. */
export function verifiedAmount(quote: Quote | null, now = Date.now()): string | null {
  if (!quote?.signature_verified || isQuoteExpired(quote, now)) return null;
  return quote.amount_out_formatted ?? null;
}

export function usableQuote(quote: Quote | null, now = Date.now()): quote is Quote {
  return Boolean(quote?.signature_verified && !isQuoteExpired(quote, now));
}

export function shortQuoteId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-6)}` : id;
}

export function assetLabel(asset: string | null | undefined): string {
  if (!asset) return "unknown";
  if (asset === "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1") {
    return "NEAR";
  }
  if (asset.includes("base-")) return "Base";
  if (asset.includes("arb-")) return "Arbitrum";
  if (asset.includes("eth-0x")) return "Ethereum";
  if (asset.includes("sol-")) return "Solana";
  if (asset.includes("pol-")) return "Polygon";
  if (asset.includes("bnb-")) return "BNB Chain";
  return "another chain";
}
