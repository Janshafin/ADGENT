import { z } from "zod";
import { connection } from "next/server";
import { db, schema } from "@/lib/db";
import { campaignMetrics } from "@/lib/adgent/metrics";
import { record } from "@/lib/adgent/ledger";
import { merchantInsights } from "@/lib/graph/audiences";
import { body, fail } from "@/lib/http";
import { id } from "@/lib/util";

export async function GET() {
  await connection();
  try {
    return Response.json(await campaignMetrics());
  } catch (err) {
    return fail(err);
  }
}

const Launch = z.object({
  merchantId: z.string(),
  proposal: z.object({
    name: z.string().min(1).max(80),
    objective: z.enum(["winback", "cross_sell", "replenish", "acquire"]),
    audienceKey: z.enum(["lapsed", "high_ltv", "replenish_due", "affinity", "lookalike"]),
    audienceSize: z.number().int().nonnegative(),
    productIds: z.array(z.string()).min(1),
    discountPct: z.number().int().min(0).max(50),
    payLater: z.boolean(),
    feeRate: z.number().min(0.01).max(0.3),
    budgetCents: z.number().int().min(1000),
    headline: z.string(),
    body: z.string(),
    agentBlurb: z.string(),
    rationale: z.string(),
    forecast: z.object({
      reach: z.number(),
      expectedSales: z.number(),
      expectedRevenueCents: z.number(),
      expectedAdCostCents: z.number(),
      expectedRoas: z.number(),
    }),
  }),
});

export async function POST(req: Request) {
  try {
    const { merchantId, proposal } = await body(req, Launch);
    const campaignId = id("c");
    const audience = (await merchantInsights(merchantId)).audiences.find((a) => a.key === proposal.audienceKey);
    await db().insert(schema.campaigns).values({
      id: campaignId,
      merchantId,
      ...proposal,
      audienceBuyerIds: audience?.buyerIds ?? [],
      holdoutPct: 10,
      spentCents: 0,
      status: "active",
      createdAt: new Date(),
    });
    await record({
      type: "campaign_launched",
      campaignId,
      merchantId,
      detail: `${proposal.audienceSize} buyers · ${proposal.discountPct}% off · ${(proposal.feeRate * 100).toFixed(0)}% pay-per-sale · 10% holdout`,
    });
    return Response.json({ id: campaignId }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
