import { getActiveWallet } from "./wallet";

/** Who the signed message is for. The agent rejects anything else. */
export const SELLER_AUTH_RECIPIENT = "trustlock-agent";

/** Header the seller pages attach to agent calls. Never rename it. */
export const SELLER_AUTH_HEADER = "X-TrustLock-Auth";

/** The exact sentence the seller signs. The agent checks it byte for byte. */
export function sellerAuthMessage(accountId: string): string {
  return `TrustLock seller auth:${accountId}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export interface SellerAuthEnvelope {
  account_id: string;
  message: string;
  /** 32 fresh random bytes, base64. */
  nonce: string;
  recipient: string;
  public_key: string;
  /** ed25519 signature of the NEP-413 payload, base64. */
  signature: string;
}

/**
 * Sign the NEP-413 seller-auth payload with the connected wallet and return
 * the value for the X-TrustLock-Auth header. No local keys are used: the
 * wallet holds the only key, and the signature never leaves this envelope.
 */
export async function sellerAuthHeader(accountId: string): Promise<Record<string, string>> {
  const wallet = await getActiveWallet();
  if (!wallet) throw new Error("Connect a wallet first");
  if (typeof wallet.signMessage !== "function") {
    throw new Error("This wallet cannot sign messages");
  }

  const accounts = await wallet.getAccounts();
  const account = accounts[0]?.accountId;
  if (!account || (accountId && account !== accountId)) {
    throw new Error("Connect the seller wallet first");
  }

  const nonce = crypto.getRandomValues(new Uint8Array(32));
  const signed = await wallet.signMessage({
    message: sellerAuthMessage(account),
    recipient: SELLER_AUTH_RECIPIENT,
    nonce: nonce as Buffer,
  });
  if (!signed) throw new Error("Message signing was rejected");

  const envelope: SellerAuthEnvelope = {
    account_id: signed.accountId || account,
    message: sellerAuthMessage(account),
    nonce: bytesToBase64(nonce),
    recipient: SELLER_AUTH_RECIPIENT,
    public_key: signed.publicKey,
    signature: signed.signature,
  };
  return { [SELLER_AUTH_HEADER]: bytesToBase64(new TextEncoder().encode(JSON.stringify(envelope))) };
}
