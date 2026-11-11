import { connection } from "next/server";
import { runJobsOnce } from "@/lib/adgent/worker";
import { requireAdmin } from "@/lib/auth/admin";
import { fail } from "@/lib/http";

/** Runs the background jobs once. For hosts without a long-lived process (or a manual nudge). */
export async function POST(req: Request) {
  await connection();
  try {
    requireAdmin(req);
    return Response.json(await runJobsOnce());
  } catch (err) {
    return fail(err);
  }
}
