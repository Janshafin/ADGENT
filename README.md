# ADGENT: PayPal Ads for the AI-shopping era

> **When AI does the shopping, who sees the ads?**
> ADGENT lets small merchants launch AI-built campaigns from their PayPal sales data. The ads run **inside AI shopping agents** (through MCP) and on publisher sites, and merchants **pay only when a sale settles on PayPal**.

Built for the [PayPal AI Hackathon 2026](https://paypalaihackathon.devpost.com/).

## Why this matters to PayPal

- Branded checkout, PayPal's highest-margin product, has grown only 1–2% for four straight quarters.
- PayPal is betting on **PayPal Ads**: the Transaction Graph, Storefront ads, and an SMB Ads Manager.
- Shopping is moving into AI agents, where nobody sees banner ads. Whoever owns *sponsored placement inside agents*, backed by real purchase data, owns the next ad market. PayPal is the only company with both the transaction graph **and** the checkout.

Every ADGENT ad dollar brings PayPal four revenue lines: **ad fee + branded-checkout volume + Pay Later + publisher Payouts**.

## What it does

| | |
|---|---|
| **Merchant Copilot** (`/merchant`) | Builds audiences from the PayPal transaction graph: due for a refill, lapsed, VIP, and lookalikes taken from cross-merchant affinity. Claude proposes campaigns, and the forecasts are computed from the data, not by the model. |
| **AI agent surface** (`mcp-server/`, `/agent`) | An MCP server with `find_sponsored_offers`, `start_paypal_checkout` and `confirm_purchase`. Offers are labelled as sponsored, ranked relevance-first (`relevance × (1+bid) × merchant trust`), and the shopper always approves the payment on PayPal. |
| **Publisher widget** (`public/widget.js`, `/demo/blog`) | Shoppable ad units added to any site with one script tag. Publishers earn a share of the ad fee through **PayPal Payouts**. |
| **Closed-loop settlement** | Click → Orders v2 order with attribution in `custom_id` → capture → the ad fee is split with `platform_fees` (or billed with the **Invoicing API**) → publisher **Payouts** → **Refunds** reverse the fee. **Webhooks** keep the ledger correct. |
| **Honest measurement** | Every campaign has a stable-hash 10% **holdout** that never sees the ad. Mission Control reports **incremental ROAS** and lift, and the budget guardian flags campaigns that only reach buyers who would have bought anyway. |
| **Mission Control** (`/control`, AG Grid) | A live SSE-streamed attribution ledger, an inline-editable campaign grid, "ask your ads" (English → grid filters), and a PayPal P&L panel. |

## PayPal APIs used

Orders v2 (custom_id attribution, discount breakdown, payee, `platform_fees`), Captures, Refunds, Payouts, Invoicing, Transaction Search, Webhooks + signature verification, JS SDK Smart Buttons + Pay Later messaging. Claude (`claude-opus-5-5`) handles campaign strategy, offer relevance ranking, natural-language ledger queries and the in-app shopping agent.

## Quick start

```bash
npm install
cp .env.example .env        # fill in the PayPal sandbox and Anthropic keys
npm run db:push             # create the SQLite schema
npm run db:seed             # seed the demo transaction graph (5 merchants, 600 buyers, ~2.7k purchases)
npm run dev                 # http://localhost:3000
npm run spike               # checks your sandbox app: orders, platform_fees, payouts, invoicing, reporting
```

The app runs without keys: AI falls back to heuristics, and checkout asks for PayPal credentials.

### Use it from Claude Desktop

Add this to `claude_desktop_config.json`:

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

Then ask Claude: *"Find me good espresso beans under $25."*

### PayPal sandbox setup

1. In developer.paypal.com → Sandbox, create a REST app. Its credentials go in `PAYPAL_CLIENT_ID`/`SECRET` and `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.
2. Use sandbox accounts: a **business** account for the hero merchant (`DEMO_MERCHANT_PAYPAL_EMAIL`), a **personal** account for the shopper, and a personal account for the publisher (`DEMO_PUBLISHER_PAYPAL_EMAIL`).
3. Add a webhook pointing at `/api/webhooks/paypal` with `PAYMENT.CAPTURE.*` and `PAYMENT.PAYOUTSBATCH.*`, and put its id in `PAYPAL_WEBHOOK_ID`.
4. Run `npm run spike`. If `platform_fees` works for your app, set `ADGENT_FEE_MODE=platform_fees`. Otherwise keep `invoice`.

## Data honesty

The cross-merchant transaction graph and the two historical campaigns are **seeded synthetic data** (labelled "simulated history" in the ledger), because a sandbox has no real shoppers. Everything you do live goes through the real PayPal sandbox: orders, captures, fees, payouts, refunds and invoices. Every live sale is also written back into the graph.

## Architecture

```
app/                 Next.js 16 App Router (UI + API routes)
lib/paypal/          typed PayPal REST client: orders, refunds, payouts, invoicing, reporting, webhooks
lib/graph/           transaction graph + audience builder
lib/ai/              Claude: campaigns, offer ranking, ask-the-ledger, shopping agent
lib/adgent/          offers auction, checkout/settlement, ledger, metrics + holdout lift
mcp-server/          MCP server for AI shopping agents
public/widget.js     embeddable shoppable ad unit
scripts/             seed + PayPal sandbox spike
```

## License

MIT. See [LICENSE](./LICENSE).
