import { ZodError, type z } from "zod";
import { PayPalError } from "../paypal/client";

/** Throw from business logic to return a specific status instead of 500. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, init);
}

/** Uniform error responses: validation → 400, PayPal → passthrough status + debug id, else 500. */
export function fail(err: unknown, headers: HeadersInit = {}) {
  if (err instanceof ZodError) {
    return Response.json({ error: "Invalid request", issues: err.issues }, { status: 400, headers });
  }
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status, headers });
  }
  if (err instanceof PayPalError) {
    return Response.json(
      { error: err.message, paypalIssue: err.issue, paypalDebugId: err.debugId },
      { status: err.status >= 400 && err.status < 600 ? err.status : 502, headers },
    );
  }
  console.error("[adgent]", err);
  // Internal error text (SQL, stack details, upstream messages) stays in the server log in production.
  const message = process.env.NODE_ENV === "production" ? "Something went wrong. Please try again." : err instanceof Error ? err.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500, headers });
}

/** Default cap on JSON request bodies. Routes that need more pass their own. */
export const MAX_BODY_BYTES = 32 * 1024;

/**
 * Parses and validates a JSON body. Requires a JSON content type, so a cross-site <form> or a
 * "simple" fetch can't post here without a CORS preflight, and caps the size so a huge body
 * can't exhaust memory.
 */
export async function body<S extends z.ZodType>(req: Request, schema: S, maxBytes = MAX_BODY_BYTES): Promise<z.infer<S>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send the request body as application/json");
  }
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new HttpError(413, "Request body is too large");
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) throw new HttpError(413, "Request body is too large");
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpError(400, "Request body is not valid JSON");
    }
  }
  return schema.parse(data);
}

/**
 * Public origin for links we hand out (PayPal return URLs, checkout links).
 * APP_URL wins when set, so a forged Host header can't point those links at another site.
 */
export function baseUrl(req: Request): string {
  const configured = (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL)?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || u.protocol.replace(":", "");
  const host = req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}
