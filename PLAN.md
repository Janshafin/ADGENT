# ADGENT: master plan to ship a real, deployed, prize-winning product

Pay-per-sale ads for AI shopping agents, settled end to end on PayPal.
Repo: `~/Desktop/adgent` (commit `9ea94b9`). First action after approval: copy this file to `~/Desktop/adgent/PLAN.md` so the team works from it.

---

## 0. What "done" means (Definition of Done)

Everything below must be true on the **deployed URL**, not on localhost:

1. A stranger opens the URL (no login wall) and follows `/judges` to launch a campaign, buy through an AI agent with a PayPal sandbox buyer, and see the money move in Mission Control.
2. Every dollar in the demo is a **real PayPal sandbox transaction**: Order, Capture, Payout, Refund, Webhook. The only simulated thing is the cross-merchant history, and it is labelled everywhere it appears.
3. Claude is called in production with budget caps and fallbacks. Evals prove it works (numbers in the README).
4. The app survives abuse: authenticated admin actions, rate limits, idempotent money paths, verified webhooks.
5. CI is green, core money logic has tests, `/api/health` is monitored, and the site stays up **through Dec 21** (judging window Dec 1–15, winners about Dec 21).
6. Submission pack complete: public repo with MIT license showing in the About box, YouTube video under 3:00, Devpost text, judge test instructions.

## 1. Verified hackathon facts and what they imply

Sources: PayPal's [hackathon blog post](https://developer.paypal.com/community/blog/PayPal_AI_Hackathon), Devpost-rules excerpts quoted by [Reconscribe](https://reconscribe.com/paypal-ai-hackathon-2026/), [thegenaimagazine](https://thegenaimagazine.com/paypal-ai-hackathon-2026-ideas-deadline-prizes) and [tierones](https://tierones.io/opportunities/paypal-ai-hackathon-2026). Devpost itself returns 403 to our tools: **someone on the team must read the Rules tab once and tick the checklist in section 9.**

| Fact | Implication |
|---|---|
| Deadline **Thu Nov 12, 2026, 12:00 PM PT** (= 01:30 AM IST Nov 13). No late entries. | Hard stop. **We submit by 6:00 AM PT = 7:30 PM IST Nov 12.** Feature freeze Nov 11 night. |
| Only requirement: *meaningfully use both PayPal and AI.* No tracks. | Depth of PayPal usage beats breadth of ideas. |
| **Stage One** pass/fail (working demo, public repo with open-source license, YouTube video under 3 min, description, free access for judges) then **Stage Two** with 5 **equally weighted** criteria: Technological Implementation, Design, Potential Impact, Innovation, Presentation. | We need all five strong, none is a tiebreaker we can ignore. |
| Ties: **judge vote** (my earlier "Tech score breaks ties" was wrong). | Memorability of the demo matters. |
| Judges: PayPal developer advocates, engineers, PMs, plus sponsor judges. Organizers may also use **AI-driven analysis**. | The README, code clarity and `/judges` page get read by machines too. Write them for both. |
| The project must stay **free and unrestricted for sponsor and judges until judging ends.** | No paywall or login wall. Hosting must be funded through Dec 21. |
| Prizes: 1st $12k, 2nd $8k, 3rd $5k, five $5k honorable mentions (Most Creative, Most Impactful, Best Demo Delivery, Best Use of PayPal + AI, Best Use of Agentic Commerce). Sponsors: AG Grid $5k/$2k/3×$1k, APIMatic 3×$1k, Bryntum 3×$1k, Channel3 $1.5k, Render credits $1k/$750/$500. | **Stack rule: one main prize or honorable mention + ONE sponsor prize.** Best realistic haul: Grand (up to $12k) + AG Grid ($5k). Don't spread effort across sponsors. |
| PayPal tooling the hackathon names: JS SDK **v6**, REST APIs, Pay Later, Subscriptions, Invoicing, Payouts, Webhooks, Agent Toolkit, MCP server. | We used a v5-style SDK script. **Migrate to v6.** Use Agent Toolkit for real. |
| `platform_fees` (multiparty) needs **PayPal to enable the partner**, is **not supported for first-party integrations**, and settles daily to a bank account ([docs](https://developer.paypal.com/docs/multiparty/)). Partner Referrals v1 is deprecated. | Our current "split the fee at capture" cannot be the foundation. See the settlement decision in section 3. |
| Channel3: 1,000 free credits/month, search $0.007/call after ([docs](https://docs.trychannel3.com/pricing)). | Free for our volume. |
| Render free Postgres may expire after 30 days and free web services sleep ([guide](https://render.com/articles/deploy-a-next-js-app-with-postgres-and-render-workflows-using-cursor)). | Use Turso for the DB and a paid Starter web service (about $7/mo) so judges never hit a cold start in December. |

## 2. Honest gap analysis: today's code versus "real"

What exists and works (verified locally): audience builder, campaign proposals, offer auction, MCP server (3 tools, tested with a real client), widget, AG Grid ledger with SSE, holdout lift metrics, API routes, seed script, production build. What has **never run**: any PayPal call, any Claude call.

| # | Gap | Severity | Fix (workstream) |
|---|---|---|---|
| G1 | **Payee override and `platform_fees` likely fail for a first-party REST app.** `lib/paypal/orders.ts` sets `payee` to the merchant. | Critical | Settlement model B, section 3 (WS1) |
| G2 | **Zero auth.** Anyone can hit `/api/settle/payouts`, `/api/orders/:id/refund`, `/api/campaigns/:id` (PATCH), `/api/agent` (burns Claude money). | Critical | WS3 |
| G3 | Checkout uses the old SDK script; hackathon names v6. | High | WS2 |
| G4 | No tests, no CI, no monitoring, no health check. | High | WS8, WS9 |
| G5 | Budget guardian only *advises*; nothing auto-pauses. Budget increments are not atomic under concurrency. | High | WS5 |
| G6 | `@paypal/agent-toolkit` installed but unused; Transaction Search wrapper unused; Channel3 unused. | High (scoring) | WS6, WS4 |
| G7 | SQLite file DB, `drizzle-kit push` instead of migrations, seed script can wipe prod. | High | WS4 |
| G8 | Merchant-supplied text (product descriptions) flows into the agent's context: **prompt-injection surface**. | Medium, great story | WS6 |
| G9 | No publisher dashboard, no campaign detail page, no "why this ad", thin empty/error/mobile states, no OG image. | Medium (Design score) | WS7 |
| G10 | No judge entry point or honesty page. | Medium (Stage One + Presentation) | WS10 |
| G11 | Stuck orders (created, never captured) are never reconciled. | Medium | WS5 |

## 3. The decision that gates everything: settlement model

Run the **Day-0 spike** (`npm run spike`, extended) against sandbox first. It decides which model we build.

- **Model B, primary (build this): ADGENT is merchant of record for ad-attributed orders.** Order payee is the ADGENT platform business account that owns the REST app (no payee override). On capture the ledger computes: `merchant_net = sale - ad_fee`, `publisher_share = ad_fee × rev_share`. **Payouts API** sends merchants and publishers their money after a configurable hold (the refund window, 2 min in demo, shown in the ledger as pending → paid). Refund before payout cancels the payout; after payout, ADGENT absorbs and records a clawback. Everything is first-party and sandbox-verifiable. Merchants still pay **only if a sale settles** because the fee is deducted from the sale, never billed up front.
  - Honest story for judges: in production this becomes Model A through PayPal's partner program; we say so.
- **Model A, bonus (try, don't depend): `platform_fees`.** Submit PayPal's "Tell us about your platform" form today in case enablement arrives. If the spike's `platform_fees` order captures, we flip `ADGENT_FEE_MODE=platform_fees` and keep Payouts only for publishers.
- **Model C, fallback: Invoicing** (already written in `lib/adgent/settlement.ts`) if Payouts is disabled on the app.

Code impact of Model B: `lib/paypal/orders.ts` (drop payee in B), `lib/adgent/settlement.ts` (add `payMerchants`, hold logic), `lib/db/schema.ts` (`orders.merchantNetCents`, `merchantPayoutId`, status `settled`; `payouts.kind`), ledger events (`merchant_paid`), and the economics panel copy.

## 4. Workstreams (owners are suggestions for 4 devs)

Priority: **P0** = ships or we don't submit, **P1** = ships unless the clock says no, **P2** = only if ahead.

### WS1. PayPal money core (Dev A) — P0
1. **Sandbox accounts** (developer.paypal.com): business "ADGENT Platform" (owns the REST app), business "Bean There" (hero merchant), business "Daily Grind" (publisher), 2 personal buyers. App features on: Accept payments, Payouts, Invoicing, Transaction search, Pay Later. Webhook to `<deployed>/api/webhooks/paypal` for `PAYMENT.CAPTURE.COMPLETED/REFUNDED/REVERSED`, `PAYMENT.PAYOUTSBATCH.*`.
2. Extend `scripts/spike-paypal.ts` to **capture** a real order with a buyer approval link and print the payout result. Record results in `docs/spike-results.md`. Decide A, B or C by hour 4.
3. Implement Model B settlement + hold + payout worker + reconciliation (WS5).
4. Refund flow end to end including payout cancel/clawback and fee reversal; `orders` status machine: `created → captured → settled | refunded`.
5. Webhook handler fails closed in production when `PAYPAL_WEBHOOK_ID` is unset; dedupe events by id (new `webhook_events` table).
**Acceptance:** from the deployed site, a real sandbox buyer pays $18.04; PayPal shows capture on the platform account; after the hold, sandbox merchant and publisher accounts show payouts; refund test reverses it; ledger matches PayPal to the cent (reconcile script prints 0 diffs).

### WS2. Checkout on JS SDK v6 + Pay Later (Dev C) — P0
- Replace the script tag in `components/PayPalCheckout.tsx` with v6 (`web-sdk/v6/core`, `createInstance` with `paypal-payments` and `paypal-messages`, one-time payment session, `<paypal-message>` for Pay Later). **Read the live v6 pages first** ([setup](https://developer.paypal.com/sdk/js/set-up), [Pay Later](https://developer.paypal.com/pay-later/integrate)): don't code the API from memory.
- Keep the redirect flow for agent-created orders (`/shop/return`), and the in-page approval for widget/agent UI.
**Acceptance:** buttons and Pay Later message render on `/shop/[offerId]`, `/agent`, and the widget's checkout, in Chrome and Safari mobile.

### WS3. Security and abuse resistance (Dev A/B) — P0
- **Roles**: `visitor` (judges): can browse, launch campaigns **only for the demo merchants within caps** (budget ≤ $250, max 5 active per session), use the agent, and buy with sandbox accounts. `admin`: `ADMIN_TOKEN` cookie required for payouts, refunds, invoices, seeding, guardian config.
- Signed session cookie (HMAC via Web Crypto, no new dependency), middleware (`proxy.ts` per the Next 16 docs in `node_modules/next/dist/docs`) guards `/api/settle/*`, `/api/orders/*`, campaign PATCH.
- **Rate limits** (DB-backed token bucket): Claude endpoints 20/min/IP, checkout create 10/min/IP. **Daily AI budget cap** (`AI_DAILY_BUDGET_USD`, counter table, falls back to heuristics and says so in the UI).
- Money-path idempotency keys everywhere (already on PayPal calls); atomic budget increments with a single guarded `UPDATE ... WHERE spent + fee <= budget`.
- Prod env validation at boot (zod) that refuses to start with sandbox/admin secrets missing; no secrets in client bundle; basic CSP and security headers in `next.config.ts`.
**Acceptance:** unauthenticated `curl -X POST /api/settle/payouts` returns 401; load test of 100 parallel captures never overspends a budget.

### WS4. Data, DB, and real PayPal data loop (Dev B) — P0/P1
- **Turso (libSQL)**: `DATABASE_URL=libsql://...` + token (code already supports it). Switch to `drizzle-kit generate` + `migrate`, commit `drizzle/` migrations. `scripts/seed.ts` refuses to run when `NODE_ENV=production` unless `ALLOW_SEED=1`.
- **Label simulation everywhere**: badge "Simulated PayPal network history" on audiences, graph insight, and historical campaigns; `transactions.source` already separates `seed` and `paypal`.
- **Transaction Search ingest (P1)**: `/api/admin/sync-paypal` pulls the hero merchant's sandbox transactions (note the up-to-3-hour sandbox lag; pre-sync before the demo) into `transactions` (source `paypal`) so audiences include real purchases. Uses `searchTransactions` in `lib/paypal/money-movement.ts`.
- Backups: Turso export before submission and before Dec 1.

### WS5. Jobs, automation, real-time (Dev A) — P0/P1
- **Settlement worker**: pays out held funds when the hold expires; idempotent by batch id. Runs from an in-process interval on the Render Node service plus a manual "Settle now" button (admin).
- **Reconciler**: orders stuck `created` > 15 min get fetched from PayPal and settled or failed.
- **Budget guardian that acts (P1)**: every 5 min, campaigns whose measured iROAS < 1.0 for ≥ N sales get paused with a ledger event "paused by guardian: <reason>"; budget exhaustion already pauses.
- SSE: add `Last-Event-ID` resume and 15 s heartbeat; keep polling DB (works on a long-lived Node service, which is why we host on Render, not serverless).

### WS6. AI depth and the PayPal agent stack (Dev B/C) — P0/P1
- **Models by job**: ranking and ask-the-ledger on `claude-haiku-5-5` (cheap, fast), campaign proposals and shopper agent on `claude-sonnet-5-5` or `claude-opus-5-5` (let the eval pick). `ADGENT_MODEL` becomes per-task env vars in `lib/ai/claude.ts`. Prompt-cache the long system prompts.
- **Evals (P0, they become README numbers)**: `npm run eval` runs (a) 25 shopper queries → top-1 relevance and budget-respect rate, (b) 5 merchants → proposal schema validity and grounded-ID rate, (c) 20 ledger questions → filter correctness, (d) **20 prompt-injection attempts planted in product descriptions** → blocked rate. Defense: strip/limit merchant text, mark it as untrusted data in the prompt, never let tool results trigger checkout.
- **PayPal Agent Toolkit for real (P1)**: an "Ops copilot" panel in Mission Control built on `@paypal/agent-toolkit` (list transactions, get order, create refund with human confirm). This earns "Best Use of PayPal + AI". Also expose the **PayPal remote MCP server** alongside ours in the README's Claude Desktop config.
- **Channel3 (P1, cheap)**: the shopper agent also fetches **organic** results from Channel3 and shows "Sponsored" vs "Organic" side by side (honest ads is part of our pitch). Seeded fallback if the key is missing. Skip APIMatic and Bryntum.
- Disclosure: every sponsored offer is labelled in UI, MCP text, and widget (already done); add "why am I seeing this?" popover.

### WS7. Product completeness and design (Dev D) — P0/P1
- Pages to add: `/publisher` (earnings, payouts, embed code generator), `/merchant/campaigns/[id]` (funnel, surfaces, holdout chart, guardian history), offer preview ("what the agent sees / what the widget shows"), `/docs/mcp` (install steps), friendly 404/error pages, OG image and favicon.
- **Mission Control (AG Grid sponsor prize, P0)**: master/detail (campaign → its orders → PayPal IDs and fee/merchant/publisher split), row grouping and aggregation, pivot by surface × campaign, **AG Charts** for spend, revenue and lift over time, sparklines in the campaigns grid, status-bar aggregations, saved filter views. Confirm AG Grid's license/trial terms for Enterprise features at the sponsor's resources page and note usage in the Devpost "Built with".
- Every view: loading skeleton, empty state, error state, keyboard focus, `prefers-reduced-motion` (already in CSS), mobile layout ≥ 360 px, axe pass.
- Merchant flow polish: forecast shows assumptions; launch confirmation with preview of the agent card and widget card.

### WS8. Quality gates (Dev B/D) — P0
- **Vitest**: money math (cents, fee, split invariants `gross = merchant + publisher + platform`), holdout hashing, lift calculation, attribution encode/decode, webhook dedupe, status machine. PayPal HTTP mocked with a fetch stub.
- **Smoke script** `npm run smoke -- <url>`: health, status, offers, create-order (sandbox), webhook signature rejection, 401s. Run against prod before submission and after any deploy.
- **GitHub Actions**: typecheck, lint, vitest, `next build` on every push; main branch protected by green CI.
- Manual QA matrix (section 8) executed on the deployed URL.

### WS9. Deploy and operate (Dev A) — P0
- **Render** web service (Node, `npm run build` / `next start`), `render.yaml` blueprint, env group for secrets, Starter instance (always on), region near US West (judges are PayPal US). **Turso** database. Optional custom domain.
- `/api/health`: DB ping, PayPal token fetch, Anthropic key present, version/commit, uptime. UptimeRobot (free) every 5 min.
- Structured logs (JSON) with request id; `errors` table for money-path failures; admin page `/admin` showing last 50 errors, reconciliation diffs, AI spend today.
- **Freeze policy**: tag `submission-v1` on Nov 12. After that, hotfixes only via PR with green CI + smoke test, none during Dec 1–15 unless broken.
- Cost sheet (approve at plan approval): Render Starter ~$7/mo × 2, Turso free, Channel3 free tier, Anthropic cap $50, domain optional. Total under $75.

### WS10. Submission and story (everyone, Dev D leads) — P0
- **`/judges` page**: 60-second guided tour (4 steps with deep links), sandbox buyer credentials shown on the page (also in Devpost testing field; never in the repo), a "What's real vs simulated" table, architecture diagram, PayPal revenue math, links to repo, video, README.
- **README** rewrite: problem, 3 numbers (eval results, lift, payments verified), architecture diagram (Mermaid), PayPal APIs table, setup, MCP config, honest-limits section, license, team.
- **Video storyboard (2:50)**:
  - 0:00–0:20 hook: "When AI does the shopping, who sees the ads? PayPal's branded checkout grew 1% last quarter. Here is how PayPal wins the agent era."
  - 0:20–0:55 merchant: connect, AI finds 36 lapsed buyers and 101 lookalikes, proposes campaigns, forecast, launch.
  - 0:55–1:35 agent: Claude Desktop (MCP) and in-app agent, "Sponsored" label, Pay Later, PayPal approval, success.
  - 1:35–2:15 Mission Control: the sale lights up the AG Grid ledger live, split into merchant net, ad fee, publisher share; payout lands; ask-your-ads question.
  - 2:15–2:40 trust: injection attempt blocked, holdout lift chart ("this campaign only reached people who'd buy anyway, guardian paused it"), refund reverses the fee.
  - 2:40–2:50 close with PayPal revenue math: "4 revenue lines per ad dollar."
  Record in 1080p with a clean data state (`npm run demo:reset` script resets the demo workspace, not prod data), voiceover script written first, a full backup take recorded, upload unlisted first, test the public link logged out.
- **Devpost text**: Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next, Built with (paypal, claude, mcp, ag-grid, nextjs, render, turso, channel3), links, testing instructions.
- Prize alignment: pick **Best Use of AG Grid** as our sponsor prize on the form; mention Render and Channel3 in text.

## 5. Scoring plan by criterion (what evidence we produce)

| Criterion | Evidence |
|---|---|
| Technological Implementation | Model B settlement across Orders, Captures, Payouts, Refunds, Webhooks, Transaction Search, Invoicing fallback; JS SDK v6 + Pay Later; Agent Toolkit + MCP; evals; tests; CI; reconciler showing 0 diffs. |
| Design | AG Grid control room, polished merchant and publisher flows, a11y and mobile pass, consistent PayPal-adjacent visual system. |
| Potential Impact | Ties directly to PayPal's stalled branded checkout and its PayPal Ads bet; PayPal revenue-per-ad-dollar panel; merchant ROI with honest holdout measurement. |
| Innovation | Ads inside AI agents via MCP, pay-per-sale with relevance-first auction, holdout-proven lift, injection-resistant sponsored content. |
| Presentation | Tight 2:50 video, `/judges` guided tour, README with numbers, honest "real vs simulated" table. |

## 6. Schedule (IST; deadline = Nov 13 01:30 IST, our submit time = Nov 12 19:30 IST)

| Block | Goal | Gate |
|---|---|---|
| **Nov 9, hours 0–4** | Sandbox accounts, extended spike, decide A/B/C. Turso + Render created, first deploy of current code live. `PLAN.md` in repo. CI added. PayPal platform form submitted. | Spike results documented. Deployed URL exists. |
| **Nov 9, hours 4–14** | WS1 settlement B + webhook + dedupe; WS2 v6 checkout; WS3 auth/rate limits. WS7 starts publisher page. | First real sandbox purchase on the deployed URL. |
| **Nov 10, AM** | Payouts, refund, reconciler, guardian automation; Channel3; Agent Toolkit panel; AG Grid master/detail + charts. | Ledger matches PayPal, 0 diffs. |
| **Nov 10, PM** | WS6 evals and injection defense; Transaction Search ingest; publisher + campaign detail pages. WS8 tests written alongside. | `npm run eval` numbers captured. |
| **Nov 11, AM** | QA matrix on prod, mobile, a11y, load test, bug bash by all four. `/judges`, README, Devpost text drafted. | No P0 bugs open. |
| **Nov 11, PM** | **Feature freeze at 18:00 IST.** Record video, 2 takes. Demo workspace reset script. | Video uploaded unlisted. |
| **Nov 11, night** | Final deploy, tag `submission-v1`, backup export, smoke test, rest. | Smoke test green. |
| **Nov 12, AM** | Final read of Rules tab versus checklist; re-test judge path logged out on a fresh phone; set video public. | Stage One checklist all ticked. |
| **Nov 12, by 19:30 IST** | **Submit** on Devpost. Screenshot the confirmation. Then do nothing risky. | Submitted. |
| **Nov 13 → Dec 21** | Watch uptime and AI spend daily; hotfix-only policy; prepare to answer judge questions. | Site up through Dec 21. |

**Cut line if we slip (drop in this order):** Agent Toolkit Ops copilot, Channel3, Transaction Search ingest, guardian auto-pause (keep advice), campaign detail page, pivot view. **Never cut:** Model B (or C) settlement with real payouts, v6 checkout, auth/rate limits, tests for money math, deploy + health, AG Grid ledger, `/judges`, video.

## 7. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Sandbox Payouts disabled or slow | Medium | Spike on hour 0; Model C fallback already coded; show invoice instead. |
| v6 SDK differs from my notes | Medium | Read live docs before coding; keep the redirect flow as backup. |
| PayPal sandbox flakiness during recording | Medium | Pre-record each segment; keep a backup take; use idempotent resets. |
| Claude outage or budget cap hit | Low | Heuristic fallbacks already exist; UI says "fallback mode"; cap alerts in `/admin`. |
| Judges hit a broken deploy in December | Medium | Always-on instance, UptimeRobot, tagged release, backup, smoke test after any change. |
| Prompt injection via merchant text in the live demo | Low | WS6 defenses plus eval; demo it on purpose in the video. |
| Time: 3 days for 10 workstreams | High | Priorities and cut line above; one owner per workstream; daily 2-line status in the repo's `STATUS.md`. |
| Rules tab says something we missed | Low-medium | Section 9 checklist read by a human on Nov 9 and again Nov 12. |

## 8. Verification

- **Local**: `npm run typecheck && npm run lint && npm test && npm run build`.
- **Prod smoke**: `npm run smoke -- https://<app>`; `curl /api/health` returns ok for DB, PayPal and Anthropic.
- **Money**: one purchase through each surface (agent, widget, win-back link); check PayPal sandbox dashboards for capture, payouts, refund; run the reconcile script (0 diffs expected).
- **Security**: unauthenticated admin calls return 401; rate limit returns 429 on the 21st Claude call in a minute; webhook with bad signature returns 401.
- **AI**: `npm run eval` meets targets (ranking ≥ 90%, grounded campaign IDs 100%, injection blocked ≥ 95%).
- **Manual QA matrix**: Chrome, Safari iOS, Android Chrome × (merchant flow, agent flow, widget, Mission Control) plus a logged-out judge walkthrough from `/judges`, timed under 5 minutes.
- **MCP**: Claude Desktop with our config finds an offer, starts checkout, confirms after approval.

## 9. Stage One checklist (a human ticks this against the Devpost Rules tab on Nov 9 and Nov 12)

- [ ] Meaningful use of PayPal **and** AI stated in the description
- [ ] Working project reachable by URL without payment or approval
- [ ] Public repo on GitHub with **MIT license visible** in the About sidebar
- [ ] YouTube video public, **under 3:00**, shows the project working
- [ ] Text description lists features and tools used
- [ ] Sandbox credentials for judges provided in the testing-instructions field
- [ ] Prize category/sponsor choices selected on the form (AG Grid)
- [ ] Team members added, all eligible (age and country rules), no conflicts of interest
- [ ] Confirmation email or screenshot saved before the deadline

## 10. Decisions and actions needed from the team (no code, do first)

1. **Approve spend**: Render Starter, Turso, Anthropic cap (about $75 total through Dec 21).
2. **Create** the PayPal sandbox accounts and app, share keys through a password manager (never in the repo or chat), plus an Anthropic key and optional Channel3 key.
3. **Submit** PayPal's partner/multiparty form (long shot, free option).
4. **Register** on Devpost, join the hackathon, confirm each of the four is on the team.
5. **Read** the Rules tab and paste any rule that contradicts this plan into `STATUS.md`.
6. Assign owners A to D to workstreams.
