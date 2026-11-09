import { z } from "zod";

const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().default(""),
  PAYPAL_CLIENT_SECRET: z.string().default(""),
  PAYPAL_API_BASE: z.string().url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_PLATFORM_MERCHANT_ID: z.string().default(""),
  PAYPAL_PARTNER_ATTRIBUTION_ID: z.string().default(""),
  PAYPAL_WEBHOOK_ID: z.string().default(""),
  ADGENT_FEE_MODE: z.enum(["platform_fees", "invoice"]).default("invoice"),
  DEMO_MERCHANT_PAYPAL_EMAIL: z.string().default(""),
  DEMO_MERCHANT_PAYPAL_ID: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  ADGENT_MODEL: z.string().default("claude-opus-5-5"),
  DATABASE_URL: z.string().default("file:./adgent.db"),
  DATABASE_AUTH_TOKEN: z.string().default(""),
  APP_URL: z.string().default("http://localhost:3000"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed server env. Read lazily so build steps without secrets still succeed. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

export function paypalConfigured(): boolean {
  const e = env();
  return Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET);
}

export function aiConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}
