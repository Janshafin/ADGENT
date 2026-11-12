import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Every model call fails the way an empty Anthropic credit balance does.
vi.mock("@/lib/ai/claude", () => {
  const fail = async () => {
    throw new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}');
  };
  return { FALLBACK_BETA: "test", claude: () => ({ beta: { messages: { create: fail } } }), structured: fail };
});

import { resetEnvCache } from "@/lib/env";
import { resetAiBudget } from "@/lib/ai/budget";
import { shopperTurn } from "@/lib/ai/shopper";
import { askLedger } from "@/lib/ai/ask";
import { freshDb, seedMinimal } from "./helpers/db";

describe("AI features when the model call fails", () => {
  beforeAll(async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-no-credit";
    resetEnvCache();
    resetAiBudget();
    vi.spyOn(console, "error").mockImplementation(() => {});
    await freshDb();
    await seedMinimal();
  });
  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = "";
    resetEnvCache();
  });

  it("the shopping agent answers with the offline agent instead of an error", async () => {
    const t = await shopperTurn({ history: [], userText: "some good coffee beans", shopperRef: "shopper_t", baseUrl: "http://test.local" });
    expect(t.mode).toBe("offline");
    expect(t.ui[0]).toMatchObject({ kind: "offers" });
  });

  it("ledger questions fall back to keyword matching", async () => {
    const q = await askLedger("Every refund");
    expect(q.filters).toEqual([{ column: "type", op: "equals", value: "refunded", valueTo: null }]);
  });
});
