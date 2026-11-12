import { z } from "zod";
import { billMerchant } from "@/lib/adgent/settlement";
import { db, schema } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/admin";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    requireAdmin(req);
    const { merchantId } = await body(req, z.object({ merchantId: z.string().max(64).optional() }));
    // One merchant when named; otherwise every merchant that has unbilled invoice-mode sales.
    const ids = merchantId ? [merchantId] : (await db().select({ id: schema.merchants.id }).from(schema.merchants)).map((m) => m.id);
    const invoices = [];
    for (const id of ids) {
      const res = await billMerchant(id);
      if (res) invoices.push({ merchantId: id, ...res });
    }
    if (!invoices.length) return Response.json({ invoices, message: "Nothing to bill: no invoice-mode sales are waiting" });
    return Response.json({ invoices, invoiceId: invoices[0].invoiceId, totalCents: invoices.reduce((a, i) => a + i.totalCents, 0) });
  } catch (err) {
    return fail(err);
  }
}
