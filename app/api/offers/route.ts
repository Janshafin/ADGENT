import type { NextRequest } from "next/server";
import { z } from "zod";
import { findOffers } from "@/lib/adgent/offers";
import { CORS, baseUrl, fail } from "@/lib/http";

const Q = z.object({
  q: z.string().min(2).max(300),
  surface: z.enum(["agent", "widget", "winback"]).default("agent"),
  pub: z.string().optional(),
  b: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(5).default(3),
});

export function OPTIONS() {
  return new Response(null, { headers: CORS });
}

/** Public sponsored-offer endpoint used by the MCP server and the publisher widget. */
export async function GET(req: NextRequest) {
  try {
    const p = Q.parse(Object.fromEntries(req.nextUrl.searchParams));
    const offers = await findOffers({ query: p.q, surface: p.surface, publisherId: p.pub, buyerRef: p.b, baseUrl: baseUrl(req), limit: p.limit });
    return Response.json({ offers }, { headers: CORS });
  } catch (err) {
    return fail(err, CORS);
  }
}
