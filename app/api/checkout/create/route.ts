import { z } from "zod";
import { startCheckout } from "@/lib/adgent/checkout";
import { body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";

export async function POST(req: Request) {
  try {
    rateLimit(req, "checkout", 15);
    const p = await body(req, z.object({
      offerId: z.string().max(120),
      surface: z.enum(["agent", "widget", "winback"]),
      publisherId: z.string().max(64).nullish(),
      buyerRef: z.string().max(64).nullish(),
    }));
    return Response.json(await startCheckout(p));
  } catch (err) {
    return fail(err);
  }
}
