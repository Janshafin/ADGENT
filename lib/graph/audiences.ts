import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { AudienceKey } from "../db/schema";
import { DAY } from "../util";

export type Audience = {
  key: AudienceKey;
  label: string;
  description: string;
  size: number;
  avgLtvCents: number;
  /** Probability a member buys within 30 days with no ad (from history) */
  baselineConversion: number;
  buyerIds: string[];
  /** For affinity audiences: the merchant whose buyers we borrow */
  sourceMerchantId?: string;
};

export type MerchantInsights = {
  merchantId: string;
  customers: number;
  orders: number;
  revenueCents: number;
  repeatRate: number;
  avgCycleDays: number | null;
  audiences: Audience[];
  affinities: { merchantId: string; merchantName: string; overlapPct: number }[];
  topProducts: { productId: string; title: string; units: number; revenueCents: number }[];
};

type BuyerStat = { buyerId: string; orders: number; ltv: number; first: number; last: number; avgGap: number | null };

function buyerStats(txs: { buyerId: string; amountCents: number; createdAt: Date }[]): Map<string, BuyerStat> {
  const byBuyer = new Map<string, number[]>();
  const ltv = new Map<string, number>();
  for (const t of txs) {
    const list = byBuyer.get(t.buyerId) ?? [];
    list.push(t.createdAt.getTime());
    byBuyer.set(t.buyerId, list);
    ltv.set(t.buyerId, (ltv.get(t.buyerId) ?? 0) + t.amountCents);
  }
  const out = new Map<string, BuyerStat>();
  for (const [buyerId, times] of byBuyer) {
    times.sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    out.set(buyerId, {
      buyerId,
      orders: times.length,
      ltv: ltv.get(buyerId) ?? 0,
      first: times[0],
      last: times[times.length - 1],
      avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    });
  }
  return out;
}

/** Reads the transaction graph and derives targetable audiences for one merchant. */
export async function merchantInsights(merchantId: string, now = Date.now()): Promise<MerchantInsights> {
  const d = db();
  const [allTx, allMerchants, merchantProducts] = await Promise.all([
    d.select().from(schema.transactions),
    d.select().from(schema.merchants),
    d.select().from(schema.products).where(eq(schema.products.merchantId, merchantId)),
  ]);

  const mine = allTx.filter((t) => t.merchantId === merchantId);
  const stats = buyerStats(mine);
  const all = [...stats.values()];
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

  const gaps = all.map((s) => s.avgGap).filter((g): g is number => g !== null);
  const avgCycle = gaps.length ? avg(gaps) : null;

  // Baseline: share of customers with a purchase in any given 30-day window, from history.
  const windowConv = (members: BuyerStat[]) => {
    if (!members.length) return 0;
    const span = Math.max(30 * DAY, now - Math.min(...members.map((m) => m.first)));
    const ordersPerBuyerPer30 = avg(members.map((m) => m.orders)) / (span / (30 * DAY));
    return Math.min(0.9, Math.max(0.005, 1 - Math.exp(-ordersPerBuyerPer30)));
  };

  const lapsed = all.filter((s) => now - s.last > 60 * DAY);
  const sortedLtv = [...all].sort((a, b) => b.ltv - a.ltv);
  const highLtv = sortedLtv.slice(0, Math.max(1, Math.round(all.length * 0.2)));
  const replenishDue = all.filter(
    (s) => s.orders >= 2 && s.avgGap !== null && now - s.last > s.avgGap * 1.15 && now - s.last <= 60 * DAY,
  );

  // Cross-merchant affinity: of my buyers, what share also buy from merchant X?
  const myBuyers = new Set(stats.keys());
  const buyersByMerchant = new Map<string, Set<string>>();
  for (const t of allTx) {
    const s = buyersByMerchant.get(t.merchantId) ?? new Set<string>();
    s.add(t.buyerId);
    buyersByMerchant.set(t.merchantId, s);
  }
  const affinities = allMerchants
    .filter((m) => m.id !== merchantId)
    .map((m) => {
      const theirs = buyersByMerchant.get(m.id) ?? new Set<string>();
      const overlap = [...myBuyers].filter((b) => theirs.has(b)).length;
      return { merchantId: m.id, merchantName: m.name, overlapPct: myBuyers.size ? overlap / myBuyers.size : 0 };
    })
    .sort((a, b) => b.overlapPct - a.overlapPct);

  // Lookalike: buyers of my strongest-affinity merchant who have never bought from me.
  const top = affinities[0];
  const lookalikeIds = top
    ? [...(buyersByMerchant.get(top.merchantId) ?? [])].filter((b) => !myBuyers.has(b))
    : [];
  const lookalikeStats = buyerStats(allTx.filter((t) => t.merchantId === top?.merchantId && lookalikeIds.includes(t.buyerId)));

  const audiences: Audience[] = [
    {
      key: "replenish_due",
      label: "Due for a refill",
      description: `Repeat customers past their usual ${avgCycle ? Math.round(avgCycle / DAY) : "?"}-day reorder cycle, but not lost yet.`,
      size: replenishDue.length,
      avgLtvCents: Math.round(avg(replenishDue.map((s) => s.ltv))),
      baselineConversion: windowConv(replenishDue),
      buyerIds: replenishDue.map((s) => s.buyerId),
    },
    {
      key: "lapsed",
      label: "Lapsed customers",
      description: "Bought before, nothing in 60+ days. Highest win-back upside.",
      size: lapsed.length,
      avgLtvCents: Math.round(avg(lapsed.map((s) => s.ltv))),
      baselineConversion: windowConv(lapsed) * 0.35,
      buyerIds: lapsed.map((s) => s.buyerId),
    },
    {
      key: "high_ltv",
      label: "VIP customers (top 20% LTV)",
      description: "Your best buyers. Great for new launches and bundles.",
      size: highLtv.length,
      avgLtvCents: Math.round(avg(highLtv.map((s) => s.ltv))),
      baselineConversion: windowConv(highLtv),
      buyerIds: highLtv.map((s) => s.buyerId),
    },
    ...(top
      ? [
          {
            key: "lookalike" as const,
            label: `${top.merchantName} shoppers who haven't found you`,
            description: `${Math.round(top.overlapPct * 100)}% of your buyers also shop at ${top.merchantName}. These ${lookalikeIds.length} PayPal shoppers buy there but never from you.`,
            size: lookalikeIds.length,
            avgLtvCents: Math.round(avg([...lookalikeStats.values()].map((s) => s.ltv))),
            baselineConversion: 0.01,
            buyerIds: lookalikeIds,
            sourceMerchantId: top.merchantId,
          },
        ]
      : []),
  ];

  const productAgg = new Map<string, { units: number; revenueCents: number }>();
  for (const t of mine) {
    const p = productAgg.get(t.productId) ?? { units: 0, revenueCents: 0 };
    p.units += 1;
    p.revenueCents += t.amountCents;
    productAgg.set(t.productId, p);
  }
  const topProducts = merchantProducts
    .map((p) => ({ productId: p.id, title: p.title, ...(productAgg.get(p.id) ?? { units: 0, revenueCents: 0 }) }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  return {
    merchantId,
    customers: all.length,
    orders: mine.length,
    revenueCents: mine.reduce((a, t) => a + t.amountCents, 0),
    repeatRate: all.length ? all.filter((s) => s.orders > 1).length / all.length : 0,
    avgCycleDays: avgCycle ? Math.round(avgCycle / DAY) : null,
    audiences: audiences.filter((a) => a.size > 0),
    affinities,
    topProducts,
  };
}
