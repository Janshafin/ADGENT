import { connection } from "next/server";
import { env, paypalMode, aiConfigured } from "@/lib/env";

/** What the UI needs to label itself honestly: simulated vs sandbox PayPal, Claude vs offline agent. */
export async function GET() {
  await connection();
  const e = env();
  return Response.json({
    paypalMode: paypalMode(),
    paypal: paypalMode() !== "simulated",
    ai: aiConfigured(),
    model: e.ADGENT_MODEL,
    fastModel: e.ADGENT_MODEL_FAST,
    feeMode: e.ADGENT_FEE_MODE,
    holdSeconds: e.SETTLEMENT_HOLD_SECONDS,
    webhooks: Boolean(e.PAYPAL_WEBHOOK_ID),
    adminRequired: paypalMode() !== "simulated",
  });
}
