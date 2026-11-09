import { timingSafeEqual } from "node:crypto";

/**
 * Admin guard for money-moving routes. Constant-time comparison of a bearer token.
 * Fails closed: if ADMIN_TOKEN is unset, nothing is authorised.
 */
export function isAdmin(req: Request, expected = process.env.ADMIN_TOKEN): boolean {
  if (!expected || expected.length < 24) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
