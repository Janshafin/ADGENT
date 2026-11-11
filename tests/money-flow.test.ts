import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@/lib/db";
import { startCheckout, completeCheckout, refundOrder, applyRefund } from "@/lib/adgent/checkout";
import { settleDue } from "@/lib/adgent/settlement";
import { simApprove } from "@/lib/paypal/simulator";
import { HttpError } from "@/lib/http";
import { freshDb, seedMinimal } from "./helpers/db";

/**
 * The whole money path against the PayPal simulator:
 * click → order → approve → capture → hold → payouts → refund.
 * $20 item, 10% off → $18 sale; 10% fee → $1.80; publisher gets half → $0.90; merchant nets $16.20.
 */
describe("money flow (payouts mode, simulated PayPal)", () => {
  let d: Awaited<ReturnType<typeof freshDb>>;
  let orderId: string;
  let captureId: string;

  beforeAll(async () => {
    d = await freshDb();
    await seedMinimal();
  });

  const events = async (type: string) => (await d.select().from(schema.events)).filter((e) => e.type === type);
  const order = async () => (await d.select().from(schema.orders).where(eq(schema.orders.id, orderId)))[0];
  const campaign = async () => (await d.select().from(schema.campaigns).where(eq(schema.campaigns.id, "c_test")))[0];

  it("creates an attributed PayPal order with the right split", async () => {
    const r = await startCheckout({ offerId: "c_test:p_test", surface: "widget", publisherId: "pub_test", buyerRef: "b_1" });
    orderId = r.orderId;
    expect(r.totalCents).toBe(1800);
    expect(r.approveUrl).toContain(`/shop/simulate?token=${orderId}`);
    const o = await order();
    expect(o).toMatchObject({ status: "created", grossCents: 2000, discountCents: 200, feeCents: 180, publisherShareCents: 90, merchantNetCents: 1620, feeMode: "payouts" });
    expect(o.merchantNetCents + o.feeCents).toBe(o.grossCents - o.discountCents);
  });

  it("refuses to capture before the buyer approves", async () => {
    await expect(completeCheckout(orderId)).rejects.toMatchObject({ status: 409 });
    expect((await order()).status).toBe("created");
  });

  it("captures exactly once, even when two callbacks race", async () => {
    await simApprove(orderId, { name: "Ada Lovelace", email: "ada@example.com" });
    const [a, b] = await Promise.all([completeCheckout(orderId), completeCheckout(orderId)]);
    expect(a.status).toBe("captured");
    expect(b.status).toBe("captured");
    captureId = (await order()).captureId!;
    expect(captureId).toMatch(/^SIMCAP/);
    expect(await events("captured")).toHaveLength(1);
    expect(await events("fee_collected")).toHaveLength(1);
    expect((await campaign()).spentCents).toBe(180);
    // the sale flows back into the transaction graph
    const tx = (await d.select().from(schema.transactions)).filter((t) => t.paypalCaptureId === captureId);
    expect(tx).toHaveLength(1);
    expect(tx[0].buyerId).toBe("b_1");
  });

  it("holds payouts until the refund window passes", async () => {
    const held = await settleDue({ holdSeconds: 3600 });
    expect(held.orders).toBe(0);
    expect((await order()).status).toBe("captured");
  });

  it("pays merchant net and publisher share once, in one Payouts batch", async () => {
    const r = await settleDue({ holdSeconds: 0 });
    expect(r.orders).toBe(1);
    expect(r.paid).toEqual(
      expect.arrayContaining([
        { name: "Test Roasters", kind: "merchant", cents: 1620 },
        { name: "Test Blog", kind: "publisher", cents: 90 },
      ]),
    );
    const o = await order();
    expect(o.status).toBe("settled");
    expect(o.payoutId).toBe(r.batchId);
    const again = await settleDue({ holdSeconds: 0 });
    expect(again.orders).toBe(0);
    expect(await d.select().from(schema.payouts)).toHaveLength(2);
  });

  it("refunds once, reverses the fee and records the clawback", async () => {
    const refund = await refundOrder(orderId);
    expect(refund.id).toMatch(/^SIMREF/);
    expect((await order()).status).toBe("refunded");
    expect((await campaign()).spentCents).toBe(0);
    const [ev] = await events("refunded");
    expect(ev.amountCents).toBe(-1800);
    expect(ev.feeCents).toBe(-180);
    expect(ev.detail).toContain("clawback");
    await expect(refundOrder(orderId)).rejects.toBeInstanceOf(HttpError);
    expect(await applyRefund(captureId, "dup", "webhook replay")).toBe(false);
    expect(await events("refunded")).toHaveLength(1);
  });

  it("never sells an ad the budget can't pay for", async () => {
    await d.update(schema.campaigns).set({ budgetCents: 100 }).where(eq(schema.campaigns.id, "c_test"));
    await expect(startCheckout({ offerId: "c_test:p_test", surface: "agent" })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects unknown and paused offers", async () => {
    await expect(startCheckout({ offerId: "c_nope:p_test", surface: "agent" })).rejects.toMatchObject({ status: 404 });
    await d.update(schema.campaigns).set({ status: "paused", budgetCents: 10_000 }).where(eq(schema.campaigns.id, "c_test"));
    await expect(startCheckout({ offerId: "c_test:p_test", surface: "agent" })).rejects.toMatchObject({ status: 409 });
  });
});
