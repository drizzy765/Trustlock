import {
  setupWalletSelector,
  type WalletSelector,
} from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { contractId, network } from "./config";

// Testnet-first wallet configuration. Meteor Wallet carries the connection;
// MyNearWallet no longer accepts new app connections, so it is not listed.
const getConfig = () => {
  switch (network) {
    case "mainnet":
      return {
        networkId: "mainnet",
        nodeUrl: "https://rpc.mainnet.near.org",
        helperUrl: "https://helper.mainnet.near.org",
        explorerUrl: "https://nearblocks.io",
      };
    case "testnet":
    default:
      return {
        networkId: "testnet",
        nodeUrl: "https://rpc.testnet.near.org",
        helperUrl: "https://helper.testnet.near.org",
        explorerUrl: "https://testnet.nearblocks.io",
      };
  }
};

export function getNetworkConfig() {
  return getConfig();
}

let selector: WalletSelector | null = null;
let selectorReady: Promise<WalletSelector> | null = null;
let modal: WalletSelectorModal | null = null;

async function buildSelector(): Promise<WalletSelector> {
  const config = getConfig();
  const next = await setupWalletSelector({
    network: config.networkId as "mainnet" | "testnet",
    modules: [setupMeteorWallet()],
  });
  modal = setupModal(next, {
    contractId,
    description: "Connect a testnet wallet to use TrustLock.",
  });
  selector = next;
  return next;
}

export async function setupSelector(): Promise<WalletSelector> {
  if (selector) return selector;
  if (!selectorReady) selectorReady = buildSelector();
  try {
    return await selectorReady;
  } catch (e) {
    selectorReady = null;
    throw e;
  }
}

/** The selector's Connect modal. This is what every Connect button opens. */
export async function getModal(): Promise<WalletSelectorModal> {
  await setupSelector();
  if (!modal) throw new Error("Wallet modal is not ready");
  return modal;
}

/** The signed-in wallet, or null when nothing is connected. */
export async function getActiveWallet() {
  const sel = await setupSelector();
  const state = sel.store.getState();
  if (!state.selectedWalletId) return null;
  try {
    return await sel.wallet();
  } catch {
    return null;
  }
}

export async function getAccount() {
  const sel = await setupSelector();
  const state = sel.store.getState();
  const account = state.accounts[0] ?? null;
  if (!account) return null;
  return { accountId: account.accountId, publicKey: account.publicKey ?? null };
}

export async function getAccountId(): Promise<string | null> {
  const account = await getAccount();
  return account?.accountId ?? null;
}

export async function signOut() {
  const wallet = await getActiveWallet();
  if (wallet) await wallet.signOut();
}

export function getExplorerUrl(txHash: string) {
  const config = getConfig();
  return `${config.explorerUrl}/txns/${txHash}`;
}
