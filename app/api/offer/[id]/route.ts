import { getOffer } from "@/lib/adgent/offers";
import { fail } from "@/lib/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/offer/[id]">) {
  try {
    const { id } = await ctx.params;
    let offerId: string;
    try {
      offerId = decodeURIComponent(id);
    } catch {
      return Response.json({ error: "Offer not found" }, { status: 404 });
    }
    if (offerId.length > 200) return Response.json({ error: "Offer not found" }, { status: 404 });
    const o = await getOffer(offerId);
    if (!o) return Response.json({ error: "Offer not found" }, { status: 404 });
    return Response.json({
      offerId: `${o.campaign.id}:${o.product.id}`,
      active: o.campaign.status === "active",
      merchant: { name: o.merchant.name, emoji: o.merchant.emoji },
      product: { title: o.product.title, description: o.product.description, image: o.product.image, priceCents: o.product.priceCents },
      headline: o.campaign.headline,
      discountPct: o.campaign.discountPct,
      payLater: o.campaign.payLater,
      finalPriceCents: o.finalPriceCents,
    });
  } catch (err) {
    return fail(err);
  }
}
