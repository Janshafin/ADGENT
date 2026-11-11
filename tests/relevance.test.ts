import { describe, expect, it } from "vitest";
import { lexical, rankOffers, type OfferCandidate } from "@/lib/ai/offers";
import { SEED_MERCHANTS } from "@/lib/graph/catalog";

// The offline ranker runs whenever there is no Claude key, so the demo prompts must work with it.
const candidates: OfferCandidate[] = SEED_MERCHANTS.flatMap((m) =>
  m.products.map((p) => ({
    offerId: `c_${m.id}:${p.id}`,
    campaignId: `c_${m.id}`,
    merchantName: m.name,
    trustScore: 0.9,
    feeRate: 0.1,
    title: p.title,
    description: p.description,
    tags: p.tags,
    priceCents: p.price,
    discountPct: 0,
  })),
);
const top = async (q: string) => (await rankOffers(q, candidates, 3)).map((r) => r.title);

describe("offline relevance", () => {
  it("answers the agent's starter prompts sensibly", async () => {
    expect((await top("I need good espresso beans under $25"))[0]).toMatch(/Espresso/);
    expect(await top("Gift idea for a coffee nerd, around $150?")).toContain("Precision Burr Grinder");
    expect((await top("Something tasty to go with my morning coffee")).some((t) => /Croissant|Biscotti|Banana/.test(t))).toBe(true);
  });
  it("respects the shopper's budget", async () => {
    const r = await rankOffers("coffee gear under $50", candidates, 5);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((o) => o.priceCents <= 5000)).toBe(true);
  });
  it("doesn't call unrelated products relevant", () => {
    const earl = candidates.find((c) => c.title.startsWith("Earl Grey"))!;
    expect(lexical("matcha", earl)).toBe(0);
    expect(lexical("the and with", earl)).toBe(0);
  });
  it("drops irrelevant offers however high the bid", async () => {
    const rich = candidates.map((c) => ({ ...c, feeRate: c.title.includes("Stove") ? 0.3 : 0.05 }));
    expect((await rankOffers("matcha tea", rich, 3)).some((r) => r.title.includes("Stove"))).toBe(false);
  });
});
