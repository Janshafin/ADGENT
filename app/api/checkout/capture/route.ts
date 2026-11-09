import { z } from "zod";
import { completeCheckout } from "@/lib/adgent/checkout";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { orderId } = await body(req, z.object({ orderId: z.string() }));
    return Response.json(await completeCheckout(orderId));
  } catch (err) {
    return fail(err);
  }
}
