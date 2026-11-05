# Submission checklist — NEAR HACKATHON

Read the live brief again the day you submit: https://nearhackathon.com/HACKATHON.md

- Development ends: 14 November 2026, 23:59 UTC
- Judging: 16–18 November 2026
- One submission per project, POST https://nearhackathon.com/api/applications
- **Do not include a `website` field** (spam trap)
- Print the payload, wait for Timi to say yes, then send
- If something needs fixing later: https://nearhackathon.com/request-changes — do not resubmit a second application
- Repo must be public
- Demo lives in an X post that tags **@NEARProtocol** and **#NEARHackathon** and includes a video (screenshots alone are not enough if judges cannot see the product, Q-012)
- AI tools screen first: code runs, README matches reality (Q-017)
- Tracks for us: `realworld`, `business`
- Q-015: one person may have at most two independent NEAR projects; each README names the other. If Timi only submits TrustLock, this is N/A
- Q-007: Intents has no testnet. Dry quotes + optional tiny mainnet
- Q-010: testnet-only is eligible — be honest if you ship that
- Q-006: 1Click JWT is optional (0.2% fee without); sign up at partners.near-intents.org if you want it

## Repo hygiene

- [ ] No `.env`, no key files, no JWT in git
- [ ] `README.md` do-X-see-Y steps actually work
- [ ] `cargo test` (and workspaces tests you claim) are green
- [ ] Agent `/health` and injection fixture behave as documented
- [ ] Mode badges (`demo` / `dry` / `live`) match the backend
- [ ] LICENSE MIT
- [ ] Sibling micro1 repo mentioned only if NEAR Q-015 applies (it does not, different contest)

## Product claims you are allowed to make

- Rider QR is the release trigger
- Scoped rider key
- Deterministic receipt check for naira funding (and the published Sell-Safe headline numbers, which are not this repo's runtime proof — phrase them as prior art)
- Intents execution only if you really executed

## Product claims you are not allowed to make

- "Mainnet" without an explorer link
- "WhatsApp live" (it is waitlisted)
- "AI escrow" as if Muse signs the payout

## X post

See `docs/x_post_draft.md`. Free accounts: 280 characters. Timi does not have X Premium.

## After the deadline

Do not quietly rewrite history in the README if judges are mid-review. Use request-changes if they ask.
