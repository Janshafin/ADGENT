import { connection } from "next/server";
import { recentLedger } from "@/lib/adgent/ledger";
import { fail } from "@/lib/http";

export async function GET() {
  await connection();
  try {
    return Response.json(await recentLedger());
  } catch (err) {
    return fail(err);
  }
}
