import { connection } from "next/server";
import { env, paypalConfigured, aiConfigured } from "@/lib/env";

export async function GET() {
  await connection();
  const e = env();
  return Response.json({
    paypal: paypalConfigured(),
    paypalBase: e.PAYPAL_API_BASE,
    ai: aiConfigured(),
    model: e.ADGENT_MODEL,
    feeMode: e.ADGENT_FEE_MODE,
    webhooks: Boolean(e.PAYPAL_WEBHOOK_ID),
    demoMerchantPayee: Boolean(e.DEMO_MERCHANT_PAYPAL_EMAIL || e.DEMO_MERCHANT_PAYPAL_ID),
  });
}
