# Testnet accounts and wallet addresses

**Short answer: there is no shared TrustLock wallet or contract address yet.** The contract has not been deployed. `trustlock.testnet` in `.env.example` and `web/lib/config.ts` is a placeholder default; that account does not exist on NEAR testnet. When the contract is deployed (issue #10), its account ID will be posted to the team and added to the table below.

## Live addresses

| What | Account ID | Status |
| --- | --- | --- |
| Escrow contract | _TBD (set `TRUSTLOCK_CONTRACT_ID` / `NEXT_PUBLIC_CONTRACT_ID`)_ | Not deployed yet (#10) |
| Test token (fake USDC, NEP-141) | `usdc.fakes.testnet` | Exists on testnet; not real USDC |

## Do I need my own account?

- **Contract unit tests (`cargo test`) and near-workspaces integration tests (#5, #6):** no. near-workspaces runs a local sandbox with throwaway accounts.
- **Manual testnet runs, the rider key script (#7) and the end-to-end demo (#10):** yes. Each developer uses their own free testnet account.

## Create a testnet account

Option A: browser wallet at https://testnet.mynearwallet.com/ (free, funded by the faucet).

Option B: `near-cli-rs`:

```bash
near account create-account sponsor-by-faucet-service <yourname>-trustlock.testnet \
  autogenerate-new-keypair save-to-keychain network-config testnet create
```

Then create role subaccounts that match `.env.example` (owner, buyer, seller, rider), for example:

```bash
near account create-account fund-myself seller.<yourname>-trustlock.testnet '1 NEAR' \
  autogenerate-new-keypair save-to-keychain sign-as <yourname>-trustlock.testnet \
  network-config testnet sign-with-keychain send
```

Put the **public account IDs** in your local `.env` (`TRUSTLOCK_OWNER_ACCOUNT`, `TRUSTLOCK_SELLER_ACCOUNT`, `TRUSTLOCK_BUYER_ACCOUNT`, `TRUSTLOCK_RIDER_ACCOUNT`) and only **paths** to key files in `TRUSTLOCK_OWNER_KEYFILE` / `TRUSTLOCK_RIDER_KEYFILE`.

## Rules

- Never commit or paste in chat: private keys, seed phrases, `.env`, or `~/.near-credentials`. Only public account IDs are shared.
- Testnet only. Any mainnet step needs team agreement and stays well under $1 (see `AGENTS.md`).
- The rider key is a function-call access key that may only call `confirm_delivery` (#6, #7).
