import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiConfigured, paypalMode } from "@/lib/env";
import { paypalReachable } from "@/lib/paypal/client";

const started = Date.now();

/** Liveness + dependency checks for uptime monitoring. Healthy = the database answers. */
export async function GET() {
  await connection();
  const checks: Record<string, string> = {};
  try {
    await db().run(sql`select 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  const mode = paypalMode();
  checks.paypal = mode === "simulated" ? "simulated" : (await paypalReachable()) ? "ok" : "error";
  checks.anthropic = aiConfigured() ? "ok" : "offline-fallback";
  const healthy = checks.database === "ok";
  return Response.json(
    { status: healthy ? "ok" : "degraded", paypalMode: mode, checks, uptimeSec: Math.round((Date.now() - started) / 1000), commit: process.env.RENDER_GIT_COMMIT ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "dev" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
