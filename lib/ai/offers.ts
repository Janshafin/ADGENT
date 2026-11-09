import { z } from "zod";
import { aiConfigured } from "../env";
import { structured } from "./claude";

export type OfferCandidate = {
  offerId: string; // `${campaignId}:${productId}`
  campaignId: string;
  merchantName: string;
  trustScore: number;
  feeRate: number;
  title: string;
  description: string;
  tags: string[];
  priceCents: number;
  discountPct: number;
};

const Ranking = z.object({
  results: z.array(
    z.object({
      offerId: z.string(),
      relevance: z.number().min(0).max(1).describe("How well this offer satisfies the shopper's request"),
      reason: z.string().max(160).describe("One factual sentence on why it matches"),
    }),
  ),
});

function lexical(query: string, c: OfferCandidate): number {
  const words = query.toLowerCase().match(/[a-z]+/g) ?? [];
  const hay = `${c.title} ${c.description} ${c.tags.join(" ")}`.toLowerCase();
  const hits = words.filter((w) => w.length > 2 && hay.includes(w)).length;
  return words.length ? Math.min(1, hits / Math.max(2, words.length * 0.6)) : 0;
}

function budgetFrom(query: string): number | null {
  const m = query.match(/(?:under|below|less than|<|max|up to)\s*\$?(\d+(?:\.\d+)?)/i);
  return m ? Math.round(parseFloat(m[1]) * 100) : null;
}

/**
 * Relevance-first auction: score = relevance × (1 + bid) × trust.
 * Irrelevant offers are dropped no matter how high the bid — shoppers (and their agents) come first.
 */
export async function rankOffers(query: string, candidates: OfferCandidate[], limit = 3) {
  const cap = budgetFrom(query);
  const affordable = candidates.filter((c) => cap === null || Math.round(c.priceCents * (1 - c.discountPct / 100)) <= cap);
  if (!affordable.length) return [];

  let scored: { offerId: string; relevance: number; reason: string }[];
  if (aiConfigured()) {
    try {
      const out = await structured({
        system:
          "You score sponsored product offers for relevance to a shopper's request made through an AI shopping agent. Be strict: a coffee grinder is not relevant to a request for coffee beans. Score only on fit to the request, never on price or merchant.",
        prompt: `Shopper request: ${JSON.stringify(query)}\n\nOffers:\n${JSON.stringify(
          affordable.map((c) => ({ offerId: c.offerId, title: c.title, description: c.description, tags: c.tags })),
          null,
          2,
        )}`,
        schema: Ranking,
        effort: "low",
        maxTokens: 4000,
      });
      scored = out.results.filter((r) => affordable.some((c) => c.offerId === r.offerId));
    } catch (err) {
      console.error("[adgent] offer ranking fell back to lexical:", err);
      scored = affordable.map((c) => ({ offerId: c.offerId, relevance: lexical(query, c), reason: "Keyword match" }));
    }
  } else {
    scored = affordable.map((c) => ({ offerId: c.offerId, relevance: lexical(query, c), reason: "Keyword match" }));
  }

  return scored
    .filter((s) => s.relevance >= 0.45)
    .map((s) => {
      const c = affordable.find((x) => x.offerId === s.offerId)!;
      return { ...c, relevance: s.relevance, reason: s.reason, score: s.relevance * (1 + c.feeRate) * c.trustScore };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
