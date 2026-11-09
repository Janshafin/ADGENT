import { describe, expect, it } from "vitest";
import { isAdmin } from "@/lib/auth/admin";

const TOKEN = "x".repeat(32);
const req = (auth?: string) => new Request("http://t", { headers: auth ? { authorization: auth } : {} });

describe("isAdmin", () => {
  it("fails closed when no token is configured", () => {
    expect(isAdmin(req(`Bearer ${TOKEN}`), undefined)).toBe(false);
  });
  it("rejects short configured tokens", () => {
    expect(isAdmin(req("Bearer abc"), "abc")).toBe(false);
  });
  it("accepts only the exact bearer token", () => {
    expect(isAdmin(req(`Bearer ${TOKEN}`), TOKEN)).toBe(true);
    expect(isAdmin(req(`Bearer ${TOKEN}x`), TOKEN)).toBe(false);
    expect(isAdmin(req(TOKEN), TOKEN)).toBe(false);
    expect(isAdmin(req(), TOKEN)).toBe(false);
  });
});
