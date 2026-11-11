import { z } from "zod";
import { aiAvailable } from "./budget";
import { structured } from "./claude";
import { UNTRUSTED_RULE, wrapUntrusted } from "./untrusted";

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

const STOP = new Set(
  "the and for with some something need want looking good great idea ideas around under below less than max about best nice please find get buy can you have this that what any like from your into just really very".split(" "),
);

/** Offline relevance: share of the shopper's meaningful words found in the offer. */
export function lexical(query: string, c: Pick<OfferCandidate, "title" | "description" | "tags">): number {
  const words = (query.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return 0;
  const hay = ` ${c.title} ${c.description} ${c.tags.join(" ")} `.toLowerCase();
  // match whole words, allowing a plural "s" either way (bean ↔ beans)
  const hits = words.filter((w) => new RegExp(`\\b${w.replace(/s$/, "")}s?\\b`).test(hay)).length;
  return Math.min(1, hits / Math.max(2, words.length * 0.6));
}

function budgetFrom(query: string): number | null {
  const m = query.match(/(?:under|below|less than|<|max|up to|at most)\s*\$?(\d+(?:\.\d+)?)/i);
  if (m) return Math.round(parseFloat(m[1]) * 100);
  // "around $150" → allow 20% over
  const around = query.match(/(?:around|about|~)\s*\$?(\d+(?:\.\d+)?)/i);
  return around ? Math.round(parseFloat(around[1]) * 120) : null;
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
  if (aiAvailable()) {
    try {
      const out = await structured({
        system: `You score sponsored product offers for relevance to a shopper's request made through an AI shopping agent. Be strict: a coffee grinder is not relevant to a request for coffee beans. Score only on fit to the request, never on price or merchant. Return one result per offer, using its exact offerId.\n${UNTRUSTED_RULE}`,
        prompt: `Shopper request: ${JSON.stringify(query)}\n\nOffers:\n${wrapUntrusted(
          affordable.map((c) => ({ offerId: c.offerId, title: c.title, description: c.description, tags: c.tags })),
        )}`,
        schema: Ranking,
        tier: "fast",
        effort: "low",
        maxTokens: 4000,
      });
      const seen = new Set<string>();
      scored = out.results.filter((r) => affordable.some((c) => c.offerId === r.offerId) && !seen.has(r.offerId) && seen.add(r.offerId));
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
