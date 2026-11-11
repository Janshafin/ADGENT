import { connection } from "next/server";
import { db, schema } from "@/lib/db";
import { fail } from "@/lib/http";

export type PublisherSummary = {
  id: string;
  name: string;
  site: string;
  revShare: number;
  sales: number;
  revenueDriven: number;
  earned: number;
  paid: number;
  pending: number;
  impressions: number;
  payouts: { batchId: string | null; amount: number; status: string; createdAt: string }[];
};

/** Publisher earnings: what their ad slots sold, what they earned, and what PayPal Payouts already sent. */
export async function GET() {
  await connection();
  try {
    const d = db();
    const [pubs, orders, payouts, events] = await Promise.all([
      d.select().from(schema.publishers),
      d.select().from(schema.orders),
      d.select().from(schema.payouts),
      d.select({ type: schema.events.type, publisherId: schema.events.publisherId }).from(schema.events),
    ]);
    const out: PublisherSummary[] = pubs.map((p) => {
      const mine = orders.filter((o) => o.publisherId === p.id && (o.status === "captured" || o.status === "settled"));
      const paidOut = payouts.filter((x) => x.kind === "publisher" && x.publisherId === p.id);
      const paid = paidOut.reduce((a, x) => a + x.amountCents, 0);
      return {
        id: p.id,
        name: p.name,
        site: p.site,
        revShare: p.revShare,
        sales: mine.length,
        revenueDriven: mine.reduce((a, o) => a + o.grossCents - o.discountCents, 0) / 100,
        earned: mine.reduce((a, o) => a + o.publisherShareCents, 0) / 100,
        paid: paid / 100,
        pending: mine.filter((o) => o.status === "captured").reduce((a, o) => a + o.publisherShareCents, 0) / 100,
        impressions: events.filter((e) => e.type === "impression" && e.publisherId === p.id).length,
        payouts: paidOut
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .map((x) => ({ batchId: x.batchId, amount: x.amountCents / 100, status: x.status, createdAt: x.createdAt.toISOString() })),
      };
    });
    return Response.json(out);
  } catch (err) {
    return fail(err);
  }
}
