import { z } from "zod";
import { paypalMode } from "@/lib/env";
import { simApprove } from "@/lib/paypal/simulator";
import { rateLimit } from "@/lib/http/rate-limit";
import { body, fail } from "@/lib/http";

/** Stand-in for the buyer approving on paypal.com. Exists only while PayPal runs in simulated mode. */
export async function POST(req: Request) {
  try {
    if (paypalMode() !== "simulated") return Response.json({ error: "Not available with real PayPal credentials" }, { status: 404 });
    rateLimit(req, "sim-approve", 30);
    const p = await body(req, z.object({ orderId: z.string().min(5).max(40), name: z.string().max(60).optional(), email: z.string().email().max(120).optional() }));
    const order = await simApprove(p.orderId, { name: p.name, email: p.email });
    return Response.json({ orderId: order.id, status: order.status });
  } catch (err) {
    return fail(err);
  }
}
