import { env } from "../env";

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId: string | undefined,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }

  /** e.g. "PAYEE_NOT_ENABLED_FOR_PLATFORM_FEES" — first issue code PayPal returned */
  get issue(): string | undefined {
    const d = this.details as { details?: { issue?: string }[] } | undefined;
    return d?.details?.[0]?.issue;
  }
}

type Token = { value: string; expiresAt: number };
const tokenCache = globalThis as unknown as { __ppToken?: Token };

async function accessToken(): Promise<string> {
  const cached = tokenCache.__ppToken;
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const e = env();
  if (!e.PAYPAL_CLIENT_ID || !e.PAYPAL_CLIENT_SECRET) {
    throw new PayPalError("PayPal credentials missing (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)", 500, undefined, null);
  }
  const basic = Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${e.PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const body = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new PayPalError(`PayPal auth failed: ${body.error_description ?? res.statusText}`, res.status, res.headers.get("paypal-debug-id") ?? undefined, body);
  }
  tokenCache.__ppToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  return body.access_token;
}

type RequestOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as PayPal-Request-Id so retries never double-charge. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
};

/** Thin, typed wrapper around the PayPal REST API. */
export async function paypal<T>(path: string, opts: RequestOpts = {}): Promise<T> {
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
  });

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : {};
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
  /** PayPal amount string → cents */
  toCents: (value: string) => Math.round(parseFloat(value) * 100),
};
