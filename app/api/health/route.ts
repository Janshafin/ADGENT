import { connection } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiConfigured, paypalConfigured } from "@/lib/env";

const started = Date.now();

/** Liveness + dependency checks for uptime monitoring. */
export async function GET() {
  await connection();
  const checks: Record<string, "ok" | "missing" | "error"> = {};
  try {
    await db().run(sql`select 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  checks.paypal = paypalConfigured() ? "ok" : "missing";
  checks.anthropic = aiConfigured() ? "ok" : "missing";
  const healthy = checks.database === "ok";
  return Response.json(
    { status: healthy ? "ok" : "degraded", checks, uptimeSec: Math.round((Date.now() - started) / 1000), commit: process.env.RENDER_GIT_COMMIT ?? "dev" },
    { status: healthy ? 200 : 503 },
  );
}
