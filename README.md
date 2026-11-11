# ADGENT: PayPal Ads for the AI-shopping era

> **When AI does the shopping, who sees the ads?**
> ADGENT lets small merchants launch AI-built campaigns from their PayPal sales data. The ads run **inside AI shopping agents** (through MCP) and on publisher sites, and merchants **pay only when a sale settles on PayPal**.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/). MIT licensed.

**Try it:** open the deployed site and follow **`/judges`**, a four-step tour that takes about a minute. No login.

## Why this matters to PayPal

- Branded checkout, PayPal's highest-margin product, has grown only 1–2% a quarter.
- Shopping is moving into AI agents, where nobody sees a banner ad. Whoever owns *sponsored placement inside agents*, proven by real purchases, owns the next ad market.
- PayPal is the only company with both the **transaction graph** and the **checkout**. ADGENT turns that into an ad product where every ad dollar brings PayPal four revenue lines: **ad fee + branded-checkout volume + Pay Later + Payouts**.

## What it does

| Surface | What happens |
|---|---|
| **Merchant Copilot** (`/merchant`) | Builds audiences from the transaction graph: due for a refill, lapsed, VIP, and lookalikes from cross-merchant affinity. Claude proposes campaigns; **forecasts are computed from the data, not by the model**, and proposals that cite audiences or products that don't exist are dropped. |
| **AI shopping agent** (`/agent`, `mcp-server/`) | `find_sponsored_offers`, `start_paypal_checkout`, `confirm_purchase`. Every offer is labelled Sponsored and ranked **relevance first**: `relevance × (1 + bid) × merchant trust`, so a high bid can't buy an irrelevant slot. The shopper always approves payment on PayPal. |
| **Publisher widget** (`public/widget.js`, `/demo/blog`, `/publisher`) | Shoppable ad slots from one script tag. Publishers earn a share of the ad fee, paid with **PayPal Payouts**. |
| **Mission Control** (`/control`, AG Grid) | Live SSE-streamed attribution ledger, an Orders grid showing where every cent of each sale went (with Refund), inline-editable campaigns, "ask your ads" (English → grid filters), the PayPal P&L, and the budget guardian. |

## How a sale settles (default `payouts` mode)

```
click ─▶ PayPal order (Orders v2, discount line, custom_id = adg|campaign|surface|publisher)
      ─▶ buyer approves on PayPal ─▶ capture (fee booked, budget charged, sale fed back into the graph)
      ─▶ refund hold (2 min in the demo) ─▶ one PayPal Payouts batch: merchant net + publisher share
      ─▶ refund at any point reverses the fee (and records a clawback if payouts already went out)
```

ADGENT is the payee for ad-attributed orders, so everything works with a standard first-party REST app. Two other modes are built in: `platform_fees` (PayPal splits the fee at capture; needs a Multiparty-enabled partner app) and `invoice` (the merchant is paid directly and billed for fees with the Invoicing API). `npm run spike` tells you which your sandbox app supports.

## PayPal APIs used

| API | Where |
|---|---|
| Orders v2 (create, capture, get) | `lib/paypal/orders.ts`, attribution in `custom_id`, discount breakdown, optional payee / `platform_fees` |
| Payments: refunds | `lib/paypal/money-movement.ts`, `lib/adgent/checkout.ts` |
| Payouts | `lib/adgent/settlement.ts`: merchants and publishers in one batch, after the refund hold |
| Invoicing | `invoice` fee mode: pay-per-sale ad bill |
| Webhooks + signature verification | `app/api/webhooks/paypal`: verified, de-duplicated by event id, fails closed |
| JS SDK Smart Buttons + Pay Later messaging | `components/PayPalCheckout.tsx` |

Claude: **Opus 5.5** for campaign strategy and the shopping agent (with server-side refusal fallbacks), **Haiku 5.5** for offer ranking and "ask your ads". System prompts are cached.

## Trust, safety and correctness

- **Pay only for sales.** The fee exists only on a captured sale; a refund reverses it.
- **Honest measurement.** A stable 10% holdout per campaign never sees the ad. Mission Control reports incremental ROAS and lift against it, and the **budget guardian pauses** campaigns below 1× iROAS. Shoppers in a holdout are told why they see no ad.
- **Prompt-injection defense.** Advertiser text is cleaned at the source (markup, hidden characters, instruction phrases), handed to models only inside `<untrusted_offer_data>`, and loses rank if it tries to steer the agent. Structurally, an agent can only check out an offer it showed the shopper, and the shopper approves every payment.
- **Money-path safety.** Capture, settlement and refunds are idempotent (PayPal-Request-Id + conditional DB updates); orders are claimed before a payout so a sale can't be paid twice; budgets are checked before an order exists; stuck orders are reconciled against PayPal; webhooks are verified and de-duplicated.
- **Abuse limits.** Rate limits on AI and checkout endpoints, validated inputs, demo caps on budgets and live campaigns, and an admin token for payouts, refunds, invoices and campaign edits once real PayPal keys are set.
- **Web hardening.** Strict security headers (CSP, HSTS, frame-ancestors none, nosniff), a cross-site request guard on every state-changing API call, JSON-only size-capped request bodies, a global hourly cap on Claude calls, and no internal error text in production responses. See [SECURITY.md](SECURITY.md) for the full threat model.

## What's real and what's simulated

| Part | Status |
|---|---|
| Orders, captures, refunds, payouts, invoices | Real PayPal REST calls. **Without sandbox keys**, a built-in simulator answers the same calls (state in the DB, PayPal-style ids and errors), and every page shows a "PayPal simulated" banner. Add keys and the same code hits the sandbox. |
| Attribution, split, holdout, iROAS, guardian, ledger | Real code on every sale |
| Claude features | Real with `ANTHROPIC_API_KEY`; otherwise deterministic fallbacks (an offline shopping agent, keyword ranking, rule-based proposals), labelled in the UI |
| Transaction graph (600 buyers, ~2.7k purchases) and two past campaigns | Synthetic seed data, because a sandbox has no real shoppers. Labelled "simulated history". Live sales are written back into the graph. |

## Quick start

```bash
npm install
cp .env.example .env     # everything is optional; with no keys it runs on the simulator
npm run setup            # migrate the SQLite schema + seed the demo graph and 5 live campaigns
npm run dev              # http://localhost:3000
```

With PayPal sandbox keys:

1. developer.paypal.com → Sandbox → create a REST app owned by a **business** account. Put its credentials in `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` / `NEXT_PUBLIC_PAYPAL_CLIENT_ID`. Use a **personal** sandbox account to buy.
2. Add a webhook to `<APP_URL>/api/webhooks/paypal` for `PAYMENT.CAPTURE.*` and `PAYMENT.PAYOUTSBATCH.*`; put its id in `PAYPAL_WEBHOOK_ID`.
3. Set `ADMIN_TOKEN` (24+ random characters) and enter it in Mission Control to settle or refund.
4. `npm run spike` checks orders, Payouts, Invoicing and `platform_fees` against your app and recommends a fee mode.

### Use it from Claude Desktop

```json
{
  "mcpServers": {
    "adgent": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/adgent/mcp-server/index.ts"],
      "env": { "ADGENT_URL": "http://localhost:3000" }
    }
  }
}
```

Then ask: *"Find me good espresso beans under $25."*

## Deploy

`render.yaml` is a Render blueprint: one always-on Node service (the settlement worker runs in-process and the ledger streams over SSE). Set `DATABASE_URL` to a Turso `libsql://` URL so data survives deploys; a fresh database is migrated and seeded on first start (`npm run start:prod`). `/api/health` reports database, PayPal and Claude status.

## Verification

```bash
npm run check            # typecheck + lint + 69 tests
npm run build
```

The tests cover the full money path against the simulator (order → approval → racing captures → hold → payouts → refund → replayed webhook), the order body PayPal receives in each fee mode, cents parsing, payout planning, rate limits, the admin guard, holdout stability, offline relevance on the demo prompts, the offline agent, ten prompt-injection attacks, and the web-security guards (cross-site requests, oversized and non-JSON bodies, forged Host headers, spoofed client IPs, PII in public APIs, smuggled agent history, the AI spend cap and demo self-repair).

## Architecture

```
app/                 Next.js 16 App Router: pages + API routes
lib/paypal/          typed PayPal REST client, simulator, webhooks
lib/adgent/          offers auction, checkout, settlement (Payouts), ledger, metrics + holdout lift, background worker
lib/ai/              Claude: campaigns, offer ranking, ask-the-ledger, shopping agent, untrusted-text defense
lib/graph/           transaction graph + audience builder
mcp-server/          MCP server for AI shopping agents
public/widget.js     embeddable shoppable ad unit
drizzle/             SQL migrations
tests/               vitest suite
```

## License

MIT. See [LICENSE](./LICENSE).
