import { timingSafeEqual } from "node:crypto";
import { paypalMode } from "../env";
import { HttpError } from "../http";

/**
 * Admin guard for money-moving routes. Constant-time comparison of a bearer token.
 * Fails closed: if ADMIN_TOKEN is unset or too short, nothing is authorised.
 */
export function isAdmin(req: Request, expected = process.env.ADMIN_TOKEN): boolean {
  if (!expected || expected.length < 24) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Money-moving routes (payouts, refunds, invoices) need the admin token once real PayPal
 * credentials are configured. In simulated mode nothing real moves, so judges can try them.
 */
export function requireAdmin(req: Request): void {
  if (paypalMode() === "simulated" || isAdmin(req)) return;
  throw new HttpError(401, "Admin token required for money-moving actions");
}
