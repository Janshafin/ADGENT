import { and, eq, isNull, inArray, lte } from "drizzle-orm";
import { db, schema } from "../db";
import type { Order } from "../db/schema";
import { env } from "../env";
import { sendPayouts, sendAdInvoice, type PayoutItem } from "../paypal/money-movement";
import { record } from "./ledger";
import { id, usd } from "../util";

type Recipient = {
  kind: "merchant" | "publisher";
  refId: string;
  name: string;
  email: string;
  cents: number;
  orders: Order[];
};

/** Who gets paid for a batch of settled sales. Pure, so the split rules are unit-tested. */
export function payoutPlan(
  due: Order[],
  merchants: { id: string; name: string; paypalEmail: string | null }[],
  publishers: { id: string; name: string; paypalEmail: string }[],
  fallbackMerchantEmail: (merchantId: string) => string,
): Recipient[] {
  const out = new Map<string, Recipient>();
  const add = (key: string, r: Omit<Recipient, "cents" | "orders">, cents: number, o: Order) => {
    if (cents <= 0) return;
    const cur = out.get(key) ?? { ...r, cents: 0, orders: [] };
    cur.cents += cents;
    cur.orders.push(o);
    out.set(key, cur);
  };
  for (const o of due) {
    // Only in payouts mode did ADGENT receive the merchant's money.
    if (o.feeMode === "payouts") {
      const m = merchants.find((x) => x.id === o.merchantId);
      add(`m:${o.merchantId}`, { kind: "merchant", refId: o.merchantId, name: m?.name ?? o.merchantId, email: m?.paypalEmail || fallbackMerchantEmail(o.merchantId) }, o.merchantNetCents, o);
    }
    if (o.publisherId) {
      const p = publishers.find((x) => x.id === o.publisherId);
      if (p) add(`p:${p.id}`, { kind: "publisher", refId: p.id, name: p.name, email: p.paypalEmail }, o.publisherShareCents, o);
    }
  }
  return [...out.values()];
}

/**
 * Settle every captured sale whose refund hold has passed: one PayPal Payouts batch pays
 * merchants their net (payouts mode) and publishers their revenue share.
 * Orders are claimed before any money moves, so two workers can never pay the same sale twice.
 */
export async function settleDue(opts: { holdSeconds?: number; now?: number } = {}) {
  const d = db();
  const hold = (opts.holdSeconds ?? env().SETTLEMENT_HOLD_SECONDS) * 1000;
  const cutoff = new Date((opts.now ?? Date.now()) - hold);
  const batchId = id("settle");

  const claimed = await d
    .update(schema.orders)
    .set({ payoutId: batchId })
    .where(and(eq(schema.orders.status, "captured"), isNull(schema.orders.payoutId), lte(schema.orders.capturedAt, cutoff)))
    .returning();
  if (!claimed.length) return { batchId: null, paid: [] as { name: string; kind: string; cents: number }[], orders: 0 };

  const [merchants, publishers] = await Promise.all([d.select().from(schema.merchants), d.select().from(schema.publishers)]);
  const plan = payoutPlan(claimed, merchants, publishers, (mid) => `${mid.replace(/^m_/, "")}@merchant.adgent.example`);

  let paypalBatchId = batchId;
  let batchStatus = "NOTHING_TO_PAY";
  if (plan.length) {
    const items: PayoutItem[] = plan.map((r) => ({
      email: r.email,
      cents: r.cents,
      note:
        r.kind === "merchant"
          ? `ADGENT sales for ${r.name}: ${r.orders.length} sale(s), after the pay-per-sale ad fee`
          : `ADGENT revenue share for ${r.orders.length} sale(s) from ads on ${r.name}`,
      senderItemId: `${batchId}-${r.kind[0]}-${r.refId}`.slice(0, 63),
    }));
    try {
      const res = await sendPayouts(batchId, items);
      paypalBatchId = res.batch_header.payout_batch_id;
      batchStatus = res.batch_header.batch_status;
    } catch (err) {
      // Release the claim so the next run retries. PayPal-Request-Id = batchId keeps a retry from paying twice.
      await d.update(schema.orders).set({ payoutId: null }).where(inArray(schema.orders.id, claimed.map((o) => o.id)));
      throw err;
    }
  }

  // A refund that landed between claim and payout keeps status "refunded"; only captured orders become settled.
  await d
    .update(schema.orders)
    .set({ status: "settled", settledAt: new Date(), payoutId: paypalBatchId })
    .where(and(inArray(schema.orders.id, claimed.map((o) => o.id)), eq(schema.orders.status, "captured")));

  for (const r of plan) {
    await d.insert(schema.payouts).values({
      id: id("po"),
      kind: r.kind,
      publisherId: r.kind === "publisher" ? r.refId : null,
      merchantId: r.kind === "merchant" ? r.refId : null,
      receiver: r.email,
      batchId: paypalBatchId,
      amountCents: r.cents,
      status: batchStatus,
      createdAt: new Date(),
    });
    await record({
      type: "payout_sent",
      merchantId: r.kind === "merchant" ? r.refId : null,
      publisherId: r.kind === "publisher" ? r.refId : null,
      amountCents: r.cents,
      paypalRef: paypalBatchId,
      detail: `PayPal Payouts → ${r.kind} ${r.name}: ${usd(r.cents)} for ${r.orders.length} sale(s)`,
    });
  }
  return { batchId: paypalBatchId, paid: plan.map((r) => ({ name: r.name, kind: r.kind, cents: r.cents })), orders: claimed.length };
}

/** invoice fee mode: bill a merchant for every settled, unbilled sale via the PayPal Invoicing API. */
export async function billMerchant(merchantId: string) {
  const d = db();
  const [merchant] = await d.select().from(schema.merchants).where(eq(schema.merchants.id, merchantId));
  if (!merchant) throw new Error("Unknown merchant");
  const email = merchant.paypalEmail || `${merchant.id.replace(/^m_/, "")}@merchant.adgent.example`;

  const due = await d
    .select()
    .from(schema.orders)
    .where(
      and(
        eq(schema.orders.merchantId, merchantId),
        inArray(schema.orders.status, ["captured", "settled"]),
        eq(schema.orders.feeMode, "invoice"),
        isNull(schema.orders.invoiceId),
      ),
    );
  if (!due.length) return null;

  const camps = await d.select().from(schema.campaigns).where(eq(schema.campaigns.merchantId, merchantId));
  const total = due.reduce((a, o) => a + o.feeCents, 0);
  const localId = id("inv");
  const { invoiceId } = await sendAdInvoice({
    merchantEmail: email,
    merchantName: merchant.name,
    lines: due.map((o) => ({
      name: `Ad fee · ${camps.find((c) => c.id === o.campaignId)?.name ?? "campaign"} · sale ${o.id}`,
      cents: o.feeCents,
    })),
    memo: `${due.length} sale(s) settled on PayPal. Sales revenue: ${usd(due.reduce((a, o) => a + o.grossCents - o.discountCents, 0))}. You only pay for sales.`,
    idempotencyKey: localId,
  });

  await d.insert(schema.adInvoices).values({
    id: localId,
    merchantId,
    paypalInvoiceId: invoiceId,
    amountCents: total,
    orderIds: due.map((o) => o.id),
    status: "SENT",
    createdAt: new Date(),
  });
  await d.update(schema.orders).set({ invoiceId }).where(inArray(schema.orders.id, due.map((o) => o.id)));
  await record({
    type: "invoice_sent",
    merchantId,
    feeCents: total,
    paypalRef: invoiceId,
    detail: `Pay-per-sale PayPal invoice for ${due.length} sale(s)`,
  });
  return { invoiceId, totalCents: total, orders: due.length };
}
