import { HttpError } from "./index";

type Window = { start: number; count: number };
const g = globalThis as unknown as { __adgentRate?: Map<string, Window> };

/**
 * Client IP for rate limiting. X-Forwarded-For can't be trusted as sent: Render (and most
 * proxies) append to whatever the client supplied, so its first entry is attacker-controlled.
 * On Render, Cloudflare sits in front and sets True-Client-IP itself, so we read that.
 * Elsewhere we take the last X-Forwarded-For hop, which our own proxy added.
 * CLIENT_IP_HEADER overrides the choice for other hosts.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const configured = process.env.CLIENT_IP_HEADER?.toLowerCase();
  if (configured) return h.get(configured)?.split(",").pop()?.trim() || "unknown";
  if (process.env.RENDER) return h.get("true-client-ip") || h.get("cf-connecting-ip") || "unknown";
  return h.get("x-forwarded-for")?.split(",").pop()?.trim() || h.get("x-real-ip") || "local";
}

/**
 * Fixed-window limiter per (bucket, ip). In-memory: correct for one long-lived instance.
 * shortcut: per-process counters, move to the database or a KV store if we run more than one instance.
 */
export function rateLimit(req: Request, bucket: string, limit: number, windowMs = 60_000, now = Date.now()): void {
  const store = (g.__adgentRate ??= new Map());
  if (store.size > 10_000) {
    for (const [k, w] of store) if (now - w.start >= windowMs) store.delete(k);
  }
  const key = `${bucket}:${clientIp(req)}`;
  const w = store.get(key);
  if (!w || now - w.start >= windowMs) {
    store.set(key, { start: now, count: 1 });
    return;
  }
  if (++w.count > limit) throw new HttpError(429, `Too many requests. Try again in ${Math.ceil((w.start + windowMs - now) / 1000)}s`);
}
