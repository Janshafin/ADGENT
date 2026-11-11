import { beforeAll, describe, expect, it, vi } from "vitest";

// Route handlers call connection() to opt out of prerendering; outside Next there is no request scope.
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), connection: async () => {} }));
import { NextRequest } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { body, fail, baseUrl, HttpError } from "@/lib/http";
import { aiAvailable, resetAiBudget } from "@/lib/ai/budget";
import { proxy } from "@/proxy";
import { resetEnvCache } from "@/lib/env";
import { db, schema } from "@/lib/db";
import { demoUpkeep } from "@/lib/adgent/worker";
import { freshDb } from "./helpers/db";
import { GET as merchantsGET } from "@/app/api/merchants/route";
import { POST as agentPOST } from "@/app/api/agent/route";

const post = (data: string, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new Request("http://t/api/x", { method: "POST", body: data, headers });

describe("request bodies", () => {
  const S = z.object({ a: z.number() });
  it("parses valid JSON", async () => {
    expect(await body(post('{"a":1}'), S)).toEqual({ a: 1 });
  });
  it("rejects non-JSON content types, so cross-site forms can't post", async () => {
    await expect(body(post('{"a":1}', { "content-type": "text/plain" }), S)).rejects.toMatchObject({ status: 415 });
  });
  it("rejects oversized bodies", async () => {
    await expect(body(post(JSON.stringify({ a: 1, pad: "x".repeat(40_000) })), S)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed JSON with a 400", async () => {
    await expect(body(post("{nope"), S)).rejects.toMatchObject({ status: 400 });
  });
});

describe("error responses", () => {
  it("hide internal error text in production", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      const res = fail(new Error("SQLITE_ERROR: no such table: secrets"));
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain("SQLITE");
      // Deliberate, user-facing errors still come through.
      expect((await fail(new HttpError(409, "Budget is used up")).json()).error).toBe("Budget is used up");
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    }
  });
});

describe("base URL", () => {
  it("uses APP_URL, not a forged Host header", () => {
    const r = new Request("http://evil.example/x", { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } });
    expect(baseUrl(r)).toBe("http://test.local");
  });
});

describe("cross-site request guard", () => {
  const req = (method: string, headers: Record<string, string>, path = "/api/campaigns") =>
    new NextRequest(`http://test.local${path}`, { method, headers: { host: "test.local", ...headers } });
  it("blocks a POST from another site", () => {
    expect(proxy(req("POST", { origin: "https://evil.example" })).status).toBe(403);
    expect(proxy(req("POST", { "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect(proxy(req("POST", { origin: "null" })).status).toBe(403);
  });
  it("allows same-origin, server-to-server and read-only requests", () => {
    expect(proxy(req("POST", { origin: "http://test.local", "sec-fetch-site": "same-origin" })).status).toBe(200);
    expect(proxy(req("POST", {})).status).toBe(200);
    expect(proxy(req("GET", { origin: "https://blog.example" }, "/api/offers")).status).toBe(200);
  });
  it("leaves PayPal webhooks to signature verification", () => {
    expect(proxy(req("POST", { origin: "https://evil.example" }, "/api/webhooks/paypal")).status).toBe(200);
  });
});

describe("AI spend cap", () => {
  it("falls back to offline once the hourly budget is used, then resets", () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.AI_MAX_CALLS_PER_HOUR = "2";
    resetEnvCache();
    resetAiBudget();
    try {
      const t = 1_000_000;
      expect(aiAvailable(t)).toBe(true);
      expect(aiAvailable(t)).toBe(true);
      expect(aiAvailable(t)).toBe(false);
      expect(aiAvailable(t + 3_600_000)).toBe(true);
    } finally {
      process.env.ANTHROPIC_API_KEY = "";
      delete process.env.AI_MAX_CALLS_PER_HOUR;
      resetEnvCache();
      resetAiBudget();
    }
  });
});

describe("public API data", () => {
  beforeAll(async () => {
    await freshDb();
    await db().insert(schema.merchants).values({ id: "m_sec", name: "Sec Roasters", category: "coffee", paypalEmail: "owner@private.example", paypalMerchantId: "SECRETID" });
  });
  it("never exposes merchant PayPal emails or ids", async () => {
    const text = JSON.stringify(await (await merchantsGET()).json());
    expect(text).toContain("Sec Roasters");
    expect(text).not.toContain("owner@private.example");
    expect(text).not.toContain("SECRETID");
  });
  it("refuses image or document blocks smuggled into the agent history", async () => {
    const res = await agentPOST(
      post(JSON.stringify({
        shopperRef: "s1",
        text: "hi",
        history: [{ role: "user", content: [{ type: "image", source: { type: "url", url: "https://x" } }] }],
      })),
    );
    expect(res.status).toBe(400);
  });
});

describe("demo upkeep", () => {
  it("switches a vandalised seed campaign back on after 15 quiet minutes", async () => {
    await freshDb();
    const d = db();
    await d.insert(schema.merchants).values({ id: "m_beanthere", name: "Bean There", category: "coffee" }).onConflictDoNothing();
    await d.insert(schema.campaigns).values({
      id: "c_live_beanthere", merchantId: "m_beanthere", name: "Seed", objective: "winback", audienceKey: "lapsed", audienceSize: 0,
      audienceBuyerIds: [], productIds: [], discountPct: 10, payLater: false, feeRate: 0.1, budgetCents: 1000, spentCents: 1000,
      holdoutPct: 10, headline: "h", body: "b", agentBlurb: "a", rationale: "r",
      forecast: { reach: 0, expectedSales: 0, expectedRevenueCents: 0, expectedAdCostCents: 0, expectedRoas: 0 },
      status: "paused", createdAt: new Date(0),
    });
    await d.insert(schema.events).values({ ts: new Date(1_000_000), type: "campaign_paused", campaignId: "c_live_beanthere" });

    expect((await demoUpkeep(1_000_000 + 60_000)).reactivated).toEqual([]);
    expect((await demoUpkeep(1_000_000 + 16 * 60_000)).reactivated).toEqual(["c_live_beanthere"]);
    const [c] = await d.select().from(schema.campaigns).where(eq(schema.campaigns.id, "c_live_beanthere"));
    expect(c.status).toBe("active");
    expect(c.budgetCents).toBeGreaterThan(c.spentCents);
  });
});

describe("offer ids", () => {
  it("treat malformed ids as not found instead of crashing", async () => {
    const { getOffer } = await import("@/lib/adgent/offers");
    await freshDb();
    expect(await getOffer("' OR 1=1--")).toBeNull();
    expect(await getOffer("a:b:c")).toBeNull();
  });
});
