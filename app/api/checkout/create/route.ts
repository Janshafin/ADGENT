import { z } from "zod";
import { startCheckout } from "@/lib/adgent/checkout";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const p = await body(req, z.object({
      offerId: z.string(),
      surface: z.enum(["agent", "widget", "winback"]),
      publisherId: z.string().nullish(),
      buyerRef: z.string().nullish(),
    }));
    return Response.json(await startCheckout(p));
  } catch (err) {
    return fail(err);
  }
}
