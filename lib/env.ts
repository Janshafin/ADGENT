import { z } from "zod";
import { FEE_MODES } from "./db/schema";

/** A variable set to "" on the host means "use the default", not "use an empty string". */
const orDefault = (fallback: string) => z.string().optional().transform((v) => (v ? v : fallback));

const schema = z.object({
  NODE_ENV: z.string().default("development"),
  PAYPAL_CLIENT_ID: z.string().default(""),
  PAYPAL_CLIENT_SECRET: z.string().default(""),
  PAYPAL_API_BASE: orDefault("https://api-m.sandbox.paypal.com").pipe(z.string().url()),
  PAYPAL_PLATFORM_MERCHANT_ID: z.string().default(""),
  PAYPAL_PARTNER_ATTRIBUTION_ID: z.string().default(""),
  PAYPAL_WEBHOOK_ID: z.string().default(""),
  ADGENT_FEE_MODE: orDefault("payouts").pipe(z.enum(FEE_MODES)),
  /** Refund window before merchant and publisher are paid out (payouts mode). */
  SETTLEMENT_HOLD_SECONDS: orDefault("120").transform(Number).pipe(z.number().int().min(0)),
  DEMO_MERCHANT_PAYPAL_EMAIL: z.string().default(""),
  DEMO_MERCHANT_PAYPAL_ID: z.string().default(""),
  DEMO_PUBLISHER_PAYPAL_EMAIL: z.string().default(""),
  ANTHROPIC_API_KEY: z.string().default(""),
  /** Strategy work: campaign proposals and the shopping agent. */
  ADGENT_MODEL: orDefault("claude-opus-5-5"),
  /** Fast, cheap work: offer ranking and ledger questions. */
  ADGENT_MODEL_FAST: orDefault("claude-haiku-5-5"),
  DATABASE_URL: orDefault("file:./adgent.db"),
  DATABASE_AUTH_TOKEN: z.string().default(""),
  APP_URL: orDefault("http://localhost:3000").transform((v) => v.replace(/\/+$/, "")),
  ADMIN_TOKEN: z.string().default(""),
  /** Turn off the in-process settlement worker (e.g. on serverless hosts). */
  ADGENT_DISABLE_WORKER: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed server env. Read lazily so build steps without secrets still succeed. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}

/** Tests change process.env between cases; production never calls this. */
export function resetEnvCache() {
  cached = undefined;
}

export function paypalConfigured(): boolean {
  const e = env();
  return Boolean(e.PAYPAL_CLIENT_ID && e.PAYPAL_CLIENT_SECRET);
}

/** With no sandbox keys, money moves through the built-in PayPal simulator and every screen says so. */
export function paypalMode(): "sandbox" | "live" | "simulated" {
  if (!paypalConfigured()) return "simulated";
  return env().PAYPAL_API_BASE.includes("sandbox") ? "sandbox" : "live";
}

export function aiConfigured(): boolean {
  return Boolean(env().ANTHROPIC_API_KEY);
}
