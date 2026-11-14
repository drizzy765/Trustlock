import { providers } from "near-api-js";
import type { FinalExecutionOutcome } from "near-api-js/lib/providers";
import { contractId } from "./config";
import {
  getAccountId as selectorAccountId,
  getActiveWallet,
  getModal,
  getNetworkConfig,
  setupSelector,
  signOut as selectorSignOut,
} from "./wallet";

export { getExplorerUrl } from "./wallet";

const CREATE_GAS = "300000000000000";
const FUND_GAS = "50000000000000";
const NO_DEPOSIT = "0";
const ONE_YOCTO = "1";

/** First transaction hash found on a selector send outcome, whatever its shape. */
export function txHashOf(outcome: unknown): string {
  const o = outcome as {
    transaction?: { hash?: string; id?: string };
    transaction_outcome?: { id?: string };
  };
  const hash = o?.transaction?.hash ?? o?.transaction?.id ?? o?.transaction_outcome?.id;
  if (!hash) throw new Error("Transaction produced no hash");
  return hash;
}

/**
 * Initialise the wallet selector (Meteor Wallet, testnet) and report the
 * signed-in account, if any. Safe to call on every page load.
 */
export async function initNear(): Promise<{ accountId: string | null }> {
  await setupSelector();
  return { accountId: await selectorAccountId() };
}

export async function isSignedIn(): Promise<boolean> {
  return (await selectorAccountId()) !== null;
}

export async function getAccountId(): Promise<string | null> {
  return selectorAccountId();
}

/** Open the selector's Connect modal (Meteor Wallet on testnet). */
export async function signIn(): Promise<void> {
  (await getModal()).show();
}

export async function signOut(): Promise<void> {
  await selectorSignOut();
}

async function sendFunctionCall(options: {
  receiverId: string;
  methodName: string;
  args: object;
  gas?: string;
  deposit?: string;
}): Promise<FinalExecutionOutcome> {
  const wallet = await getActiveWallet();
  if (!wallet) throw new Error("Connect a wallet first");
  const outcome = await wallet.signAndSendTransaction({
    receiverId: options.receiverId,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: options.methodName,
          args: options.args,
          gas: options.gas ?? CREATE_GAS,
          deposit: options.deposit ?? NO_DEPOSIT,
        },
      },
    ],
  });
  if (!outcome) throw new Error("Transaction was not completed");
  return outcome;
}

// Contract method wrappers (every write goes through the connected wallet).

export async function createDeal(
  seller: string,
  rider: string,
  buyer: string,
  item: string,
  price: string,
  deadlineMs: number,
  qrHashHex: string
) {
  return sendFunctionCall({
    receiverId: contractId,
    methodName: "create_deal",
    args: { seller, rider, buyer, item, price, deadline_ms: deadlineMs, qr_hash_hex: qrHashHex },
    gas: CREATE_GAS,
    deposit: NO_DEPOSIT,
  });
}

export async function confirmDelivery(dealId: number, qrPreimageHex: string) {
  return sendFunctionCall({
    receiverId: contractId,
    methodName: "confirm_delivery",
    args: { deal_id: dealId, qr_preimage_hex: qrPreimageHex },
    gas: CREATE_GAS,
    deposit: NO_DEPOSIT,
  });
}

/** Buyer one-tap release when the item arrived without a rider scan. */
export async function confirmReceipt(dealId: number) {
  return sendFunctionCall({
    receiverId: contractId,
    methodName: "confirm_receipt",
    args: { deal_id: dealId },
    gas: FUND_GAS,
    deposit: NO_DEPOSIT,
  });
}

/** Refund the buyer after the deadline passed with no delivery. */
export async function claimTimeoutRefund(dealId: number) {
  return sendFunctionCall({
    receiverId: contractId,
    methodName: "claim_timeout_refund_for",
    args: { deal_id: dealId },
    gas: CREATE_GAS,
    deposit: NO_DEPOSIT,
  });
}

export async function fundDeal(dealId: number, amount: string, usdcContractId: string) {
  const wallet = await getActiveWallet();
  if (!wallet) throw new Error("Connect a wallet first");

  // Call ft_transfer_call on the USDC token contract.
  // msg is the plain deal_id string (e.g. "1"), NOT JSON.
  const outcome = await wallet.signAndSendTransaction({
    receiverId: usdcContractId,
    actions: [
      {
        type: "FunctionCall",
        params: {
          methodName: "ft_transfer_call",
          args: {
            receiver_id: contractId,
            amount,
            msg: dealId.toString(),
          },
          gas: FUND_GAS,
          deposit: ONE_YOCTO, // 1 yoctoNEAR required by NEP-141
        },
      },
    ],
  });
  if (!outcome) throw new Error("Transaction was not completed");
  return outcome;
}

// View calls go straight to RPC — no wallet needed.

function rpcProvider() {
  return new providers.JsonRpcProvider({ url: getNetworkConfig().nodeUrl });
}

function decodeCallResult(result: Array<number>): unknown {
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(result)));
}

export async function getDeal(dealId: number) {
  const provider = rpcProvider();
  const res = (await provider.query({
    request_type: "call_function",
    account_id: contractId,
    method_name: "get_deal",
    args_base64: btoa(JSON.stringify({ deal_id: dealId })),
    finality: "optimistic",
  })) as unknown as { result: Array<number> };
  if (!res || !Array.isArray(res.result)) throw new Error("Bad get_deal response");
  return decodeCallResult(res.result);
}
