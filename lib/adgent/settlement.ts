import { and, eq, isNull, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { sendPayouts, sendAdInvoice } from "../paypal/money-movement";
import { record } from "./ledger";
import { id, usd } from "../util";

/** Pay every publisher their share of captured, not-yet-paid ad fees in one PayPal Payouts batch. */
export async function payPublishers() {
  const d = db();
  const due = await d
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.status, "captured"), isNull(schema.orders.payoutId)));
  const byPub = new Map<string, typeof due>();
  for (const o of due) {
    if (!o.publisherId || o.publisherShareCents <= 0) continue;
    byPub.set(o.publisherId, [...(byPub.get(o.publisherId) ?? []), o]);
  }
  if (!byPub.size) return { batchId: null, paid: [] as { publisher: string; cents: number }[] };

  const pubs = await d.select().from(schema.publishers).where(inArray(schema.publishers.id, [...byPub.keys()]));
  const batchId = id("payout");
  const items = pubs.map((p) => ({
    publisher: p,
    orders: byPub.get(p.id)!,
    cents: byPub.get(p.id)!.reduce((a, o) => a + o.publisherShareCents, 0),
  }));

  const res = await sendPayouts(
    batchId,
    items.map((i) => ({
      email: i.publisher.paypalEmail,
      cents: i.cents,
      note: `ADGENT revenue share for ${i.orders.length} sale(s) from ads on ${i.publisher.name}`,
      senderItemId: `${batchId}-${i.publisher.id}`.slice(0, 63),
    })),
  );

  for (const i of items) {
    await d.insert(schema.payouts).values({
      id: id("po"),
      publisherId: i.publisher.id,
      batchId: res.batch_header.payout_batch_id,
      amountCents: i.cents,
      status: res.batch_header.batch_status,
      createdAt: new Date(),
    });
    await d.update(schema.orders).set({ payoutId: res.batch_header.payout_batch_id }).where(inArray(schema.orders.id, i.orders.map((o) => o.id)));
    await record({
      type: "payout_sent",
      publisherId: i.publisher.id,
      amountCents: i.cents,
      paypalRef: res.batch_header.payout_batch_id,
      detail: `PayPal Payouts → ${i.publisher.name}: ${usd(i.cents)} for ${i.orders.length} sale(s)`,
    });
  }
  return { batchId: res.batch_header.payout_batch_id, paid: items.map((i) => ({ publisher: i.publisher.name, cents: i.cents })) };
}

/** invoice fee mode: bill a merchant for every settled, unbilled sale via the PayPal Invoicing API. */
export async function billMerchant(merchantId: string) {
  const d = db();
  const [merchant] = await d.select().from(schema.merchants).where(eq(schema.merchants.id, merchantId));
  if (!merchant) throw new Error("Unknown merchant");
  if (!merchant.paypalEmail) throw new Error(`${merchant.name} has no PayPal email on file`);

  const due = await d
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.merchantId, merchantId), eq(schema.orders.status, "captured"), eq(schema.orders.feeMode, "invoice"), isNull(schema.orders.invoiceId)));
  if (!due.length) return null;

  const camps = await d.select().from(schema.campaigns).where(eq(schema.campaigns.merchantId, merchantId));
  const total = due.reduce((a, o) => a + o.feeCents, 0);
  const localId = id("inv");
  const { invoiceId } = await sendAdInvoice({
    merchantEmail: merchant.paypalEmail,
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
