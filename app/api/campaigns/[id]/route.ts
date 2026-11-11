import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { record } from "@/lib/adgent/ledger";
import { body, fail, HttpError } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";
import { usd } from "@/lib/util";

const Patch = z
  .object({
    status: z.enum(["active", "paused"]).optional(),
    budgetCents: z.number().int().min(1000).max(100_000).optional(),
    feeRate: z.number().min(0.01).max(0.3).optional(),
    discountPct: z.number().int().min(0).max(50).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");

export async function PATCH(req: Request, ctx: RouteContext<"/api/campaigns/[id]">) {
  try {
    rateLimit(req, "campaign-edit", 30);
    const { id } = await ctx.params;
    const patch = await body(req, Patch);
    const d = db();
    const [before] = await d.select().from(schema.campaigns).where(eq(schema.campaigns.id, id));
    if (!before) return Response.json({ error: "Not found" }, { status: 404 });
    const budget = patch.budgetCents ?? before.budgetCents;
    if (patch.status === "active" && before.spentCents >= budget) throw new HttpError(409, "Budget is used up. Raise the budget before resuming.");

    const [c] = await d.update(schema.campaigns).set(patch).where(eq(schema.campaigns.id, id)).returning();
    const changes = [
      patch.status && patch.status !== before.status ? `status ${before.status} → ${patch.status}` : null,
      patch.budgetCents !== undefined && patch.budgetCents !== before.budgetCents ? `budget ${usd(before.budgetCents)} → ${usd(patch.budgetCents)}` : null,
      patch.feeRate !== undefined && patch.feeRate !== before.feeRate ? `fee ${Math.round(before.feeRate * 100)}% → ${Math.round(patch.feeRate * 100)}%` : null,
      patch.discountPct !== undefined && patch.discountPct !== before.discountPct ? `discount ${before.discountPct}% → ${patch.discountPct}%` : null,
    ].filter(Boolean);
    if (changes.length) {
      const resumed = patch.status === "active" && before.status !== "active";
      const paused = patch.status === "paused" && before.status !== "paused";
      await record({
        type: resumed ? "campaign_launched" : paused ? "campaign_paused" : "guardian",
        campaignId: c.id,
        merchantId: c.merchantId,
        detail: `Edited in Mission Control: ${changes.join(", ")}`,
      });
    }
    return Response.json(c);
  } catch (err) {
    return fail(err);
  }
}
