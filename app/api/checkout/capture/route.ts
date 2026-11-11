import { z } from "zod";
import { completeCheckout } from "@/lib/adgent/checkout";
import { body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";

export async function POST(req: Request) {
  try {
    rateLimit(req, "capture", 30);
    const { orderId } = await body(req, z.object({ orderId: z.string().min(5).max(40) }));
    return Response.json(await completeCheckout(orderId));
  } catch (err) {
    return fail(err);
  }
}
