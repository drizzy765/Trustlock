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

export async function initNear() {
  if (near) return { near, wallet, contract };

  const config = getConfig();
  const keyStore = new keyStores.BrowserLocalStorageKeyStore();

  near = await connect({
    networkId: config.networkId,
    nodeUrl: config.nodeUrl,
    walletUrl: config.walletUrl,
    helperUrl: config.helperUrl,
    keyStore,
  });

  wallet = new WalletConnection(near, "trustlock");

  contract = new Contract(wallet.account(), contractId, {
    viewMethods: ["get_deal"],
    changeMethods: ["create_deal", "confirm_delivery"],
  });

  return { near, wallet, contract };
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

export async function signIn() {
  if (!wallet) await initNear();
  wallet?.requestSignIn({ contractId });
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
    "300000000000000", // 0.3 NEAR for gas + storage
    "100000000000000000000000" // 0.1 NEAR deposit
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
