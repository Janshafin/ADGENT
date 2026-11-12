import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { Surface } from "../db/schema";
import { rankOffers, lexical, type OfferCandidate } from "../ai/offers";
import { record } from "./ledger";
import { bucket } from "../util";
import { cleanMerchantText } from "../ai/untrusted";

export type SponsoredOffer = {
  offerId: string;
  sponsored: true;
  disclosure: string;
  merchant: string;
  title: string;
  description: string;
  image: string;
  priceCents: number;
  finalPriceCents: number;
  discountPct: number;
  payLater: boolean;
  payLaterText: string | null;
  reason: string;
  checkoutUrl: string;
};

/** Is this buyer in the campaign's holdout group? Holdouts never see the ad — that's how lift is measured. */
export function inHoldout(campaignId: string, buyerRef: string | null | undefined, holdoutPct: number) {
  return Boolean(buyerRef) && bucket(`${campaignId}:${buyerRef}`) < holdoutPct;
}

export async function activeCandidates(): Promise<(OfferCandidate & { image: string; payLater: boolean; holdoutPct: number; merchantId: string; productId: string; flagged: boolean })[]> {
  const d = db();
  const [camps, prods, merchs] = await Promise.all([
    d.select().from(schema.campaigns).where(eq(schema.campaigns.status, "active")),
    d.select().from(schema.products),
    d.select().from(schema.merchants),
  ]);
  return camps
    .filter((c) => c.spentCents < c.budgetCents)
    .flatMap((c) =>
      c.productIds.flatMap((pid) => {
        const p = prods.find((x) => x.id === pid);
        const m = merchs.find((x) => x.id === c.merchantId);
        if (!p || !m) return [];
        // Advertiser text is untrusted: cleaned once here, before any agent, widget or model sees it.
        const title = cleanMerchantText(p.title, 120);
        // A single-product campaign's blurb describes that product; otherwise each product keeps its own copy.
        const copy = c.productIds.length === 1 && c.agentBlurb ? c.agentBlurb : `${p.description}${c.discountPct ? ` ${c.discountPct}% off.` : ""}`;
        const description = cleanMerchantText(copy, 400);
        const flagged = title.flagged || description.flagged;
        return [{
          offerId: `${c.id}:${p.id}`,
          campaignId: c.id,
          merchantId: m.id,
          productId: p.id,
          merchantName: m.name,
          // Copy that tries to instruct the agent costs the advertiser rank.
          trustScore: flagged ? m.trustScore * 0.5 : m.trustScore,
          feeRate: c.feeRate,
          title: title.text,
          description: description.text,
          flagged,
          tags: p.tags,
          priceCents: p.priceCents,
          discountPct: c.discountPct,
          image: p.image,
          payLater: c.payLater,
          holdoutPct: c.holdoutPct,
        }];
      }),
    );
}

export async function findOffers(args: {
  query: string;
  surface: Surface;
  publisherId?: string | null;
  buyerRef?: string | null;
  baseUrl: string;
  limit?: number;
}): Promise<SponsoredOffer[]> {
  const all = await activeCandidates();
  const eligible = all.filter((c) => !inHoldout(c.campaignId, args.buyerRef, c.holdoutPct));
  const limit = args.limit ?? 3;
  // Two campaigns can advertise the same product. The shopper sees it once, from the higher-ranked campaign.
  const seenProducts = new Set<string>();
  const ranked = (await rankOffers(args.query, eligible, limit * 3))
    .filter((r) => {
      const productId = r.offerId.split(":")[1];
      return !seenProducts.has(productId) && seenProducts.add(productId);
    })
    .slice(0, limit);

  const out = ranked.map((r): SponsoredOffer => {
    const c = eligible.find((x) => x.offerId === r.offerId)!;
    const finalPriceCents = Math.round(c.priceCents * (1 - c.discountPct / 100));
    const params = new URLSearchParams({ surface: args.surface });
    if (args.publisherId) params.set("pub", args.publisherId);
    if (args.buyerRef) params.set("b", args.buyerRef);
    return {
      offerId: c.offerId,
      sponsored: true,
      disclosure: `Sponsored · ${c.merchantName} pays a fee only if you buy`,
      merchant: c.merchantName,
      title: c.title,
      description: c.description,
      image: c.image,
      priceCents: c.priceCents,
      finalPriceCents,
      discountPct: c.discountPct,
      payLater: c.payLater,
      payLaterText: c.payLater && finalPriceCents >= 3000 ? `or 4 interest-free payments of $${(finalPriceCents / 400).toFixed(2)} with PayPal Pay in 4` : null,
      reason: r.reason,
      checkoutUrl: `${args.baseUrl}/shop/${encodeURIComponent(c.offerId)}?${params}`,
    };
  });

  await Promise.all(
    ranked.map((r) =>
      record({
        type: "impression",
        campaignId: r.campaignId,
        merchantId: eligible.find((x) => x.offerId === r.offerId)!.merchantId,
        publisherId: args.publisherId ?? null,
        surface: args.surface,
        buyerRef: args.buyerRef ?? null,
        detail: `q="${args.query.slice(0, 80)}" relevance=${r.relevance.toFixed(2)}`,
      }),
    ),
  );
  return out;
}

/**
 * How many matching offers this shopper didn't see because they are in a campaign's holdout.
 * Keyword match only (no model call, no impression logged): it only explains an empty result.
 */
export async function heldOutMatches(query: string, buyerRef: string | null | undefined): Promise<number> {
  if (!buyerRef) return 0;
  const all = await activeCandidates();
  return all.filter((c) => inHoldout(c.campaignId, buyerRef, c.holdoutPct) && lexical(query, c) >= 0.45).length;
}

export async function getOffer(offerId: string) {
  const [campaignId, productId, ...rest] = offerId.split(":");
  if (!campaignId || !productId || rest.length) return null;
  const d = db();
  const [c] = await d.select().from(schema.campaigns).where(eq(schema.campaigns.id, campaignId));
  const [p] = await d.select().from(schema.products).where(eq(schema.products.id, productId));
  if (!c || !p || !c.productIds.includes(p.id)) return null;
  const [m] = await d.select().from(schema.merchants).where(eq(schema.merchants.id, c.merchantId));
  return { campaign: c, product: p, merchant: m, finalPriceCents: Math.round(p.priceCents * (1 - c.discountPct / 100)) };
}
