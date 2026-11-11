"use client";

import { useEffect, useState } from "react";

const ADMIN_KEY = "adgent-admin-token";

export function getAdminToken(): string {
  try {
    return sessionStorage.getItem(ADMIN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAdminToken(token: string) {
  try {
    if (token) sessionStorage.setItem(ADMIN_KEY, token);
    else sessionStorage.removeItem(ADMIN_KEY);
  } catch {}
}

/** Small fetch helper for client components. Throws with the server's error message. */
export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const admin = getAdminToken();
  const res = await fetch(path, {
    ...init,
    method: init?.method ?? (init?.json !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(admin ? { Authorization: `Bearer ${admin}` } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; paypalDebugId?: string };
  if (!res.ok) {
    throw new Error(`${data.error ?? res.statusText}${data.paypalDebugId ? ` (PayPal debug ${data.paypalDebugId})` : ""}`);
  }
  return data;
}

export type AppStatus = {
  paypalMode: "simulated" | "sandbox" | "live";
  ai: boolean;
  model: string;
  fastModel: string;
  feeMode: "payouts" | "platform_fees" | "invoice";
  holdSeconds: number;
  webhooks: boolean;
  adminRequired: boolean;
};

let statusPromise: Promise<AppStatus> | null = null;

/** Server status (simulated vs sandbox PayPal, Claude vs offline agent), fetched once per page load. */
export function useStatus(): AppStatus | null {
  const [s, setS] = useState<AppStatus | null>(null);
  useEffect(() => {
    statusPromise ??= api<AppStatus>("/api/status").catch((e) => {
      statusPromise = null;
      throw e;
    });
    let live = true;
    statusPromise.then((x) => live && setS(x)).catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return s;
}

export const fmtUsd = (n: number, digits = 2) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits });

export const fmtCents = (c: number, digits = 2) => fmtUsd(c / 100, digits);
