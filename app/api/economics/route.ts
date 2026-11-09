import { connection } from "next/server";
import { paypalEconomics } from "@/lib/adgent/metrics";
import { fail } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    return Response.json(await paypalEconomics());
  } catch (err) {
    return fail(err);
  }
}
