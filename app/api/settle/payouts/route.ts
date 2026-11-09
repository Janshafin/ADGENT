import { payPublishers } from "@/lib/adgent/settlement";
import { fail } from "@/lib/http";

export async function POST() {
  try {
    return Response.json(await payPublishers());
  } catch (err) {
    return fail(err);
  }
}
