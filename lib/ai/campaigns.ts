import { z } from "zod";
import type { MerchantInsights, Audience } from "../graph/audiences";
import type { Merchant, Product, CampaignForecast, AudienceKey } from "../db/schema";
import { aiAvailable } from "./budget";
import { structured } from "./claude";
import { usd } from "../util";

const Proposal = z.object({
  name: z.string().describe("Short internal campaign name"),
  objective: z.enum(["winback", "cross_sell", "replenish", "acquire"]),
  audienceKey: z.enum(["lapsed", "high_ltv", "replenish_due", "affinity", "lookalike"]),
  productIds: z.array(z.string()).min(1).max(3),
  discountPct: z.number().int().min(0).max(30),
  payLater: z.boolean().describe("Promote PayPal Pay Later (Pay in 4) on the offer"),
  feeRate: z.number().min(0.04).max(0.2).describe("Pay-per-sale ad fee as a fraction of the sale"),
  budgetCents: z.number().int().min(5000).max(100000).describe("Campaign budget in cents; $50 to $1,000 for this demo"),
  headline: z.string().max(60),
  body: z.string().max(180),
  agentBlurb: z
    .string()
    .max(300)
    .describe("Factual, non-hype product card an AI shopping agent can read to the user"),
  rationale: z.string().max(400).describe("Why this campaign, citing the specific numbers from the data"),
  expectedLiftPct: z.number().min(0).max(300).describe("Expected incremental conversion lift over the audience's baseline, in percent"),
});
const ProposalSet = z.object({ proposals: z.array(Proposal).min(1).max(3) });

export type CampaignProposal = z.infer<typeof Proposal> & { audienceSize: number; forecast: CampaignForecast };

const SYSTEM = `You are ADGENT, the PayPal Ads copilot for small merchants.
You turn a merchant's real PayPal sales data into a few pay-per-sale ad campaigns.
Ads run inside AI shopping agents, on publisher sites and as win-back links, and are paid only when a sale settles on PayPal.

Rules:
- Use only audienceKeys and productIds that appear in the data. Never invent numbers; cite the data in the rationale.
- Prefer the smallest discount that plausibly moves the audience (0% is fine for VIPs and lookalikes).
- Recommend Pay Later for baskets above $30.
- feeRate is a pay-per-sale fee: 0.06–0.10 for repeat customers, 0.10–0.15 for new-customer acquisition.
- agentBlurb must be factual and suitable to be shown to a shopper as a clearly labelled sponsored result.
- Propose up to 3 distinct campaigns that target different audiences.`;

/** Deterministic forecast — the model proposes strategy; the numbers come from the data. */
export function forecastFor(audience: Audience, priceCents: number, discountPct: number, feeRate: number, liftPct: number): CampaignForecast {
  const reach = audience.size;
  // Count only the incremental conversions the ad creates, not purchases that would happen anyway.
  const conv =
    audience.key === "lookalike"
      ? Math.min(0.08, 0.02 * (1 + liftPct / 100))
      : Math.min(0.35, audience.baselineConversion * (liftPct / 100));
  const expectedSales = Math.max(1, Math.round(reach * conv));
  const net = Math.round(priceCents * (1 - discountPct / 100));
  const expectedRevenueCents = expectedSales * net;
  const expectedAdCostCents = Math.round(expectedRevenueCents * feeRate);
  return {
    reach,
    expectedSales,
    expectedRevenueCents,
    expectedAdCostCents,
    expectedRoas: expectedAdCostCents ? +(expectedRevenueCents / expectedAdCostCents).toFixed(1) : 0,
  };
}

function heuristicProposals(insights: MerchantInsights, products: Product[]): z.infer<typeof ProposalSet> {
  const top = insights.topProducts[0]?.productId ?? products[0].id;
  const second = insights.topProducts[1]?.productId ?? top;
  const out: z.infer<typeof Proposal>[] = [];
  for (const a of insights.audiences.slice(0, 3)) {
    const plan: Record<AudienceKey, Partial<z.infer<typeof Proposal>>> = {
      replenish_due: { objective: "replenish", discountPct: 5, feeRate: 0.07, headline: "Running low? Your usual is ready", productIds: [top] },
      lapsed: { objective: "winback", discountPct: 15, feeRate: 0.1, headline: "We miss you — 15% off your favorite", productIds: [top] },
      high_ltv: { objective: "cross_sell", discountPct: 0, feeRate: 0.06, headline: "For our regulars: try something new", productIds: [second] },
      lookalike: { objective: "acquire", discountPct: 10, feeRate: 0.12, headline: "Loved by people who shop like you", productIds: [top] },
      affinity: { objective: "acquire", discountPct: 10, feeRate: 0.12, headline: "Pairs perfectly with what you already buy", productIds: [top] },
    };
    const p = plan[a.key];
    const prod = products.find((x) => x.id === p.productIds![0])!;
    out.push({
      name: `${a.label} → ${prod.title}`.slice(0, 60),
      objective: p.objective!,
      audienceKey: a.key,
      productIds: p.productIds!,
      discountPct: p.discountPct!,
      payLater: prod.priceCents >= 3000,
      feeRate: p.feeRate!,
      budgetCents: 25000,
      headline: p.headline!,
      body: prod.description.slice(0, 180),
      agentBlurb: `${prod.description}${p.discountPct ? ` ${p.discountPct}% off for this audience.` : ""}${prod.priceCents >= 3000 ? " Pay in 4 available with PayPal." : ""}`.slice(0, 300),
      rationale: `${a.size} buyers in "${a.label}" with avg LTV ${usd(a.avgLtvCents)}. ${a.description}`,
      expectedLiftPct: a.key === "lapsed" ? 120 : 60,
    });
  }
  return { proposals: out };
}

export async function proposeCampaigns(merchant: Merchant, products: Product[], insights: MerchantInsights): Promise<{ proposals: CampaignProposal[]; source: "claude" | "heuristic" }> {
  const data = {
    merchant: { id: merchant.id, name: merchant.name, category: merchant.category },
    summary: {
      customers: insights.customers,
      orders: insights.orders,
      revenue: usd(insights.revenueCents),
      repeatRate: `${Math.round(insights.repeatRate * 100)}%`,
      avgReorderCycleDays: insights.avgCycleDays,
    },
    audiences: insights.audiences.map((a) => ({
      key: a.key,
      label: a.label,
      description: a.description,
      size: a.size,
      avgLtv: usd(a.avgLtvCents),
      baseline30dConversion: `${(a.baselineConversion * 100).toFixed(1)}%`,
    })),
    crossMerchantAffinity: insights.affinities.slice(0, 3).map((x) => ({ merchant: x.merchantName, overlap: `${Math.round(x.overlapPct * 100)}%` })),
    products: products.map((p) => {
      const stats = insights.topProducts.find((t) => t.productId === p.id);
      return { id: p.id, title: p.title, price: usd(p.priceCents), unitsSold: stats?.units ?? 0 };
    }),
  };

  let set: z.infer<typeof ProposalSet>;
  let source: "claude" | "heuristic" = "heuristic";
  if (aiAvailable()) {
    try {
      set = await structured({
        system: SYSTEM,
        prompt: `Merchant PayPal sales data:\n${JSON.stringify(data, null, 2)}\n\nPropose the campaigns.`,
        schema: ProposalSet,
        effort: "medium",
      });
      source = "claude";
    } catch (err) {
      console.error("[adgent] campaign proposal fell back to heuristics:", err);
      set = heuristicProposals(insights, products);
    }
  } else {
    set = heuristicProposals(insights, products);
  }

  const proposals = set.proposals.flatMap((p): CampaignProposal[] => {
    const audience = insights.audiences.find((a) => a.key === p.audienceKey);
    const productIds = p.productIds.filter((id) => products.some((x) => x.id === id));
    if (!audience || !productIds.length) return []; // drop anything not grounded in data
    const price = products.find((x) => x.id === productIds[0])!.priceCents;
    return [{ ...p, productIds, audienceSize: audience.size, forecast: forecastFor(audience, price, p.discountPct, p.feeRate, p.expectedLiftPct) }];
  });
  return { proposals, source };
}
