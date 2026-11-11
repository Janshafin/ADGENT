import { connection } from "next/server";
import { desc } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { fail } from "@/lib/http";

export type OrderRow = {
  id: string;
  createdAt: string;
  status: string;
  surface: string;
  campaignName: string | null;
  merchantName: string;
  publisherName: string | null;
  productTitle: string;
  sale: number;
  fee: number;
  merchantNet: number;
  publisherShare: number;
  feeMode: string;
  captureId: string | null;
  payoutId: string | null;
  refundId: string | null;
};

/** Live PayPal orders with the money split, newest first. Buyer details are not exposed. */
export async function GET() {
  await connection();
  try {
    const d = db();
    const [orders, campaigns, merchants, publishers, products] = await Promise.all([
      d.select().from(schema.orders).orderBy(desc(schema.orders.createdAt)).limit(300),
      d.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns),
      d.select({ id: schema.merchants.id, name: schema.merchants.name }).from(schema.merchants),
      d.select({ id: schema.publishers.id, name: schema.publishers.name }).from(schema.publishers),
      d.select({ id: schema.products.id, title: schema.products.title }).from(schema.products),
    ]);
    const name = <T extends { id: string }>(xs: T[], id: string | null, key: keyof T) => (id ? (xs.find((x) => x.id === id)?.[key] as string) ?? id : null);
    const rows: OrderRow[] = orders.map((o) => ({
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      status: o.status,
      surface: o.surface,
      campaignName: name(campaigns, o.campaignId, "name"),
      merchantName: name(merchants, o.merchantId, "name") ?? o.merchantId,
      publisherName: name(publishers, o.publisherId, "name"),
      productTitle: name(products, o.productId, "title") ?? o.productId,
      sale: (o.grossCents - o.discountCents) / 100,
      fee: o.feeCents / 100,
      merchantNet: o.merchantNetCents / 100,
      publisherShare: o.publisherShareCents / 100,
      feeMode: o.feeMode,
      captureId: o.captureId,
      payoutId: o.status === "settled" || o.status === "refunded" ? o.payoutId : null,
      refundId: o.refundId,
    }));
    return Response.json(rows);
  } catch (err) {
    return fail(err);
  }
}
