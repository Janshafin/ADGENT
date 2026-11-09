"use client";

/** Small fetch helper for client components. Throws with the server's error message. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; paypalDebugId?: string };
  if (!res.ok) {
    throw new Error(`${data.error ?? res.statusText}${data.paypalDebugId ? ` (PayPal debug ${data.paypalDebugId})` : ""}`);
  }
  return data;
}

export const fmtUsd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtCents = (c: number, digits = 2) => fmtUsd(c / 100, digits);
