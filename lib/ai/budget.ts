import { aiConfigured } from "../env";

const g = globalThis as unknown as { __adgentAi?: { start: number; used: number } };
const HOUR = 3_600_000;

function limit(): number {
  const n = Number(process.env.AI_MAX_CALLS_PER_HOUR);
  return Number.isFinite(n) && n >= 0 ? n : 300;
}

/**
 * Whether this request may use Claude. Takes one unit from a global hourly budget, so a
 * script hammering the public endpoints (from however many IPs) can't run up the Anthropic
 * bill: past the cap, every AI feature quietly falls back to its offline path until the hour resets.
 */
export function aiAvailable(now = Date.now()): boolean {
  if (!aiConfigured()) return false;
  const w = (g.__adgentAi ??= { start: now, used: 0 });
  if (now - w.start >= HOUR) {
    w.start = now;
    w.used = 0;
  }
  if (w.used >= limit()) return false;
  w.used++;
  return true;
}

/** Tests only. */
export function resetAiBudget() {
  g.__adgentAi = undefined;
}
