/**
 * Seeds the simulated PayPal transaction graph: 5 merchants, ~600 buyers,
 * ~6 months of purchases with realistic repeat cycles and cross-merchant affinity,
 * plus two historical campaigns so Mission Control has context on first load.
 *
 * Usage: npm run db:seed   (idempotent — wipes and recreates demo data)
 */
import "dotenv/config";
import { db, schema } from "../lib/db";
import { SEED_MERCHANTS, AFFINITY, SEED_PUBLISHERS } from "../lib/graph/catalog";
import { DAY, rng, bucket } from "../lib/util";

const FIRST = ["Ava", "Liam", "Maya", "Noah", "Zara", "Ethan", "Priya", "Lucas", "Mia", "Omar", "Chloe", "Arjun", "Sofia", "Leo", "Aisha", "Kai", "Nina", "Ravi", "Emma", "Jonah", "Ines", "Yuki", "Sam", "Lena"];
const LAST = ["Patel", "Garcia", "Kim", "Okafor", "Nguyen", "Smith", "Rossi", "Haddad", "Chen", "Silva", "Müller", "Khan", "Ito", "Brown", "Novak", "Diaz"];
const CITIES = ["Austin", "Seattle", "Brooklyn", "Denver", "Chicago", "Portland", "San Jose", "Atlanta", "Boston", "Miami"];

async function main() {
  const d = db();
  const r = rng(20261108);
  const now = Date.now();
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];

  // wipe (children first)
  for (const t of [schema.events, schema.adInvoices, schema.payouts, schema.orders, schema.campaigns, schema.transactions, schema.products, schema.buyers, schema.publishers, schema.merchants]) {
    await d.delete(t);
  }

  const env = process.env;
  await d.insert(schema.merchants).values(
    SEED_MERCHANTS.map((m, i) => ({
      id: m.id,
      name: m.name,
      category: m.category,
      emoji: m.emoji,
      // The hero merchant receives real sandbox payments.
      paypalEmail: i === 0 ? env.DEMO_MERCHANT_PAYPAL_EMAIL || null : null,
      paypalMerchantId: i === 0 ? env.DEMO_MERCHANT_PAYPAL_ID || null : null,
      trustScore: [0.97, 0.94, 0.91, 0.89, 0.93][i],
    })),
  );
  await d.insert(schema.products).values(
    SEED_MERCHANTS.flatMap((m) =>
      m.products.map((p) => ({
        id: p.id,
        merchantId: m.id,
        title: p.title,
        description: p.description,
        category: p.category,
        priceCents: p.price,
        image: p.image,
        tags: p.tags,
      })),
    ),
  );
  await d.insert(schema.publishers).values(
    SEED_PUBLISHERS.map((p) => ({ ...p, paypalEmail: env.DEMO_PUBLISHER_PAYPAL_EMAIL || "publisher@example.com" })),
  );

  // Buyers
  const buyers = Array.from({ length: 600 }, (_, i) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    return { id: `b_${i.toString().padStart(4, "0")}`, name: `${first} ${last}`, email: `${first}.${last}.${i}@example.com`.toLowerCase(), city: pick(CITIES) };
  });
  await d.insert(schema.buyers).values(buyers);

  // Transactions: each buyer has a "home" merchant, then affinity-driven second merchants.
  const txs: (typeof schema.transactions.$inferInsert)[] = [];
  const homeWeights = [0.42, 0.14, 0.16, 0.16, 0.12];
  let n = 0;
  const purchaseRun = (buyerId: string, merchantIdx: number, startAgoDays: number, churnAfterDays: number | null) => {
    const m = SEED_MERCHANTS[merchantIdx];
    const cycle = m.cycleDays ?? 120;
    let t = now - startAgoDays * DAY;
    const stopAt = churnAfterDays === null ? now : t + churnAfterDays * DAY;
    while (t < Math.min(stopAt, now)) {
      const p = m.products[Math.floor(Math.pow(r(), 1.6) * m.products.length)];
      txs.push({
        id: `tx_${(n++).toString().padStart(6, "0")}`,
        merchantId: m.id,
        buyerId,
        productId: p.id,
        amountCents: p.price,
        createdAt: new Date(t),
        source: "seed",
      });
      if (m.cycleDays === null && r() < 0.75) break; // durable goods: mostly one-off
      t += cycle * DAY * (0.7 + r() * 0.7);
    }
  };

  for (const b of buyers) {
    let x = r();
    let home = 0;
    for (let i = 0; i < homeWeights.length; i++) {
      x -= homeWeights[i];
      if (x <= 0) { home = i; break; }
    }
    const start = 20 + Math.floor(r() * 160);
    // ~30% of buyers churn at some point → lapsed audience
    const churn = r() < 0.3 ? 20 + Math.floor(r() * 80) : null;
    purchaseRun(b.id, home, start, churn);

    const aff = AFFINITY[SEED_MERCHANTS[home].id] ?? {};
    for (const [otherId, p] of Object.entries(aff)) {
      if (r() < p) {
        const idx = SEED_MERCHANTS.findIndex((m) => m.id === otherId);
        purchaseRun(b.id, idx, Math.floor(r() * start), null);
      }
    }
  }
  for (let i = 0; i < txs.length; i += 400) await d.insert(schema.transactions).values(txs.slice(i, i + 400));

  // Historical campaigns (simulated, labelled as such) so dashboards have a baseline.
  const hist = [
    { id: "c_hist_refill", merchantId: "m_beanthere", name: "Refill reminder: Midnight Espresso", objective: "replenish" as const, audienceKey: "replenish_due" as const, product: "p_bt_espresso", discount: 10, fee: 0.1, ago: 28 },
    { id: "c_hist_gear", merchantId: "m_brewlab", name: "Coffee lovers → Burr Grinder", objective: "cross_sell" as const, audienceKey: "lookalike" as const, product: "p_bl_grinder", discount: 0, fee: 0.08, ago: 16 },
  ];
  const evs: (typeof schema.events.$inferInsert)[] = [];
  for (const h of hist) {
    const prod = SEED_MERCHANTS.flatMap((m) => m.products).find((p) => p.id === h.product)!;
    // Audience snapshot: the merchant's own customers (refill) or a neighbour's (lookalike)
    const sourceMerchant = h.audienceKey === "lookalike" ? "m_beanthere" : h.merchantId;
    const audience = [...new Set(txs.filter((t) => t.merchantId === sourceMerchant).map((t) => t.buyerId))].slice(0, 260);
    const exposed = audience.filter((b) => bucket(`${h.id}:${b}`) >= 10);
    const sales = 30 + Math.floor(r() * 25);
    const net = Math.round(prod.price * (1 - h.discount / 100));
    const fee = Math.round(net * h.fee);
    await d.insert(schema.campaigns).values({
      id: h.id,
      merchantId: h.merchantId,
      name: h.name,
      objective: h.objective,
      audienceKey: h.audienceKey,
      audienceSize: audience.length,
      audienceBuyerIds: audience,
      productIds: [h.product],
      discountPct: h.discount,
      payLater: true,
      feeRate: h.fee,
      budgetCents: 40000,
      spentCents: fee * sales,
      holdoutPct: 10,
      headline: h.name,
      body: "Historical campaign (simulated).",
      agentBlurb: prod.description,
      rationale: "Seeded historical campaign used as a baseline for the demo.",
      forecast: { reach: 250, expectedSales: sales, expectedRevenueCents: net * sales, expectedAdCostCents: fee * sales, expectedRoas: 1 / h.fee },
      status: "paused",
      createdAt: new Date(now - h.ago * DAY),
    });
    evs.push({ ts: new Date(now - h.ago * DAY), type: "campaign_launched", campaignId: h.id, merchantId: h.merchantId, detail: "simulated history" });
    for (let s = 0; s < sales * 9; s++) {
      const ts = new Date(now - h.ago * DAY + r() * (h.ago - 2) * DAY);
      const surface = pick(["agent", "agent", "widget", "winback"] as const);
      const buyerRef = pick(exposed); // holdout members never see the ad
      evs.push({ ts, type: "impression", campaignId: h.id, merchantId: h.merchantId, surface, buyerRef, detail: "simulated history" });
      if (s % 9 === 0) {
        evs.push({ ts: new Date(ts.getTime() + 60_000), type: "captured", campaignId: h.id, merchantId: h.merchantId, surface, buyerRef, amountCents: net, detail: "simulated history" });
        evs.push({ ts: new Date(ts.getTime() + 61_000), type: "fee_collected", campaignId: h.id, merchantId: h.merchantId, surface, feeCents: fee, detail: "simulated history" });
      }
    }
    evs.push({ ts: new Date(now - 2 * DAY), type: "campaign_paused", campaignId: h.id, merchantId: h.merchantId, detail: "flight ended (simulated history)" });
  }
  evs.sort((a, b) => a.ts.getTime() - b.ts.getTime());
  for (let i = 0; i < evs.length; i += 400) await d.insert(schema.events).values(evs.slice(i, i + 400));

  console.log(`Seeded ${SEED_MERCHANTS.length} merchants, ${buyers.length} buyers, ${txs.length} transactions, ${evs.length} historical events.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
