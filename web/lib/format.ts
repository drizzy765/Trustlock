import { network } from "./config";

/** USDC has 6 decimals on NEAR. Base units in, a 2-decimal display string out. */
const usdc = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatUsdc(amount: number): string {
  return usdc.format(Number.isFinite(amount) ? amount : 0);
}

export function usdcFromBaseUnits(raw: string | number | null | undefined): number {
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

export function explorerBase(): string {
  return network === "mainnet" ? "https://nearblocks.io" : "https://testnet.nearblocks.io";
}

export function explorerAccountUrl(accountId: string): string {
  return `${explorerBase()}/address/${accountId}`;
}

export function explorerTxUrl(hash: string): string {
  return `${explorerBase()}/txns/${hash}`;
}

/** Truncate in the middle so both ends of an account or hash stay readable. */
export function middle(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
