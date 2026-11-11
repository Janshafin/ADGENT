import { z } from "zod";
import { billMerchant } from "@/lib/adgent/settlement";
import { requireAdmin } from "@/lib/auth/admin";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const { merchantId } = await body(req, z.object({ merchantId: z.string().max(64) }));
    const res = await billMerchant(merchantId);
    return Response.json(res ?? { message: "Nothing to bill: no invoice-mode sales are waiting" });
  } catch (err) {
    return fail(err);
  }
}
