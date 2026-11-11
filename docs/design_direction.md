# TrustLock design direction

**Status:** proposal for the `web/` frontend (issue [#8](https://github.com/drizzy765/Trustlock/issues/8)). Docs only. Nothing here changes app code.
**Goal:** TrustLock should look and feel like a funded fintech startup, and it must stay honest about what is built.
**Product flow:** this doc follows the confirmed flow in [`docs/end_to_end_flow.md`](end_to_end_flow.md). If the two disagree, the flow doc wins.
**Tagline:** *AI does the work. Cryptography holds the money.*

> **The honesty rule applies to every pixel.** No fake stats, no fake partner or investor logos, no fake testimonials, no "trusted by" rows, and no claim of mainnet or real users until it is true. Every "works with" label means we shipped that integration. Anything else is labelled **planned**.

---

## 1. Brief

```text
Designing: the TrustLock website and app (/, /onboard, /agents, /pay/[dealId], /scan, /dashboard), web, mobile first.
Who: businesses selling remotely, African businesses first, global by design. Sellers share a payment link in ANY chat app (WhatsApp, Telegram, X, SMS, email, Instagram DMs...). Buyers click it with zero setup. Dispatch riders use low-end Android phones. Hackathon judges use laptops.
Goal: seller creates a payment link → buyer pays into NEAR USDC escrow → money releases only on hard proof (buyer one-tap "I received it", or the rider scans the one-time QR). Deadline passes → buyer refunded. Disputes are handled manually in v1.
Tone: calm, expensive, certain. A vault, not a casino.
Main objection: "Crypto escrow sounds risky and complicated, and AI near my money sounds worse."
Must remember: AI does the work, cryptography holds the money. The agent reads, checks, answers and prepares; only the buyer's confirm, the rider's scan or the deadline moves money.
Constraints: Next.js 15 in web/, 3 days to the deadline, testnet first, riders on slow 3G and cheap phones.
```

## 2. Research and references

Refero and Mobbin were tried first, but both MCP subscriptions are inactive (`NO_SUBSCRIPTION` and a "paid plan required" error). So the research used live sites: headless-browser screenshots taken on 11 Nov 2026, their CSS, and their public docs. Every URL below loaded at that time unless it's flagged.

| # | Reference | What we take | What we leave |
|---|---|---|---|
| 1 | **PayBox**, [paybox.sh](https://paybox.sh) (MoonPay's non-custodial payment vault for AI agents. It's the crypto payments one, launched 29 Jul 2026 per [MoonPay's newsroom](https://www.moonpay.com/newsroom/moonpay-paybox-grok)) | **Primary reference.** A near-black (`#141414`) and off-white (`#faf9f9`) system. A cinematic full-bleed photo of real street life with one **frosted-glass 3D cube** (the vault) floating over it. A big plain grotesk headline set bottom-left. Small pill buttons in the nav. Numbered security steps ("01 Keys are sharded… 02 Policies set clear boundaries…"). Glass borders at white/10. Söhne-style grotesk plus mono. | Their stats band ("$50B+ secured · 10M+ wallets*") and "audited by" logos. We have no such facts. Also their paid Söhne font, which we swap for free Geist. |
| 2 | **NEAR**, [near.org](https://near.org) | A dark canvas, a centred short headline, a solid white primary button next to an outlined secondary button, and one animated geometric motif (a field of four-point sparkles). It's the chain we build on, so our pages should sit comfortably next to theirs. | NEAR's brand green as our accent. That's their colour, not ours. |
| 3 | **Flutterwave**, [flutterwave.com](https://flutterwave.com/us/) | **African-seller realism.** Real merchant photography with the business named in the caption ("E25 Dresses"). Copy written for small businesses, not crypto natives. | The orange display serif and the light theme. |
| 4 | **Privy (a Stripe company)**, [privy.io](https://www.privy.io) | Real product mockups in the hero, with a phone over a desktop dashboard. A clean bento grid with one visual per card. Product-UI density for `/dashboard`. | Their customer logo strip. Ours will be a "Built with" strip. |
| 5 | **Linear**, [linear.app](https://linear.app) | Polish rules: hairline borders, a tight type scale, restrained motion, dark product screenshots as the main imagery. | — |

Secondary checks: [stripe.com](https://stripe.com) (WebGL gradient hero, a stats band backed by real numbers), [phantom.com](https://phantom.com) (floating token "blobs" on a dark rounded hero card, pill nav), [mercury.com](https://mercury.com) (banking-grade calm), [yellowcard.io](https://yellowcard.io) and [kotanipay.com](https://www.kotanipay.com) (African stablecoin peers). Paystack (paystack.com) blocks automated fetches, so open it in a browser if you want its African merchant tone. It wasn't used as evidence here.

## 3. The direction: "Glass Vault at the Door"

**One dominant direction.** We use PayBox's cinematic dark vault language and point it at the doorstep of any small business, starting with Lagos, Accra and Nairobi. Each page is a near-black canvas with real, warm, documentary photography of African sellers and dispatch riders. Over the photo floats a single frosted-glass **lock block**, the escrow, rendered as a translucent cube with a soft amber core while funds are locked. When delivery is proven (the buyer taps "I received it" or the rider scans), the block clears, the amber turns to green, and a mono receipt line prints the transaction hash. Type is big, plain and confident (Geist). Every on-chain fact (account IDs, amounts, hashes) is set in Geist Mono, so "this is real data" has its own visual voice.

Signature traits to keep, never water down:
0. **The tagline is the system.** "AI does the work. Cryptography holds the money." The agent gets soft UI (chat bubbles, drafts); money gets hard UI (glass block, mono, chain links).
1. **One object, one photo, one sentence** in the hero. No feature confetti.
2. **Colour means state.** Amber means locked, green means released, blue means refunded, red means a problem. The accent colour is never decoration.
3. **Mono for chain truth.** If it came from the chain, it's in mono with a copy button and an explorer link.
4. **Numbered steps** (01, 02, 03) for anything that explains trust.

Rejected alternatives: light Stripe-style gradients (too generic, and they fight the dark NEAR ecosystem), Afro-pattern maximalism (it reads as a theme rather than as infrastructure), and neon "web3" purple (the generic AI look the user wants to escape).

## 4. Design tokens

Implement these as CSS variables in `web/app/globals.css`. If Tailwind v4 and shadcn are adopted (see §12), map them in `@theme` and in the shadcn variables.

### 4.1 Colour (dark first, with one theme only for the hackathon)

| Token | Hex | Role (only this role) |
|---|---|---|
| `--ink-950` | `#0B0C0B` | Page canvas |
| `--ink-900` | `#131513` | Cards, sheets |
| `--ink-800` | `#1C1F1C` | Raised surfaces, inputs, hover |
| `--line` | `#2A2E2A` | Hairline borders, dividers |
| `--glass` | `rgba(255,255,255,0.06)` + border `rgba(255,255,255,0.12)` | Glass panels over photography only |
| `--bone` | `#F4F2EE` | Primary text, **primary button fill** (dark text on top) |
| `--mute` | `#A3A8A2` | Secondary text (AA on ink-950: about 8:1) |
| `--faint` | `#6B706A` | Tertiary text and placeholders only, never body copy |
| `--lock` | `#F2B544` | **Funded / locked** state, lock-block core glow, the "awaiting rider" pulse |
| `--release` | `#34D27B` | **Released / delivered** success state only |
| `--refund` | `#6EA8FE` | **Expired / refunded** state, informational links inside status |
| `--danger` | `#F0616D` | Errors, disputes, failed scans |
| `--mode` | `#B9A3FF` | **Mode badge only** (DEMO / DRY RUN / TESTNET). It never appears anywhere else, so judges learn "violet = not real money" |

Text on `--lock`, `--release` and `--bone` fills is `--ink-950`. Status chips use a 12% tint background with the full-strength colour for text and dot, for example `rgba(242,181,68,0.12)` with `#F2B544`.

### 4.2 Type (free, Google Fonts, via `next/font/google`)

- **Geist** for display and UI. It's [on Google Fonts](https://fonts.google.com/specimen/Geist) and is the closest free match to PayBox's Söhne-style grotesk.
- **Geist Mono** for account IDs, amounts, hashes, QR codes and the mode badge.
- Fallback: `ui-sans-serif, system-ui` / `ui-monospace`.

| Step | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| display | `clamp(40px, 7vw, 88px)` / 0.95 | 500 | -0.035em | Hero sentence |
| h1 | `clamp(32px, 4.5vw, 56px)` / 1.0 | 500 | -0.03em | Page titles |
| h2 | 28 / 1.1 | 500 | -0.02em | Section titles |
| h3 | 20 / 1.25 | 500 | -0.01em | Card titles |
| body-lg | 18 / 1.55 | 400 | 0 | Hero sub-copy |
| body | 16 / 1.55 | 400 | 0 | Default, **never below 16 on mobile** |
| small | 14 / 1.45 | 400 | 0 | Meta, captions |
| mono | 14 / 1.4 | 400 to 500 | 0 | Chain data; amounts use `font-variant-numeric: tabular-nums` |
| eyebrow | 12 / 1 | 500 | 0.12em, uppercase, mono | Step numbers "01", section labels |

Use `text-wrap: balance` on headings and `text-wrap: pretty` on paragraphs. No italic or serif word swaps in headlines.

### 4.3 Radius, spacing, shadow, motion

- **Radius:** `--r-sm 8px` (chips, inputs), `--r-md 14px` (buttons, cards), `--r-lg 24px` (hero card, sheets), `--r-pill 999px` (nav pills, status chips, mode badge).
- **Spacing (4px base):** 4, 8, 12, 16, 24, 32, 48, 64, 96, 128. Sections get 96px of vertical padding on desktop and 64px on mobile. Gutters are 20px on mobile and 32px on desktop. Max content width is 1200px, and 640px for flows.
- **Shadow:** on dark, depth comes from borders, not shadows. Use one shadow for floating sheets only: `0 8px 30px rgba(0,0,0,0.45)`. The lock block glow is `0 0 80px 10px rgba(242,181,68,0.25)` while locked and the same with `--release` once released.
- **Motion:**
  - Standard `200ms cubic-bezier(0.2, 0.8, 0.2, 1)`. Enter `320ms`. State change (lock to release) `600ms`.
  - Only animate `transform` and `opacity`.
  - Wrap everything in `@media (prefers-reduced-motion: reduce)`, which switches to an instant cross-fade.
  - The **only** looping animation is the slow "awaiting rider" pulse on the lock block (2.4s), and it pauses when off-screen.

## 5. Imagery, 3D and motion research

### 5.1 How crypto and fintech startups use hero visuals (with live examples)

| Pattern | Live example | What it does |
|---|---|---|
| **Glass 3D object over photography** | [paybox.sh](https://paybox.sh) | A frosted cube (the vault) floats over a moody street photo. The object is the metaphor. |
| **Animated geometric field** | [near.org](https://near.org) | Four-point sparkles fill the background. Cheap, on-brand and loops forever. |
| **Floating tokens or blobs** | [phantom.com](https://phantom.com) | Coin-like discs drift on a dark hero card. |
| **WebGL gradient mesh** | [stripe.com](https://stripe.com) | A slow, shader-driven colour wave behind the headline. |
| **Product mockups (phone over desktop)** | [privy.io](https://www.privy.io) | Shows the real UI. The most honest premium move there is. |
| **3D/particle globe** | [privy.io](https://www.privy.io) (bento card) | "Global" shown as a particle sphere. |
| **Real people and merchants** | [flutterwave.com](https://flutterwave.com/us/) | Named small businesses in photos. Strongest for African trust. |
| **Dark product screenshots** | [linear.app](https://linear.app) | The UI itself is the hero art. |

### 5.2 How they are built, and what it costs on a cheap Android

| Tool | Good for | Weight / risk on a low-end Android (about 2 GB RAM, Mali GPU, 3G) |
|---|---|---|
| [Spline](https://spline.design) (export via `@splinetool/react-spline`) | The quickest way to a glossy 3D glass cube | The runtime plus scene is often 1 MB or more. Heavy, so **desktop only**, lazy-loaded after first paint. |
| [Three.js](https://threejs.org) / [react-three-fiber](https://r3f.docs.pmnd.rs) + drei `MeshTransmissionMaterial` | A real glass refraction lock block that we control | three is about 150 KB gzip, and transmission shaders are GPU-heavy. **Desktop only**, with `dpr={[1, 1.5]}` and `frameloop="demand"`. |
| [Lottie](https://lottiefiles.com) (`lottie-web` light or dotLottie) | The rider-scan explainer loop, success ticks | About 50 to 60 KB player plus a small JSON. OK on mobile if it's short and paused off-screen. |
| **CSS 3D transforms** (`transform-style: preserve-3d`, 6 faces, `backdrop-filter`) | **Our mobile lock block.** Zero JS | About 2 KB. `backdrop-filter` can stutter on old Android, so swap in a solid `rgba` face on low-end devices (see §5.4). |
| [Motion](https://motion.dev) (Framer Motion) | Page and state transitions, the lock-to-release sequence, layout animations | About 30 to 40 KB gzip for the full package. Use `LazyMotion` + `domAnimation` (about 15 KB). |
| SVG + CSS | Sparkle or block fields like NEAR, the QR viewfinder corners | Practically free. |

**Performance rules**
- Keep the mobile first-load JS budget for `/scan` under **150 KB gzip**.
- No WebGL on `/scan` or `/pay`, ever.
- Load 3D only when `matchMedia('(min-width: 1024px) and (prefers-reduced-motion: no-preference)')` matches and `navigator.hardwareConcurrency >= 4`, through `next/dynamic` with `ssr:false`.
- Hero photos go through `next/image` as AVIF/WebP, 1600px max, with `priority` set only on the LCP image.

### 5.3 TrustLock hero visual: the lock block

- **Concept:** a frosted-glass cube with **three states**, tied to the deal lifecycle and to the real contract states.
  1. *Created:* a hollow glass outline.
  2. *Funded:* an amber core glowing inside, a slow pulse, a mono label `12.00 USDC · locked`.
  3. *Released* (after the buyer's one-tap confirm or the rider's scan): the core flashes green, the cube "unlatches" (top face lifts 8px, opacity eases), and a receipt line types out `released → seller.testnet · tx 9fK…2a`.
- **The proof moment as hero** (rider scan shown, because it's the most visual of the two release proofs): on `/`, the photo shows a rider at a doorstep holding a phone toward the buyer's phone (a cropped, warm, slightly desaturated photo). The lock block floats above the phones. An autoplay sequence of about 6s (desktop) or a tap-to-play button (mobile) runs Funded → scan beam sweeps → Released. Under it in small mono text: `Simulation. See the real testnet run →`. The link only appears once #10 has an explorer link.
- **Desktop build:** r3f + drei `MeshTransmissionMaterial` (or a Spline export if time is short), lazy-loaded.
- **Mobile and fallback build:** CSS 3D cube (6 divs, `preserve-3d`, 12% white faces, amber or green inner `radial-gradient`), animated with Motion. Same states, about 2 KB.
- **Static fallback:** a pre-rendered transparent WebP of the cube for each state (export three frames from the same scene) for `prefers-reduced-motion`, Save-Data, or no JS.
- **Behind the hero**, as a secondary motif: a faint chain of small square blocks (SVG), NEAR-sparkle style, drifting at 4% opacity. It's off on mobile.

### 5.4 Lightweight fallback logic

```ts
const lowEnd =
  (navigator as any).connection?.saveData ||
  ['slow-2g', '2g', '3g'].includes((navigator as any).connection?.effectiveType) ||
  (navigator as any).deviceMemory <= 2 ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;
// lowEnd → static WebP lock block, no backdrop-filter, no looping animation.
```

### 5.5 Asset sources (free or properly licensed)

- **3D:** build the lock block ourselves in Spline (free plan, our own scene) or Blender. Optional free 3D icons: [3dicons.co](https://3dicons.co) (CC0). HDRI lighting for glass: [Poly Haven](https://polyhaven.com) (CC0).
- **Photography:** commission it or shoot it ourselves. A real rider and a real seller we know, with signed consent, is best and most honest. Stock options to check before use: Unsplash (Unsplash License) or Pexels, searching "dispatch rider Africa", "African small business owner" and "market seller". Credit photographers in the footer anyway. Never present a stock model as a TrustLock customer. Captions describe the scene ("A dispatch rider in Lagos"), not a customer story.
- **Icons:** [Lucide](https://lucide.dev) (ISC, ships with shadcn). Stroke 1.5, 20px.
- **Lottie:** [LottieFiles](https://lottiefiles.com). Check each file's licence, prefer the free "Lottie Simple License", or make our own.
- **Fonts:** Geist and Geist Mono (SIL OFL) from Google Fonts.

## 6. Social proof, done honestly

### 6.1 Patterns other startups use

| Pattern | Live example | Can TrustLock use it now? |
|---|---|---|
| Customer or partner logo row | [privy.io](https://www.privy.io) (Stripe, Robinhood, Kraken…) | **No.** We have no customers or partners. |
| "Audited by" / security logos | [paybox.sh](https://paybox.sh) | **No.** Not audited. |
| Stats band | [paybox.sh](https://paybox.sh), [stripe.com](https://stripe.com) | **Only with real, sourced numbers** (for example "12/12 safety tests passing", linked to the log). |
| Testimonial and review cards | common on SaaS sites | **No.** No real users yet. Don't invent quotes. |
| "Built on / Built with" tech strip | common on hackathon and web3 sites | **Yes**, for tech we actually use. |

### 6.2 "Built with" strip (only what's in the repo)

Monochrome, 24px tall, `--mute` colour, on hover → `--bone`. The label reads **"Built with"**, never "Partners" or "Backed by".

| Tech | In repo? | Official asset / rules |
|---|---|---|
| NEAR Protocol | `contract/`, near-api-js | Brand portal [brand.near.org](https://brand.near.org) (a Notion page, so it needs JavaScript in a browser). Use the official logo unmodified, keep the clear space, and don't imply endorsement. |
| Rust | `contract/` | [Rust trademark policy](https://rustfoundation.org/policy/rust-trademark-policy/) and the official logo SVG at [rust-lang.org/logos](https://www.rust-lang.org/logos/rust-logo-blk.svg). Factual "built with Rust" use is allowed. Don't modify the logo. |
| Next.js | `web/` | Wordmark from [nextjs.org](https://nextjs.org) / Vercel brand assets ([vercel.com/geist](https://vercel.com/geist/introduction)). Follow Vercel's guidelines, unaltered. |
| Python / FastAPI | `agent/` | Python Software Foundation [trademark usage policy](https://www.python.org/psf/trademarks/). FastAPI logo from its docs. |
| NEAR Intents / 1Click | `agent/` (dry quotes) | Only add it once real quotes ship (#9). Until then, leave it out. |
| USDC (`usdc.fakes.testnet`) | testnet token | **Don't use the Circle USDC logo.** The testnet token isn't Circle's. Write "test USDC" in text. |

### 6.3 What we show instead of testimonials

1. **"Where it fits" use-case cards** (three cards, clearly illustrative): *A thrift seller in Lagos sells to a buyer on Telegram*, *A sneaker reseller in Accra closes a deal on X*, *A phone accessories shop in Nairobi sends the link by SMS*, *A designer in Johannesburg emails an invoice link*. Each card shows the deal flow in three mono lines. Label: "Example scenarios".
2. **Safety scoreboard:** the real results of the safety test battery (#3), for example `prompt injection: blocked`, `double release: rejected on chain`, `replayed QR: rejected`, `expired deadline: refund only`. Each row links to the test file and log. Show it only once #3 has run, with the real pass/fail counts.
3. **Proof-of-run card:** the one real testnet run (#10), with the contract ID, the deal ID, funded → released timestamps, and **explorer links** (testnet NearBlocks or the NEAR explorer). Big, mono and clickable. It's our strongest trust signal.
4. **Open source:** a "Read the contract" link to `contract/src` plus the threat model (`docs/threat_model.md`).

## 7. Section rhythm (landing page)

Rhythm modelled on PayBox's alternating cinematic and dense sections, not the generic hero → features → pricing → FAQ:

1. **Hero** (100svh): photo + lock block + one sentence + two buttons + mode badge.
2. **The rule** (a short dark band): one large line, "AI does the work. Cryptography holds the money." Sub: "The agent can read, check and prepare. Only your buyer's confirmation, the rider's scan or the deadline can move funds."
3. **How it works:** numbered 01 / 02 / 03 / 04 rows (Share a link · Buyer pays into escrow · Proof of delivery · Paid or refunded), with a lock-block state thumbnail beside each.
4. **For sellers:** a Flutterwave-style real-photo split with seller benefits and "Set up your store" leading to `/onboard`.
5. **Bring your own AI agent:** the provider row, "planned" or "works with", plus the safety statement (see §10).
6. **Proof:** safety scoreboard plus testnet run card (§6.3).
7. **Where it fits:** use-case cards.
8. **Built with** strip and open-source links.
9. **Footer:** testnet disclaimer, the hackathon line, GitHub, photo credits.

## 8. Page-by-page layouts

**Global chrome.** Pill nav with the logo on the left, plus *How it works · For sellers · AI agents · GitHub* and a bone pill button "Open app". A **mode badge** is always visible in the top bar, set in mono on violet `--mode`:
- `DEMO`: simulated, no chain calls.
- `TESTNET`: real testnet transactions, no real money.
- `DRY RUN`: Intents quotes only.
- **There is no live badge** until a real mainnet execute exists (per `web/app/page.tsx` and the README).

### 8.1 `/`: landing
- **Hero copy (draft):**
  - Eyebrow `PAY ON DELIVERY · ON NEAR`.
  - Display: **"Paid when it's delivered. Not a minute before."**
  - Sub: "Send a payment link in any chat. Your buyer's money waits in escrow until they confirm delivery or your rider scans their code. If it never arrives, they're refunded automatically. AI does the work. Cryptography holds the money."
  - Buttons: `Set up your store` (bone) and `Watch a delivery` (outline, plays the lock-block sequence).
- **Mobile:** photo crops to the top 55%, lock block centred over the phones, headline below the photo on ink (not over the photo, for legibility).
- **States:** if the agent API is unreachable, the landing still works because it's static. Proof cards show "Testnet run coming soon" until data exists. Never show placeholder numbers.

### 8.2 `/onboard`: seller self-serve setup (new; see §9)

### 8.3 `/pay/[dealId]`: buyer pays (opened from a link in any chat)
**Zero setup is the goal.** The buyer sees the deal before anything else: no sign-up, no app. Today the buyer still needs a NEAR wallet holding test USDC (testnet). Planned: embedded or passkey wallet creation in one tap, so a first-time buyer never sees the word "wallet" before paying. Until that ships, the page shows a short "New to NEAR? Get a testnet wallet in 1 minute" helper.

**Link previews:** the link must unfurl nicely in WhatsApp, Telegram, X, iMessage and Slack. Use Open Graph and Twitter card tags with a generated OG image (`next/og`) showing the business name, item, amount and "Protected by TrustLock escrow".

**Layout:** a single 640px column. A deal summary card on top, the wallet and pay action below, a sticky bottom CTA on mobile.
- **Deal card (glass over ink):** seller name and store handle, item, amount in **mono tabular**, both `12.00 USDC` and an approximate local currency in the buyer's currency (`≈ ₦19,800`, `≈ GH₵…`, `≈ KSh…` · rate at quote time, only with a real quote, otherwise hidden). Delivery deadline as a countdown, and a "Protected by escrow" line with a lock icon.
- **Steps rail** (01 Review the deal → 02 Pay into escrow → 03 When it arrives: tap "I received it" or show your code to the rider).
- **Ask the agent:** a small "Questions about this deal?" chat drawer (the seller's agent answers in the buyer's language; it can explain but never move funds).
- **Components:** wallet connect button (NEAR wallet selector or near-connect, testnet), amount row, deadline row, `Lock 12.00 USDC` primary button, and an expandable "What happens next" accordion.
- **States:**
  - *Empty / no deal ID:* "This payment link is missing a deal. Ask the seller for a new link."
  - *Loading:* skeletons for the deal card, and the button disabled with a spinner plus "Waiting for wallet…".
  - *Wallet rejected:* an inline red alert, "You cancelled in your wallet. Nothing was charged." with Try again.
  - *Insufficient balance:* show the balance in mono, plus a link to the testnet faucet in TESTNET mode.
  - *Success (Funded):* the lock block turns amber, with "Locked. 12.00 USDC is safe in escrow until delivery." Two ways to release, shown as equal cards. (1) **"I received it"**: a big one-tap button (planned contract method `confirm_receipt`, signed by the buyer's wallet; shows a confirm sheet, "This pays the seller 12.00 USDC. This can't be undone."). (2) **Your one-time code**: a full-width QR to show the rider, with Save image. Bookmark prompt: "Keep this page; it's your receipt." A mono tx hash with copy and explorer link.
  - *Released:* green, "Delivered. The seller has been paid." with the tx link.
  - *Disputed:* red-outlined, "Under review by the TrustLock team. Funds stay locked until it's resolved." Disputes are manual in v1, so no automated outcome is promised.
  - *Expired:* blue status, "Deadline passed. Your refund is available," with a Claim refund button.
- **Mode badge** at the top of the card. In DEMO, the button reads `Simulate lock`.

### 8.4 `/scan`: rider confirms delivery (the hero moment, built for cheap phones)
Riders are optional: some sellers deliver themselves, and the buyer's one-tap confirm also releases. When a rider is assigned, this page is the strongest proof.
**Layout:** full-screen camera viewfinder, dark, with four bone corner brackets (SVG), the deal summary in a bottom sheet, and a large 56px `Paste code` fallback button.
- **Flow:** open → camera permission → scan → on-chain `confirm_delivery` with the rider's function-call key → result.
- **States:**
  - *Permission prompt:* explain why first ("We need the camera only to read the buyer's code"), then ask.
  - *Camera denied or unavailable:* switch to manual paste or upload a photo of the QR.
  - *Scanning:* an amber beam sweeps across the frame. Haptic `navigator.vibrate(30)` on detect where supported.
  - *Submitting:* full-screen "Confirming on NEAR…" with the lock-block pulse. **The button is disabled, so nothing can double-submit.**
  - *Success:* a green full-screen takeover with a big tick, "Delivered. Seller paid 12.00 USDC.", a mono tx line, and Done. This screen is what goes in the demo video.
  - *Replayed or used QR:* red, "This code was already used. Nothing was paid twice." (the chain rejected it).
  - *Wrong deal or expired:* red or blue with a clear reason. **No override button, ever** (per the existing `scan/page.tsx` note).
  - *Offline:* "No connection. Your scan is saved. Keep this page open, it will retry." Retry only if the contract call is safely idempotent. Otherwise "Try again when you have signal."

### 8.5 `/dashboard`: seller view
**Layout:** desktop gets a left rail (Deals · Payment links · AI agent · Settings) and a main table. Mobile gets a top segmented control and stacked deal cards.
- **Header strip:** three real numbers from the seller's own deals (Locked now, Released this week, Refunded), mono tabular, and **no invented totals**.
- **Deals table** (shadcn `Table`): item, buyer (truncated account ID), amount, status chip, deadline, actions. Status chips (contract states):
  - Created: grey.
  - Funded: amber `--lock`.
  - Delivered or Released: green `--release`.
  - Expired or Refunded: blue `--refund`.
  - Disputed: red `--danger`, labelled "Manual review" in v1.
- **Row detail sheet:** a timeline (Created → Funded → Delivered → Released) with timestamps and explorer links for each tx.
- **Create payment link** (primary button): item, amount, deadline, optional rider. Then a share sheet: Copy link, the native share sheet (`navigator.share`, which reaches WhatsApp, Telegram, SMS, email and anything else installed), plus explicit fallbacks (WhatsApp `wa.me/?text=`, Telegram `t.me/share/url?url=`, X intent, `sms:` and `mailto:`), and Download QR.
- **Agent panel:** the agent's notes on each deal ("Buyer asked about delivery time", "Delivery evidence looks complete, release recommended"). Recommendations are suggestions only, never actions.
- **States:**
  - *Empty:* a lock-block outline illustration, "No deals yet. Share your payment link to get your first order." with the link card inline.
  - *Loading:* skeleton rows.
  - *Error:* "Couldn't reach the TrustLock agent. Your money is safe on chain; this only affects the view." with Retry. Indexer or API failures must never look like lost funds.

## 9. Self-serve seller onboarding (`/onboard`)

**Researched patterns.** [Stripe Payment Links](https://docs.stripe.com/payment-links) (create a link with no code, share anywhere, a QR is built in), [Shopify's start flow](https://www.shopify.com/start) (one question per screen, a progress indicator, and value before account details), and NEAR's wallet connection docs ([docs.near.org, near-connect / wallet selector](https://docs.near.org/tools/near-connect)). Phantom's onboarding pattern (create or import, then a security confirmation) shaped the wallet step. Refero and Mobbin flow libraries were unavailable (no subscription).

**Principles:** one task per screen, progress dots at the top, always skippable defaults, and the share link reached in under 2 minutes. Everything is saved as a draft, so a dropped 3G connection never loses work.

| Step | Screen | Content | States |
|---|---|---|---|
| 0 | **Welcome** | "Get paid on delivery, in any chat app." 3 numbered bullets, `Start`, mode badge | — |
| 1 | **Connect wallet** | Connect a NEAR wallet (testnet), or "I don't have one" with a link to the testnet wallet and guide (`docs/testnet_accounts.md`) | connecting · connected (mono account ID with a ✓) · rejected · wrong network ("Switch to testnet") |
| 2 | **Business info** | Business name, handle (becomes `trustlock.app/s/<handle>`, live availability check), country (any; African countries listed first), what you sell, an optional logo, optional contact links (any chat app, website, email) | handle taken · invalid · saved |
| 3 | **Delivery defaults** | Default deadline (24h / 48h / 72h / custom), delivery areas, and **release proof**: "Buyer confirms" (always on) plus optional "Rider scans QR" (add a rider account ID, generate a rider key later via #7) | validation errors inline |
| 4 | **Your agent** | Pick the **built-in TrustLock agent** or **Bring your own model** (Claude, ChatGPT, Gemini, others; §10). Choose languages (today: English, Pidgin, Yoruba stub; planned: many African languages via Intron Sahara). Can skip | key test ok · key invalid · skipped |
| 5 | **Your first payment link** | Item, amount, deadline → big QR + link, `Copy link`, native share (any chat app), `Download QR (PNG)`, and a preview of what buyers see (`/pay` mock, including the link-preview card) | generating · ready · error retry |
| 6 | **Done** | Go to dashboard, plus a checklist (Make a test deal, Add a rider) | — |

What this needs underneath (for the team, not just design): seller profile storage keyed by account ID (agent API #4), a per-seller deal-creation endpoint, a QR generator (`qrcode` npm, client-side), and a contract change so a deal can be created **before the buyer is known** (today `create_deal` requires a `buyer` account up front; see `docs/end_to_end_flow.md`). If time runs out before Friday's freeze, ship steps 1, 2 and 5 only and label the rest "coming soon".

## 10. Bring your own AI agent (`/agents` page + landing section)

**Headline:** "Bring your own AI. It can't touch your money."
**The safety statement** (verbatim, near the top of the page, and as the landing section's subhead):
> **AI does the work. Cryptography holds the money.** Your agent reads the deal, checks order and delivery evidence, answers your buyers' questions in their language, recommends when to release, and prepares the transaction for a person to sign. **It can never release, move or refund funds.** Money moves only on hard proof: your buyer taps "I received it", or your rider scans the buyer's one-time code. If the deadline passes, the buyer is refunded. That rule lives in the smart contract, not in a prompt.

**Two choices, equal weight:** (1) **Built-in TrustLock agent**, zero config, the default. (2) **Bring your own model**, for sellers who already pay for Claude, ChatGPT, Gemini or another model and want their own assistant's voice.

**Layout:** hero line + statement → a "What your agent can do" vs "What it can never do" two-column card (ticks vs locks) → provider grid → connection methods → security notes.

**Provider row.** Monochrome logos, each tile carrying a status pill. Use **"Works with"** only once we've built and tested that connection. Until then, the pill says **Planned**.

| Provider | Status today | Official brand source and rules |
|---|---|---|
| Meta Muse (via `MUSE_API_KEY`, already in `.env.example`) | Planned (works with once the agent call is wired and tested) | [Meta brand resources](https://www.meta.com/brand/resources/). Use official assets only, don't alter them, and no implied partnership. |
| OpenRouter (via `OPENROUTER_API_KEY`) | Planned | Use the name in text unless official assets are confirmed. |
| Anthropic Claude | Planned | [Anthropic trademark guidelines](https://www.anthropic.com/legal/trademark-guidelines). Official logo from Anthropic's newsroom media assets. No modification, no implied endorsement. |
| OpenAI ChatGPT | Planned | [openai.com/brand](https://openai.com/brand) (it blocks automated fetches, so verify in a browser). Their guidelines limit logo use by third parties, so prefer a plain-text name plus "via API" unless their rules allow the mark. |
| Google Gemini | Planned | [Google partner marketing hub / brand resource center](https://about.google/brand-resource-center/). Get permission before using Google marks in marketing, and use text otherwise. |

> If any provider's rules don't allow a logo for our use, show the name in Geist Medium instead. A clean text row looks just as premium.

**Connection methods (design for both, build one):**
1. **API key:** the seller pastes a key in Settings → AI agent. The field is masked, has a "Test connection" button, and shows the last 4 characters after saving. Options: (a) **client-side only**, kept in memory or IndexedDB with a "this device only" label, or (b) **server-side, encrypted at rest** (envelope encryption with a KMS or libsodium sealed box, a per-seller key, decrypted only inside the agent call). **Never in the repo, never in logs, never in `NEXT_PUBLIC_*`.**
2. **MCP:** TrustLock exposes a read-and-prepare MCP server (`draft_deal`, `explain_deal`, `check_order_evidence`, `check_receipt`, `get_deal_status`, `recommend_release`, `prepare_confirm_tx`). `prepare_confirm_tx` returns an **unsigned** transaction that only the buyer's wallet can sign. There is deliberately **no** `release_funds` tool, and the agent never holds a key that can move funds. Sellers add its URL to Claude, ChatGPT or Grok connectors. Same safety statement on the page.

**Languages:** today the deal agent is a deterministic English, Pidgin and Yoruba stub (`agent/app/deal_agent.py`). Planned: African-language speech-to-text and text-to-speech via [Intron Sahara](https://docs.voice.intron.io/docs/stt/supported-languages) (its list includes Hausa, Igbo, Yoruba, Pidgin, Swahili, Amharic, Zulu, Wolof, Twi and more), so buyers can send voice notes. Label it **Planned** until it's wired with a real key.

**Agent actions UI:** every agent-drafted deal shows an "AI draft" chip and needs a human tap (seller confirm) before it becomes a contract call. Receipt checks show "Screenshot alone is never proof of payment" (per the `/receipts/check` rule).

## 11. Copy tone, accessibility and mobile

**Tone:** short, warm and plain, like a confident African fintech with global reach, not a crypto forum.
- Say "money", "escrow", "your buyer", "the rider". Avoid "trustless", "web3", "DeFi", "to the moon".
- Explain once, then stay quiet.
- Every error says what happened, whether money is safe, and what to do next.
- Never claim things we haven't done: no "thousands of sellers", no "mainnet", no "audited".
- Agent replies come in the buyer's language (#2 today; Intron Sahara planned). The UI starts in English with i18n keys ready (`next-intl` or a simple JSON map).

**Accessibility**
- Contrast is AA minimum. `--mute` on `--ink-950` is about 8:1. Status colours pass on their 12% tint as text at 14px+, but always pair colour with an icon and a word (never colour alone).
- Visible focus: a 2px `--bone` outline with a 2px offset.
- Touch targets are at least 48×48px, and the main rider buttons are 56px tall.
- The scan result is announced via `aria-live="assertive"`.
- QR codes always have a text-code alternative.
- Respect `prefers-reduced-motion` and Save-Data.

**Mobile-first for riders on low-end Android**
- Design at 360×740 first.
- `/scan` loads with no web fonts blocking (`display: swap`), no 3D, no large images, and should be interactive in under 3s on slow 3G.
- QR decoding: use the native `BarcodeDetector` where available, falling back to a small lazy-loaded decoder (for example `jsqr`, about 40 KB) only when needed.
- Make the scan page work one-handed: actions in the bottom 40% of the screen.
- High-brightness-friendly: the success screen is a solid green block with ink text, readable in sunlight.
- Keep pages light enough for 1 to 2 GB RAM devices. Don't hold camera streams open longer than needed.

## 12. Implementation checklist (maps to #8)

The current stack: Next.js 15 + React 19, **no Tailwind, no shadcn**, inline styles, Georgia serif. Recommended (the issue owner decides, and the lockfile changes in that PR, not this one):

- [ ] **Foundation:** add Tailwind v4 + shadcn/ui (`npx shadcn@latest init`), `globals.css` tokens from §4, and Geist and Geist Mono via `next/font/google` in `layout.tsx`. Remove the Georgia inline style.
- [ ] **shadcn components:** `button`, `card`, `badge` (mode badge + status chips), `input`, `label`, `form`, `select`, `tabs`, `table`, `sheet` (deal detail, mobile nav), `dialog`, `skeleton`, `sonner` (toasts), `progress` (onboarding), `separator`, `tooltip`, `alert`, `accordion` ("What happens next").
- [ ] **Shared:** `<ModeBadge mode={appMode} />` from `lib/config.ts` (no live option until #11), `<StatusChip status />`, `<ChainText value copy explorerHref />` (mono + copy + link), `<LockBlock state="created|funded|released" />` (CSS 3D, motion-safe, WebP fallback).
- [ ] **`/pay/[dealId]`:** deal card, OG link preview, wallet connect (`lib/wallet.ts`, testnet), lock action, all states in §8.3, buyer one-tap "I received it" (once `confirm_receipt` exists) and buyer QR on success.
- [ ] **`/scan`:** camera viewfinder (BarcodeDetector → fallback), paste fallback, `confirm_delivery` call, full-screen success, replay and expired errors, no override.
- [ ] **`/dashboard`:** deals table and cards, status chips, detail sheet with timeline and explorer links, create-payment-link flow with share-anywhere sheet, agent panel, empty, loading and error states.
- [ ] **`/`:** hero with photo + LockBlock, "The rule" band, 01 to 04 how-it-works, seller split, AI agents section, proof (only real data), use cases, Built with, footer disclaimer.
- [ ] **`/onboard`** (stretch, after #10 works): steps 1, 2 and 5 first.
- [ ] **`/agents`** (stretch): static page with the safety statement and "Planned" pills, then wire Muse first since the env var already exists.
- [ ] **Desktop 3D (optional, last):** r3f or Spline lock block, lazy-loaded behind the low-end check.
- [ ] **QA:** test on a real cheap Android (or Chrome DevTools: Moto G Power, slow 3G, 4× CPU throttle). Run Lighthouse mobile on `/scan` (target performance ≥ 90 and accessibility ≥ 95). Check reduced motion. Check that no `NEXT_PUBLIC_*` holds a secret.
- [ ] **Honesty pass before submission:** every number, logo and "works with" label is backed by code or a link.

**Priority order for the 3 days:** `/pay/[dealId]` (link → pay → confirm) → `/scan` success screen → `/dashboard` with create-link → `/` hero → `/onboard` → `/agents`. The link-to-paid moment is the demo.

## 13. Shared testnet env

- **Committed `.env.testnet`** (public values only): `NEAR_NETWORK=testnet`, `NEAR_NODE_URL`, `TRUSTLOCK_CONTRACT_ID` (once deployed), `TRUSTLOCK_USDC_ACCOUNT=usdc.fakes.testnet`, and **public** account IDs for owner, seller, buyer and rider, plus `NEXT_PUBLIC_*` values. Nothing secret, ever. It sits beside `.env.example`, and teammates copy it to `.env` and add their own secrets.
- **Secrets** (key files, rider function-call keys, AI provider API keys, `ONECLICK_JWT`) go in a shared secrets manager, [Doppler](https://www.doppler.com) or [Infisical](https://infisical.com) (both have free tiers), pulled with `doppler run --` / `infisical run --`. Never in git, chat, or screenshots.
- **Live site:** set the same variables in [Vercel project environment variables](https://vercel.com/docs/environment-variables) (Preview and Production). Only `NEXT_PUBLIC_*` reach the browser, so keep server-only keys unprefixed.

---

*Researched 11 Nov 2026 from live sites (screenshots and CSS of paybox.sh, near.org, flutterwave.com, privy.io, phantom.com, linear.app) and public docs. Refero and Mobbin MCPs were unavailable (inactive subscriptions).*
