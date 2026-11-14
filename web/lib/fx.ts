/**
 * Local-currency display for sellers. Escrow is always USDC: a local amount is only
 * converted to USDC in the browser, and the USDC amount is what goes to the contract.
 * Rates come from free, no-key sources, fetched client-side and cached for an hour.
 */

export type Currency = "USDC" | "NGN" | "KES" | "GHS" | "ZAR" | "EGP" | "XOF";
export type LocalCurrency = Exclude<Currency, "USDC">;

export const CURRENCIES: { code: Currency; label: string }[] = [
  { code: "USDC", label: "USDC" },
  { code: "NGN", label: "NGN, Nigerian naira" },
  { code: "KES", label: "KES, Kenyan shilling" },
  { code: "GHS", label: "GHS, Ghanaian cedi" },
  { code: "ZAR", label: "ZAR, South African rand" },
  { code: "EGP", label: "EGP, Egyptian pound" },
  { code: "XOF", label: "XOF, West African CFA franc" },
];

const LOCAL: LocalCurrency[] = ["NGN", "KES", "GHS", "ZAR", "EGP", "XOF"];

export function isLocalCurrency(value: unknown): value is LocalCurrency {
  return typeof value === "string" && (LOCAL as string[]).includes(value);
}

export interface FxRates {
  /** Units of each local currency per 1 USD (USDC is treated as 1 USD). */
  rates: Record<LocalCurrency, number>;
  source: string;
  sourceUrl: string;
  updatedAt: string; // ISO time the provider last updated
}

const CACHE_KEY = "trustlock:fx:v1";
const CACHE_MS = 60 * 60 * 1000;

function pick(raw: Record<string, unknown>, upper: boolean): Record<LocalCurrency, number> | null {
  const out = {} as Record<LocalCurrency, number>;
  for (const code of LOCAL) {
    const v = raw[upper ? code : code.toLowerCase()];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    out[code] = v;
  }
  return out;
}

async function fromOpenErApi(): Promise<FxRates> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error(`open.er-api ${res.status}`);
  const data = await res.json();
  const rates = data?.result === "success" ? pick(data.rates ?? {}, true) : null;
  if (!rates) throw new Error("open.er-api returned no rates");
  const updated = typeof data.time_last_update_unix === "number" ? new Date(data.time_last_update_unix * 1000) : new Date();
  return { rates, source: "ExchangeRate-API", sourceUrl: "https://www.exchangerate-api.com", updatedAt: updated.toISOString() };
}

async function fromFawazCdn(): Promise<FxRates> {
  const res = await fetch("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json");
  if (!res.ok) throw new Error(`currency-api ${res.status}`);
  const data = await res.json();
  const rates = pick(data?.usd ?? {}, false);
  if (!rates) throw new Error("currency-api returned no rates");
  const updated = typeof data.date === "string" ? new Date(`${data.date}T00:00:00Z`) : new Date();
  return { rates, source: "fawazahmed0 currency-api", sourceUrl: "https://github.com/fawazahmed0/exchange-api", updatedAt: updated.toISOString() };
}

function readCache(): FxRates | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; value: FxRates };
    if (Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache(value: FxRates) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), value }));
  } catch {
    /* storage unavailable: rates are just refetched next time */
  }
}

let inflight: Promise<FxRates> | null = null;

/** Rates from the primary source, then the fallback. Throws if both fail. */
export function loadRates(): Promise<FxRates> {
  const cached = typeof window !== "undefined" ? readCache() : null;
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fromOpenErApi()
      .catch(() => fromFawazCdn())
      .then((value) => {
        writeCache(value);
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Local amount to USDC, rounded down to 0.001 USDC (the draft price precision). */
export function toUsdc(localAmount: number, currency: LocalCurrency, fx: FxRates): number {
  const rate = fx.rates[currency];
  if (!rate || !Number.isFinite(localAmount) || localAmount <= 0) return 0;
  return Math.floor((localAmount / rate) * 1000) / 1000;
}

export function fromUsdc(usdcAmount: number, currency: LocalCurrency, fx: FxRates): number {
  return usdcAmount * (fx.rates[currency] ?? 0);
}

export function formatLocal(amount: number, currency: LocalCurrency): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount).toLocaleString("en")} ${currency}`;
  }
}

export function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });
}
