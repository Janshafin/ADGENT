import { settleDue } from "@/lib/adgent/settlement";
import { requireAdmin } from "@/lib/auth/admin";
import { fail } from "@/lib/http";

/** "Settle now": pays out every sale whose refund hold has passed. The worker also runs this on a timer. */
export async function POST(req: Request) {
  try {
    requireAdmin(req);
    return Response.json(await settleDue());
  } catch (err) {
    return fail(err);
  }
}
