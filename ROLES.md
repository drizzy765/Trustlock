# Podlock roles

Team for the NEAR Hackathon (deadline: 14 November 2026, 23:59 UTC). Issues live under the [NEAR Hackathon submit (Nov 14)](https://github.com/drizzy765/Trustlock/milestone/1) milestone.

## Agoro Oluwatimilehin (Timi), [@drizzy765](https://github.com/drizzy765)

Role: contract, frontend and delivery lead. Repo owner and the only person who submits the hackathon application.

- Escrow contract (`contract/`): state machine, unit tests for every panic path (#5).
- Web app (`web/`): `/pay`, `/scan` and `/dashboard`, testnet wallet selector, mode badges (#8).
- 1Click / Intents quote client with signature verification (#9).
- Testnet end-to-end run: create deal, fund, rider scan, seller paid (#10).
- README judge path kept honest (#13).
- Demo video, X post and submission (#12).
- Stretch: tiny mainnet USDC transfer (#11), multi-currency quotes (#14), one-command judge demo (#17), `resolve_dispute` (#18).

## Brayan Sorgho, [@Sorghobrayan-dotcom](https://github.com/Sorghobrayan-dotcom)

Role: deal agent lead (`agent/`).

- Multilingual deal preview in Pidgin, Yoruba and English; the agent refuses to release funds or return keys (#2).
- Agent API: `POST /deals/draft` and `GET /deals/{deal_id}` (#4).
- Agent tests for the features above.
- Stretch: mobile-money context (#15), SMS / USSD-style fallback copy (#16), Swahili and French targets (#19).

## Ajiboye Toluwalase, [@metrosmash](https://github.com/metrosmash)

Role: NEAR Intents / 1Click.

- Real 1Click dry quotes with signature verification (#45).
- Quote deadline enforcement (#47).
- Mobile-money context in the docs, with no live rail claimed (#48).

## Shared rules

- Work on a branch; open a PR that links its issue (`Closes #N`).
- Merge only with green CI, a CodeRabbit review and one teammate approval.
- The testnet scan-and-pay run (#10) comes before polish.
- Feature freeze Friday 14 November, morning UTC; after that only fixes, README, video and submission.
- Never commit `.env`, keys or seed phrases. Use testnet unless the team agrees on a mainnet step.
- Only claim in the README and video what the code and tests actually do.
- Short daily check-in: done, next, blocked.
