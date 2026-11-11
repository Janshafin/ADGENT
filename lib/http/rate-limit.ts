import { HttpError } from "./index";

type Window = { start: number; count: number };
const g = globalThis as unknown as { __adgentRate?: Map<string, Window> };

/** Client IP as seen through the host's proxy (first x-forwarded-for hop). */
export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
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
