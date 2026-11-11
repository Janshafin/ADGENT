import { describe, expect, it } from "vitest";
import { buildAdOrderBody, decodeAttribution, encodeAttribution, type AdOrderInput } from "@/lib/paypal/orders";
import { money } from "@/lib/paypal/client";
import { capturedIdFromRefund } from "@/lib/paypal/webhooks";
import { payoutPlan } from "@/lib/adgent/settlement";
import type { Order } from "@/lib/db/schema";

const input = (feeMode: AdOrderInput["feeMode"]): AdOrderInput => ({
  attribution: { campaignId: "c_1", surface: "agent", publisherId: "pub_x" },
  item: { name: "Beans", sku: "p_1", unitCents: 2000 },
  discountCents: 200,
  platformFeeCents: 180,
  payee: { email: "merchant@example.com" },
  feeMode,
  description: "test",
  idempotencyKey: "k",
});

type PU = { payee?: unknown; payment_instruction?: { platform_fees: { amount: { value: string } }[] }; amount: { value: string; breakdown: { item_total: { value: string }; discount: { value: string } } }; custom_id: string };

describe("PayPal order body", () => {
  it("payouts mode: ADGENT is payee, no platform fee", () => {
    const pu = buildAdOrderBody(input("payouts"), "https://x").purchase_units[0] as PU;
    expect(pu.payee).toBeUndefined();
    expect(pu.payment_instruction).toBeUndefined();
    expect(pu.amount.value).toBe("18.00");
  });
  it("invoice mode: merchant is payee", () => {
    const pu = buildAdOrderBody(input("invoice"), "https://x").purchase_units[0] as PU;
    expect(pu.payee).toEqual({ email_address: "merchant@example.com" });
  });
  it("platform_fees mode: fee declared for PayPal to split", () => {
    const pu = buildAdOrderBody(input("platform_fees"), "https://x", "PLATFORM").purchase_units[0] as PU;
    expect(pu.payment_instruction?.platform_fees[0].amount.value).toBe("1.80");
  });
  it("amount equals item total minus discount (PayPal rejects mismatches)", () => {
    const pu = buildAdOrderBody(input("payouts"), "https://x").purchase_units[0] as PU;
    expect(money.toCents(pu.amount.breakdown.item_total.value) - money.toCents(pu.amount.breakdown.discount.value)).toBe(money.toCents(pu.amount.value));
  });
  it("refuses a zero total", () => {
    expect(() => buildAdOrderBody({ ...input("payouts"), discountCents: 2000 }, "https://x")).toThrow(RangeError);
  });
});

describe("attribution in custom_id", () => {
  it("round-trips", () => {
    const a = { campaignId: "c_1", surface: "widget", publisherId: null };
    expect(decodeAttribution(encodeAttribution(a))).toEqual(a);
  });
  it("ignores foreign or malformed custom_ids", () => {
    expect(decodeAttribution("somebody-else")).toBeNull();
    expect(decodeAttribution("adg|c_1")).toBeNull();
    expect(decodeAttribution(undefined)).toBeNull();
  });
});

describe("money.toCents", () => {
  it("parses PayPal amounts without float drift", () => {
    expect(money.toCents("19.99")).toBe(1999);
    expect(money.toCents("0.1")).toBe(10);
    expect(money.toCents("1234")).toBe(123400);
    expect(money.toCents("-5.05")).toBe(-505);
    expect(money.toValue(1999)).toBe("19.99");
  });
  it("rejects garbage", () => {
    expect(() => money.toCents("1.234")).toThrow();
    expect(() => money.toCents("abc")).toThrow();
  });
});

describe("webhooks", () => {
  it("finds the capture a refund belongs to", () => {
    expect(capturedIdFromRefund({ links: [{ rel: "up", href: "https://api.paypal.com/v2/payments/captures/8MC585209K746392H" }] })).toBe("8MC585209K746392H");
    expect(capturedIdFromRefund({ links: [] })).toBeNull();
  });
});

describe("payout plan", () => {
  const o = (p: Partial<Order>): Order =>
    ({ id: "o", merchantId: "m_a", publisherId: null, feeMode: "payouts", merchantNetCents: 1000, publisherShareCents: 50, ...p }) as Order;
  const merchants = [{ id: "m_a", name: "A", paypalEmail: "a@x.com" }, { id: "m_b", name: "B", paypalEmail: null }];
  const pubs = [{ id: "pub", name: "Blog", paypalEmail: "blog@x.com" }];

  it("sums per recipient and only pays merchants in payouts mode", () => {
    const plan = payoutPlan(
      [o({ id: "1", publisherId: "pub" }), o({ id: "2", publisherId: "pub" }), o({ id: "3", feeMode: "invoice", merchantId: "m_b", publisherId: "pub" })],
      merchants,
      pubs,
      (id) => `${id}@fallback`,
    );
    expect(plan.find((r) => r.kind === "merchant")).toMatchObject({ email: "a@x.com", cents: 2000 });
    expect(plan.find((r) => r.kind === "publisher")).toMatchObject({ cents: 150 });
    expect(plan.some((r) => r.refId === "m_b")).toBe(false);
  });
  it("uses the fallback email and skips zero amounts", () => {
    const plan = payoutPlan([o({ merchantId: "m_b", publisherShareCents: 0, publisherId: "pub" })], merchants, pubs, (id) => `${id}@fallback`);
    expect(plan).toEqual([expect.objectContaining({ kind: "merchant", email: "m_b@fallback" })]);
  });
});
