import { and, eq, lte } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
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

/** One pass of every background job. Each job is isolated so one failure can't stop the others. */
export async function runJobsOnce() {
  const out: Record<string, unknown> = {};
  for (const [name, job] of [
    ["settle", () => settleDue()],
    ["reconcile", () => reconcileStuckOrders()],
    ["guardian", () => guardianSweep()],
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
