import { describe, expect, it } from "vitest";
import { rateLimit, clientIp } from "@/lib/http/rate-limit";
import { requireAdmin } from "@/lib/auth/admin";
import { inHoldout } from "@/lib/adgent/offers";
import { bucket } from "@/lib/util";
import { resetEnvCache } from "@/lib/env";

const req = (ip: string, auth?: string) => new Request("http://t", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1`, ...(auth ? { authorization: auth } : {}) } });

describe("rate limit", () => {
  it("allows the limit, then 429s, then resets after the window", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) rateLimit(req("1.1.1.1"), "t", 3, 60_000, t0);
    expect(() => rateLimit(req("1.1.1.1"), "t", 3, 60_000, t0 + 1)).toThrow(/Too many/);
    rateLimit(req("2.2.2.2"), "t", 3, 60_000, t0 + 1); // other clients unaffected
    rateLimit(req("1.1.1.1"), "t", 3, 60_000, t0 + 60_000);
  });
  it("reads the first forwarded hop", () => {
    expect(clientIp(req("9.9.9.9"))).toBe("9.9.9.9");
  });
});

describe("requireAdmin", () => {
  it("is open in simulated mode, where no real money moves", () => {
    expect(() => requireAdmin(req("1.1.1.1"))).not.toThrow();
  });
  it("needs the token once PayPal credentials exist", () => {
    process.env.PAYPAL_CLIENT_ID = "id";
    process.env.PAYPAL_CLIENT_SECRET = "secret";
    process.env.ADMIN_TOKEN = "t".repeat(32);
    resetEnvCache();
    try {
      expect(() => requireAdmin(req("1.1.1.1"))).toThrow(/Admin token/);
      expect(() => requireAdmin(req("1.1.1.1", `Bearer ${"t".repeat(32)}`))).not.toThrow();
    } finally {
      process.env.PAYPAL_CLIENT_ID = "";
      process.env.PAYPAL_CLIENT_SECRET = "";
      resetEnvCache();
    }
  });
});

describe("holdout", () => {
  it("is stable per buyer and campaign", () => {
    expect(bucket("c1:b1")).toBe(bucket("c1:b1"));
    expect(inHoldout("c1", "b1", 10)).toBe(inHoldout("c1", "b1", 10));
  });
  it("never holds out an anonymous shopper", () => {
    expect(inHoldout("c1", null, 100)).toBe(false);
  });
  it("holds out roughly the configured share", () => {
    const n = 5000;
    const held = Array.from({ length: n }, (_, i) => inHoldout("c_x", `b_${i}`, 10)).filter(Boolean).length;
    expect(held / n).toBeGreaterThan(0.08);
    expect(held / n).toBeLessThan(0.12);
  });
});

describe("env", () => {
  it("treats empty host variables as unset", async () => {
    const { env } = await import("@/lib/env");
    process.env.APP_URL = "";
    process.env.SETTLEMENT_HOLD_SECONDS = "";
    resetEnvCache();
    try {
      expect(env().APP_URL).toBe("http://localhost:3000");
      expect(env().SETTLEMENT_HOLD_SECONDS).toBe(120);
      process.env.APP_URL = "https://adgent.example/";
      resetEnvCache();
      expect(env().APP_URL).toBe("https://adgent.example");
    } finally {
      process.env.APP_URL = "http://test.local";
      delete process.env.SETTLEMENT_HOLD_SECONDS;
      resetEnvCache();
    }
  });
});
