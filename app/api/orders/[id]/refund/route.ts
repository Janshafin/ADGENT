import { refundOrder } from "@/lib/adgent/checkout";
import { fail } from "@/lib/http";

export async function POST(_req: Request, ctx: RouteContext<"/api/orders/[id]/refund">) {
  try {
    const { id } = await ctx.params;
    return Response.json(await refundOrder(id));
  } catch (err) {
    return fail(err);
  }
}
