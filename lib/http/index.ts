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
  const message = err instanceof Error ? err.message : "Unexpected error";
  console.error("[adgent]", err);
  return Response.json({ error: message }, { status: 500, headers });
}

export async function body<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  return schema.parse(await req.json().catch(() => ({})));
}

export function baseUrl(req: Request): string {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? u.host;
  return `${proto}://${host}`;
}
