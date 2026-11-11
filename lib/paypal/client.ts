import { env, paypalConfigured } from "../env";
import { PayPalError, type RequestOpts } from "./errors";
import { simulate } from "./simulator";

export { PayPalError };

type Token = { value: string; expiresAt: number };
const tokenCache = globalThis as unknown as { __ppToken?: Token };

async function accessToken(): Promise<string> {
  const cached = tokenCache.__ppToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const e = env();
  const basic = Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${e.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new PayPalError(`PayPal auth failed: ${body.error_description ?? res.statusText}`, res.status, res.headers.get("paypal-debug-id") ?? undefined, body);
  }
  tokenCache.__ppToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  return body.access_token;
}

/** Health check: can we get an OAuth token with the configured credentials? */
export async function paypalReachable(): Promise<boolean> {
  if (!paypalConfigured()) return false;
  try {
    await accessToken();
    return true;
  } catch {
    return false;
  }
}

/**
 * Thin, typed wrapper around the PayPal REST API.
 * Without sandbox credentials it routes to the built-in simulator (see ./simulator.ts).
 */
export async function paypal<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  if (!paypalConfigured()) return simulate<T>(path, opts);

  const e = env();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken()}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...opts.headers,
  };
  if (opts.idempotencyKey) headers["PayPal-Request-Id"] = opts.idempotencyKey;
  if (e.PAYPAL_PARTNER_ATTRIBUTION_ID) headers["PayPal-Partner-Attribution-Id"] = e.PAYPAL_PARTNER_ATTRIBUTION_ID;

  const res = await fetch(`${e.PAYPAL_API_BASE}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { message: text.slice(0, 300) };
  }
  if (!res.ok) {
    const j = json as { message?: string; name?: string };
    throw new PayPalError(
      `PayPal ${opts.method ?? "GET"} ${path} → ${res.status} ${j.name ?? ""}: ${j.message ?? text}`,
      res.status,
      res.headers.get("paypal-debug-id") ?? undefined,
      json,
    );
  }
  return json as T;
}

export const money = {
  /** cents → PayPal amount string */
  toValue: (cents: number) => (cents / 100).toFixed(2),
  /** PayPal amount string → cents (string math, so "19.99" never becomes 1998) */
  toCents: (value: string) => {
    const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!m) throw new RangeError(`Not a PayPal amount: ${value}`);
    const cents = Number(m[2]) * 100 + Number((m[3] ?? "0").padEnd(2, "0"));
    return m[1] ? -cents : cents;
  },
};
