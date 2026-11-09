import { z } from "zod";
import { billMerchant } from "@/lib/adgent/settlement";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { merchantId } = await body(req, z.object({ merchantId: z.string() }));
    const res = await billMerchant(merchantId);
    return Response.json(res ?? { message: "Nothing to bill" });
  } catch (err) {
    return fail(err);
  }
}
