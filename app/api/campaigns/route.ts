import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/lib/db";
import { campaignMetrics } from "@/lib/adgent/metrics";
import { record } from "@/lib/adgent/ledger";
import { merchantInsights } from "@/lib/graph/audiences";
import { body, fail, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";
import { id } from "@/lib/util";

export async function GET() {
  await connection();
  try {
    return Response.json(await campaignMetrics());
  } catch (err) {
    return fail(err);
  }
}

/** Demo guard rails: anyone can launch, within limits. */
const MAX_BUDGET_CENTS = 100_000;
const MAX_ACTIVE_PER_MERCHANT = 8;

const Launch = z.object({
  merchantId: z.string().max(64),
  proposal: z.object({
    name: z.string().min(1).max(80),
    objective: z.enum(["winback", "cross_sell", "replenish", "acquire"]),
    audienceKey: z.enum(["lapsed", "high_ltv", "replenish_due", "affinity", "lookalike"]),
    audienceSize: z.number().int().nonnegative(),
    productIds: z.array(z.string().max(64)).min(1).max(3),
    discountPct: z.number().int().min(0).max(50),
    payLater: z.boolean(),
    feeRate: z.number().min(0.01).max(0.3),
    budgetCents: z.number().int().min(1000).max(MAX_BUDGET_CENTS),
    headline: z.string().min(1).max(80),
    body: z.string().max(240),
    agentBlurb: z.string().min(1).max(400),
    rationale: z.string().max(600),
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
    rateLimit(req, "launch", 10);
    const { merchantId, proposal } = await body(req, Launch);
    const d = db();
    const [merchant] = await d.select().from(schema.merchants).where(eq(schema.merchants.id, merchantId));
    if (!merchant) throw new HttpError(404, "Unknown merchant");
    // A merchant can only advertise its own products.
    const owned = await d.select({ id: schema.products.id }).from(schema.products).where(eq(schema.products.merchantId, merchantId));
    if (!proposal.productIds.every((pid) => owned.some((p) => p.id === pid))) throw new HttpError(400, "Campaign products must belong to this merchant");
    const active = await d
      .select({ id: schema.campaigns.id })
      .from(schema.campaigns)
      .where(and(eq(schema.campaigns.merchantId, merchantId), eq(schema.campaigns.status, "active")));
    if (active.length >= MAX_ACTIVE_PER_MERCHANT) {
      throw new HttpError(409, `${merchant.name} already has ${MAX_ACTIVE_PER_MERCHANT} live campaigns. Pause one in Mission Control first.`);
    }

    const campaignId = id("c");
    const audience = (await merchantInsights(merchantId)).audiences.find((a) => a.key === proposal.audienceKey);
    if (!audience) throw new HttpError(400, "That audience is empty for this merchant");
    await d.insert(schema.campaigns).values({
      id: campaignId,
      merchantId,
      ...proposal,
      audienceSize: audience.size,
      audienceBuyerIds: audience.buyerIds,
      holdoutPct: 10,
      spentCents: 0,
      status: "active",
      createdAt: new Date(),
    });
    await record({
      type: "campaign_launched",
      campaignId,
      merchantId,
      detail: `${audience.size} buyers · ${proposal.discountPct}% off · ${(proposal.feeRate * 100).toFixed(0)}% pay-per-sale · 10% holdout`,
    });
    return Response.json({ id: campaignId }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
