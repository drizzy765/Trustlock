import { connect, Contract, keyStores, WalletConnection } from "near-api-js";
import { contractId, network } from "./config";

const getConfig = () => {
  switch (network) {
    case "mainnet":
      return {
        networkId: "mainnet",
        nodeUrl: "https://rpc.mainnet.near.org",
        walletUrl: "https://wallet.near.org",
        helperUrl: "https://helper.mainnet.near.org",
        explorerUrl: "https://nearblocks.io",
      };
    case "testnet":
    default:
      return {
        networkId: "testnet",
        nodeUrl: "https://rpc.testnet.near.org",
        walletUrl: "https://testnet.mynearwallet.com",
        helperUrl: "https://helper.testnet.near.org",
        explorerUrl: "https://testnet.nearblocks.io",
      };
  }
};

let near: any = null;
let wallet: WalletConnection | null = null;
let contract: any = null;

let initPromise: Promise<{ near: any; wallet: WalletConnection; contract: any }> | null = null;

async function doInit() {
  const config = getConfig();
  const keyStore = new keyStores.BrowserLocalStorageKeyStore();

  const n = await connect({
    networkId: config.networkId,
    nodeUrl: config.nodeUrl,
    walletUrl: config.walletUrl,
    helperUrl: config.helperUrl,
    keyStore,
  });

  const w = new WalletConnection(n, "trustlock");

  const c = new Contract(w.account(), contractId, {
    viewMethods: ["get_deal"],
    changeMethods: ["create_deal", "confirm_delivery"],
    useLocalViewExecution: false,
  });

  // Commit only after every step succeeded, so a failed attempt can be retried
  // instead of leaving `near` set and `wallet` null (which made signIn a silent no-op).
  near = n;
  wallet = w;
  contract = c;
  return { near, wallet: w, contract };
}

/** Initialise near-api-js once. Concurrent callers share one attempt; a failed attempt is retried next time. */
export function initNear() {
  if (near && wallet && contract) return Promise.resolve({ near, wallet, contract });
  if (!initPromise) {
    initPromise = doInit().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

/** initNear with a time limit, for UI that must not wait forever. */
export function initNearWithTimeout(ms = 8000) {
  return Promise.race([
    initNear(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("NEAR wallet setup timed out")), ms)),
  ]);
}

export function getWallet() {
  return wallet;
}

export function getContract() {
  return contract;
}

export function isSignedIn() {
  return wallet?.isSignedIn() || false;
}

export function getAccountId() {
  return wallet?.getAccountId() || null;
}

/** Redirects to MyNearWallet. Initialises on demand and throws if the wallet can't be set up. */
export async function signIn(opts: { successUrl?: string } = {}) {
  const { wallet: w } = await initNearWithTimeout();
  await w.requestSignIn({ contractId, keyType: "ed25519", ...(opts.successUrl ? { successUrl: opts.successUrl } : {}) });
}

export function signOut() {
  wallet?.signOut();
}

export function getExplorerUrl(txHash: string) {
  const config = getConfig();
  return `${config.explorerUrl}/txns/${txHash}`;
}

// Contract method wrappers
export async function createDeal(
  seller: string,
  rider: string,
  buyer: string,
  item: string,
  price: string,
  deadlineMs: number,
  qrHashHex: string
) {
  if (!contract) await initNear();
  return contract.create_deal(
    { seller, rider, buyer, item, price, deadline_ms: deadlineMs, qr_hash_hex: qrHashHex },
    "300000000000000", // 300 Tgas
    "0" // not #[payable]; a deposit panics. Zero also lets the function-call access key sign without a wallet redirect.
  );
}

export async function getDeal(dealId: number) {
  if (!contract) await initNear();
  return contract.get_deal({ deal_id: dealId });
}

export async function confirmDelivery(dealId: number, qrPreimageHex: string) {
  if (!contract) await initNear();
  return contract.confirm_delivery(
    { deal_id: dealId, qr_preimage_hex: qrPreimageHex },
    "300000000000000", // 0.3 NEAR for gas
    "0"
  );
}

export async function fundDeal(dealId: number, amount: string, usdcContractId: string) {
  if (!wallet) await initNear();
  if (!wallet) throw new Error("Wallet not initialized");
  
  const account = wallet.account();
  
  // Call ft_transfer_call on USDC token contract
  // msg is the plain deal_id string (e.g., "1"), NOT JSON
  return account.functionCall({
    contractId: usdcContractId,
    methodName: "ft_transfer_call",
    args: {
      receiver_id: contractId,
      amount: amount,
      msg: dealId.toString()
    },
    gas: BigInt("50000000000000"), // 50 Tgas
    attachedDeposit: BigInt(1) // 1 yoctoNEAR required by NEP-141
  });
}
