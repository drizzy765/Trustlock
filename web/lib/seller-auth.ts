import { keyStores } from "near-api-js";
import { network } from "./config";

/**
 * Proof that this browser controls the seller's NEAR account, for the agent's seller writes.
 *
 * Signs a NEP-413 message ({action, seller_id, timestamp} JSON, a random 32-byte nonce, and the
 * recipient "trustlock-agent") with the access key the wallet created for Podlock (formerly TrustLock) at sign-in.
 * The agent checks the signature, the age (5 minutes), the nonce (single use) and, over NEAR RPC,
 * that the key belongs to the seller account. The private key never leaves the browser.
 */
export type SellerAction = "set_provider" | "set_key" | "delete_key" | "test" | "ask";

export const SELLER_AUTH_HEADER = "X-TrustLock-Auth";
const RECIPIENT = process.env.NEXT_PUBLIC_AGENT_AUTH_RECIPIENT ?? "trustlock-agent";
const NEP413_TAG = 2 ** 31 + 413;

function u32(n: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n, true);
  return out;
}

function borshString(value: string): Uint8Array {
  const raw = new TextEncoder().encode(value);
  return concat(u32(raw.length), raw);
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function base64(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
}

export async function sellerAuthHeader(sellerId: string, action: SellerAction): Promise<Record<string, string>> {
  const keyPair = await new keyStores.BrowserLocalStorageKeyStore().getKey(network, sellerId);
  if (!keyPair) throw new Error("Reconnect your wallet so Podlock can confirm you own this account.");
  const message = JSON.stringify({ action, seller_id: sellerId, timestamp: Date.now() });
  const nonce = crypto.getRandomValues(new Uint8Array(32));
  // NEP-413: sha256(borsh(u32 tag) ++ borsh({message, nonce, recipient, callbackUrl: None}))
  const payload = concat(u32(NEP413_TAG), borshString(message), nonce, borshString(RECIPIENT), new Uint8Array([0]));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
  const { signature } = keyPair.sign(digest);
  const proof = { public_key: keyPair.getPublicKey().toString(), signature: base64(signature), nonce: base64(nonce), message };
  return { [SELLER_AUTH_HEADER]: btoa(JSON.stringify(proof)) };
}
