import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { merchantInsights } from "@/lib/graph/audiences";
import { proposeCampaigns } from "@/lib/ai/campaigns";
import { body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";

export async function POST(req: Request) {
  try {
    rateLimit(req, "propose", 10);
    const { merchantId } = await body(req, z.object({ merchantId: z.string().max(64) }));
    const d = db();
    const [merchant] = await d.select().from(schema.merchants).where(eq(schema.merchants.id, merchantId));
    if (!merchant) return Response.json({ error: "Unknown merchant" }, { status: 404 });
    const products = await d.select().from(schema.products).where(eq(schema.products.merchantId, merchantId));
    const insights = await merchantInsights(merchantId);
    return Response.json(await proposeCampaigns(merchant, products, insights));
  } catch (err) {
    return fail(err);
  }
}
