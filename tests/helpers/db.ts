import { migrate } from "drizzle-orm/libsql/migrator";
import { db, schema } from "@/lib/db";

export async function freshDb() {
  await migrate(db(), { migrationsFolder: "drizzle" });
  return db();
}

/** One merchant, one $20 product, one publisher (50% share), one live campaign: 10% off, 10% fee. */
export async function seedMinimal(opts: { budgetCents?: number; feeRate?: number } = {}) {
  const d = db();
  await d.insert(schema.merchants).values({ id: "m_test", name: "Test Roasters", category: "coffee", paypalEmail: "merchant@test.example" });
  await d.insert(schema.products).values({ id: "p_test", merchantId: "m_test", title: "Test Beans", description: "Good beans.", category: "coffee", priceCents: 2000, image: "☕", tags: ["coffee"] });
  await d.insert(schema.publishers).values({ id: "pub_test", name: "Test Blog", site: "/blog", paypalEmail: "pub@test.example", revShare: 0.5 });
  await d.insert(schema.campaigns).values({
    id: "c_test",
    merchantId: "m_test",
    name: "Test campaign",
    objective: "winback",
    audienceKey: "lapsed",
    audienceSize: 0,
    audienceBuyerIds: [],
    productIds: ["p_test"],
    discountPct: 10,
    payLater: false,
    feeRate: opts.feeRate ?? 0.1,
    budgetCents: opts.budgetCents ?? 10_000,
    spentCents: 0,
    holdoutPct: 10,
    headline: "h",
    body: "b",
    agentBlurb: "Test Beans, $18",
    rationale: "r",
    forecast: { reach: 0, expectedSales: 1, expectedRevenueCents: 1800, expectedAdCostCents: 180, expectedRoas: 10 },
    status: "active",
    createdAt: new Date(),
  });
}
