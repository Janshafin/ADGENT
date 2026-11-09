import { merchantInsights } from "@/lib/graph/audiences";
import { fail } from "@/lib/http";

export async function GET(_req: Request, ctx: RouteContext<"/api/merchants/[id]/insights">) {
  try {
    const { id } = await ctx.params;
    const insights = await merchantInsights(id);
    // buyer id lists are internal; expose sizes only
    const audiences = insights.audiences.map((a) => {
      const pub: Partial<typeof a> = { ...a };
      delete pub.buyerIds;
      return pub;
    });
    return Response.json({ ...insights, audiences });
  } catch (err) {
    return fail(err);
  }
}
