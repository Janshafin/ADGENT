import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { record } from "@/lib/adgent/ledger";
import { body, fail } from "@/lib/http";

const Patch = z.object({
  status: z.enum(["active", "paused"]).optional(),
  budgetCents: z.number().int().min(1000).optional(),
  feeRate: z.number().min(0.01).max(0.3).optional(),
  discountPct: z.number().int().min(0).max(50).optional(),
});

export async function PATCH(req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  try {
    const { id } = await ctx.params;
    const patch = await body(req, Patch);
    const [c] = await db().update(schema.campaigns).set(patch).where(eq(schema.campaigns.id, id)).returning();
    if (!c) return Response.json({ error: "Not found" }, { status: 404 });
    if (patch.status) {
      await record({ type: patch.status === "active" ? "campaign_launched" : "campaign_paused", campaignId: c.id, merchantId: c.merchantId, detail: `Set ${patch.status} from Mission Control` });
    }
    return Response.json(c);
  } catch (err) {
    return fail(err);
  }
}
