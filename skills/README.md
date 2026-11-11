# Skills and references (TrustLock)

Only links that returned HTTP 200 when checked on 5 November 2026 are listed. Dead hosts and 404s are at the bottom — do not resurrect them.

Install official NEAR skills into an agent with:

```powershell
npx skills add near/agent-skills
```

That repo ships: `near-ai-cloud`, `near-api-js`, `near-dapp`, `near-intents`, `near-kit`, `near-smart-contracts`.

## Contest and tracks

| Resource | URL |
| --- | --- |
| NEAR HACKATHON | https://nearhackathon.com |
| Official brief | https://nearhackathon.com/HACKATHON.md |
| Prompt examples | https://github.com/nearai/near-hackathon-prompt-examples |
| realworld track note | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/08-realworld.md |
| business track note | https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/04-business.md |

## Official NEAR agent skills and MCP

| Resource | URL |
| --- | --- |
| near/agent-skills | https://github.com/near/agent-skills |
| near-mcp | https://github.com/nearai/near-mcp |
| Tools for AI | https://docs.near.org/getting-started/tools-for-ai |
| NEAR AI Cloud (signin) | https://cloud.near.ai |

## Contracts, keys, JS

| Resource | URL |
| --- | --- |
| near-sdk-rs | https://github.com/near/near-sdk-rs |
| near-sdk rustdocs | https://docs.rs/near-sdk/latest/near_sdk/ |
| cargo-near | https://github.com/near/cargo-near |
| near-workspaces-rs | https://github.com/near/near-workspaces-rs |
| What is a smart contract | https://docs.near.org/smart-contracts/what-is |
| Access keys (function-call) | https://docs.near.org/protocol/accounts-contracts/access-keys |
| NEAR docs home | https://docs.near.org/ |
| near-api-js | https://github.com/near/near-api-js |
| near-api tools | https://docs.near.org/tools/near-api |
| RPC providers | https://docs.near.org/api/rpc/providers |

The URL `https://docs.near.org/protocol/access-keys` redirects to the same access-keys page and also returned 200.

## Intents / 1Click

| Resource | URL |
| --- | --- |
| Intents docs | https://docs.near-intents.org/ |
| 1Click API (canonical) | https://docs.near-intents.org/integration/distribution-channels/1click-api |
| Token list | https://1click.chaindefuser.com/v0/tokens |
| near/intents | https://github.com/near/intents |
| Partner JWT signup (auth wall, not public docs) | https://partners.near-intents.org |

## Neighbour projects (read, do not copy secrets or large verbatim chunks)

| Project | URL | Steal |
| --- | --- | --- |
| ClearSend | https://github.com/dukemawex/clearsend-near | Scoped function-call key, README quality. Do not copy LLM-`attest` release |
| Penstock | https://github.com/ace-coderr/penstock | Real mainnet proof, dry/live labels, quote signatures |
| NairaRails | https://github.com/Esimuda/nairarails | African money framing, short problem-first demo |

## Video / motion (optional)

| Resource | URL |
| --- | --- |
| Remotion skills | https://github.com/remotion-dev/skills |
| Remotion docs | https://www.remotion.dev/docs |
| Motion Canvas | https://github.com/motion-canvas/motion-canvas |
| Anthropic skills (format reference) | https://github.com/anthropics/skills |
| Hugging Face skills | https://github.com/huggingface/skills |
| Vercel agent skills | https://github.com/vercel-labs/agent-skills |

On Timi's laptop prefer a screen recording plus a US-English voiceover (same approach as Sell-Safe) over Remotion, unless the build machine can handle it.

## Local skills in this repo

- [`near-contract-dev/SKILL.md`](near-contract-dev/SKILL.md)
- [`intents-payments/SKILL.md`](intents-payments/SKILL.md)
- [`demo-video/SKILL.md`](demo-video/SKILL.md)

## Dropped after the link check (do not use)

- `https://www.near-sdk.io/` — connection failed
- `https://docs.near.org/tutorials/auction/contract` — 404
- `https://docs.near.org/build/smart-contracts/anatomy` — 404
