import { refundOrder } from "@/lib/adgent/checkout";
import { requireAdmin } from "@/lib/auth/admin";
import { fail } from "@/lib/http";

export async function POST(req: Request, ctx: RouteContext<"/api/orders/[id]/refund">) {
  try {
    requireAdmin(req);
    const { id } = await ctx.params;
    return Response.json(await refundOrder(id));
  } catch (err) {
    return fail(err);
  }
}
