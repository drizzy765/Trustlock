import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { connect, keyStores, WalletConnection, utils } from "near-api-js";
import { contractId, network } from "./config";

// NEAR wallet configuration
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

let selector: any = null;
let modal: any = null;

export async function setupSelector() {
  if (selector) return selector;

  const config = getConfig();
  
  selector = await setupWalletSelector({
    network: config.networkId as any,
    modules: [setupMyNearWallet()],
  });

  modal = setupModal(selector, {
    contractId: contractId,
    methodNames: [],
  });

  return selector;
}

export async function getModal() {
  if (!modal) {
    await setupSelector();
  }
  return modal;
}

export async function getAccount() {
  const sel = await setupSelector();
  const accounts = await sel.getAccounts();
  return accounts[0] || null;
}

export async function signOut() {
  const sel = await setupSelector();
  const wallet = await sel.wallet();
  await wallet.signOut();
}

export function getExplorerUrl(txHash: string) {
  const config = getConfig();
  return `${config.explorerUrl}/txns/${txHash}`;
}
