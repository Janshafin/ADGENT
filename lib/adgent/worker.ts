import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { env, paypalMode } from "../env";
import { SEED_LIVE_CAMPAIGNS } from "../graph/catalog";
import { getOrder } from "../paypal/orders";
import { PayPalError } from "../paypal/client";
import { settleDue } from "./settlement";
import { completeCheckout, settleCaptured } from "./checkout";
import { campaignMetrics } from "./metrics";
import { record } from "./ledger";

const MIN = 60_000;

/**
 * Orders the buyer never finished (tab closed, webhook lost) get checked against PayPal:
 * completed → booked, approved → captured, abandoned for 3h → failed.
 */
export async function reconcileStuckOrders(now = Date.now()) {
  const d = db();
  const stuck = await d
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.status, "created"), lte(schema.orders.createdAt, new Date(now - 15 * MIN))))
    .limit(25);
  let fixed = 0;
  for (const o of stuck) {
    try {
      const pp = await getOrder(o.id);
      if (pp.status === "COMPLETED") {
        await settleCaptured(pp);
        fixed++;
      } else if (pp.status === "APPROVED") {
        await completeCheckout(o.id);
        fixed++;
      } else if (now - o.createdAt.getTime() > 180 * MIN) {
        const [failed] = await d
          .update(schema.orders)
          .set({ status: "failed" })
          .where(and(eq(schema.orders.id, o.id), eq(schema.orders.status, "created")))
          .returning();
        if (failed) await record({ type: "order_created", campaignId: o.campaignId, merchantId: o.merchantId, paypalRef: o.id, detail: "Abandoned: buyer never approved within 3h, closed by the reconciler" });
      }
    } catch (err) {
      if (err instanceof PayPalError && err.status === 404) {
        await d.update(schema.orders).set({ status: "failed" }).where(and(eq(schema.orders.id, o.id), eq(schema.orders.status, "created")));
      } else {
        console.error("[adgent] reconcile", o.id, err);
      }
    }
  }
  return { checked: stuck.length, fixed };
}

/**
 * The budget guardian acts, not just advises: a live campaign whose holdout test shows
 * it returns less than $1 of incremental revenue per $1 of fees gets paused.
 */
export async function guardianSweep() {
  const paused: string[] = [];
  for (const m of await campaignMetrics()) {
    if (m.status !== "active" || m.iroas === null || m.iroas >= 1) continue;
    const [c] = await db()
      .update(schema.campaigns)
      .set({ status: "paused" })
      .where(and(eq(schema.campaigns.id, m.campaignId), eq(schema.campaigns.status, "active")))
      .returning();
    if (!c) continue;
    paused.push(c.id);
    await record({
      type: "guardian",
      campaignId: c.id,
      merchantId: c.merchantId,
      detail: `Paused by budget guardian: iROAS ${m.iroas}× is below 1×. ${Math.round(m.holdoutRate * 100)}% of the holdout bought anyway vs ${Math.round(m.exposedRate * 100)}% exposed.`,
    });
  }
  return { paused };
}

/**
 * Public-demo upkeep, simulated mode only. Anyone may pause campaigns or spend their budgets
 * there (no real money moves), so a visitor could leave the next judge with no ads to see.
 * Seeded live campaigns that have stayed paused for 15 minutes are switched back on, with the
 * budget topped up if it ran out. Never runs once real PayPal credentials are configured.
 */
export async function demoUpkeep(now = Date.now(), quietMs = 15 * MIN) {
  if (paypalMode() !== "simulated") return { reactivated: [] as string[] };
  const d = db();
  const ids = SEED_LIVE_CAMPAIGNS.map((c) => c.id);
  const paused = await d.select().from(schema.campaigns).where(and(inArray(schema.campaigns.id, ids), eq(schema.campaigns.status, "paused")));
  const reactivated: string[] = [];
  for (const c of paused) {
    const [last] = await d
      .select({ ts: schema.events.ts })
      .from(schema.events)
      .where(and(eq(schema.events.campaignId, c.id), inArray(schema.events.type, ["campaign_paused", "guardian"])))
      .orderBy(desc(schema.events.ts))
      .limit(1);
    if (last && now - last.ts.getTime() < quietMs) continue;
    const budgetCents = c.spentCents >= c.budgetCents ? c.spentCents + 50_000 : c.budgetCents;
    const [on] = await d
      .update(schema.campaigns)
      .set({ status: "active", budgetCents })
      .where(and(eq(schema.campaigns.id, c.id), eq(schema.campaigns.status, "paused")))
      .returning();
    if (!on) continue;
    reactivated.push(c.id);
    await record({ type: "campaign_launched", campaignId: c.id, merchantId: c.merchantId, detail: "Demo upkeep: switched back on after 15 minutes paused (simulated mode only)" });
  }
  return { reactivated };
}

/** One pass of every background job. Each job is isolated so one failure can't stop the others. */
export async function runJobsOnce() {
  const out: Record<string, unknown> = {};
  for (const [name, job] of [
    ["settle", () => settleDue()],
    ["reconcile", () => reconcileStuckOrders()],
    ["guardian", () => guardianSweep()],
    ["demo", () => demoUpkeep()],
  ] as const) {
    try {
      out[name] = await job();
    } catch (err) {
      out[name] = { error: (err as Error).message };
      console.error(`[adgent] job ${name}`, err);
    }
  }
  return out;
}

const g = globalThis as unknown as { __adgentWorker?: ReturnType<typeof setInterval> };

/** In-process timer for a long-lived Node server. Serverless hosts call /api/cron instead. */
export function startWorker(intervalMs = 20_000) {
  if (g.__adgentWorker || env().ADGENT_DISABLE_WORKER) return;
  let running = false;
  g.__adgentWorker = setInterval(() => {
    if (running) return;
    running = true;
    runJobsOnce().finally(() => (running = false));
  }, intervalMs);
  g.__adgentWorker.unref?.();
}
