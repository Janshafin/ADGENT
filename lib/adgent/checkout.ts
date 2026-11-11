import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Surface } from "../db/schema";
import { env } from "../env";
import { createAdOrder, captureOrder, getOrder, firstCapture, approveLink, decodeAttribution, type PayPalOrder } from "../paypal/orders";
import { money, PayPalError } from "../paypal/client";
import { refundCapture } from "../paypal/money-movement";
import { splitSale } from "../money/split";
import { getOffer } from "./offers";
import { record } from "./ledger";
import { id, usd } from "../util";
import { HttpError } from "../http";

export type StartResult = { orderId: string; approveUrl?: string; totalCents: number };

/** Click → PayPal order. The ad attribution travels inside the order's custom_id. */
export async function startCheckout(args: {
  offerId: string;
  surface: Surface;
  publisherId?: string | null;
  buyerRef?: string | null;
}): Promise<StartResult> {
  const offer = await getOffer(args.offerId);
  if (!offer) throw new HttpError(404, "Offer not found or no longer active");
  const { campaign, product, merchant } = offer;
  if (campaign.status !== "active") throw new HttpError(409, "This campaign is paused");

  const pub = args.publisherId
    ? (await db().select().from(schema.publishers).where(eq(schema.publishers.id, args.publisherId)))[0]
    : undefined;
  const split = splitSale({
    unitCents: product.priceCents,
    discountCents: product.priceCents - offer.finalPriceCents,
    feeRate: campaign.feeRate,
    revShare: pub?.revShare ?? 0,
  });
  // Never sell an ad the merchant's budget can't pay for.
  if (campaign.spentCents + split.adFee > campaign.budgetCents) throw new HttpError(409, "This campaign has used its budget");

  const feeMode = env().ADGENT_FEE_MODE;
  await record({
    type: "click",
    campaignId: campaign.id,
    merchantId: merchant.id,
    publisherId: pub?.id ?? null,
    surface: args.surface,
    buyerRef: args.buyerRef ?? null,
    detail: product.title,
  });

  const order = await createAdOrder({
    attribution: { campaignId: campaign.id, surface: args.surface, publisherId: pub?.id ?? null },
    item: { name: product.title, sku: product.id, unitCents: split.gross },
    discountCents: split.discount,
    platformFeeCents: split.adFee,
    payee: { email: merchant.paypalEmail ?? undefined, merchantId: merchant.paypalMerchantId ?? undefined },
    feeMode,
    description: `${merchant.name} · sponsored offer`,
    idempotencyKey: id("ord"),
  });

  await db().insert(schema.orders).values({
    id: order.id,
    campaignId: campaign.id,
    merchantId: merchant.id,
    productId: product.id,
    publisherId: pub?.id ?? null,
    surface: args.surface,
    buyerRef: args.buyerRef ?? null,
    grossCents: split.gross,
    discountCents: split.discount,
    feeCents: split.adFee,
    publisherShareCents: split.publisherShare,
    merchantNetCents: split.merchantNet,
    feeMode,
    status: "created",
    createdAt: new Date(),
  });
  await record({
    type: "order_created",
    campaignId: campaign.id,
    merchantId: merchant.id,
    publisherId: pub?.id ?? null,
    surface: args.surface,
    buyerRef: args.buyerRef ?? null,
    amountCents: offer.finalPriceCents,
    paypalRef: order.id,
    detail: `PayPal order created${feeMode === "platform_fees" ? ` with ${money.toValue(split.adFee)} platform fee` : ""}`,
  });

  return { orderId: order.id, approveUrl: approveLink(order), totalCents: offer.finalPriceCents };
}

/**
 * Buyer approved → capture. Idempotent: safe to call from the browser callback,
 * the MCP confirm tool, the reconciler and the PAYMENT.CAPTURE.COMPLETED webhook.
 */
export async function completeCheckout(orderId: string): Promise<{ status: string; captureId?: string }> {
  const [row] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!row) throw new HttpError(404, "Unknown order");
  if (row.status === "captured" || row.status === "settled") return { status: "captured", captureId: row.captureId ?? undefined };
  if (row.status !== "created") throw new HttpError(409, `Order is ${row.status}`);

  let order: PayPalOrder;
  try {
    order = await captureOrder(orderId);
  } catch (err) {
    if (err instanceof PayPalError && err.issue === "ORDER_ALREADY_CAPTURED") {
      // Captured elsewhere (another tab, a retry): book it from PayPal's copy.
      return settleCaptured(await getOrder(orderId));
    }
    if (err instanceof PayPalError && (err.issue === "ORDER_NOT_APPROVED" || err.issue === "PAYER_ACTION_REQUIRED")) {
      throw new HttpError(409, "The shopper hasn't approved this payment in PayPal yet");
    }
    await record({ type: "order_created", campaignId: row.campaignId, merchantId: row.merchantId, paypalRef: orderId, detail: `capture failed: ${(err as Error).message.slice(0, 160)}` });
    throw err;
  }
  return settleCaptured(order);
}

/** Apply a COMPLETED PayPal order to our books exactly once. */
export async function settleCaptured(order: PayPalOrder) {
  const d = db();
  const cap = firstCapture(order);
  if (!cap || cap.status !== "COMPLETED") return { status: cap?.status?.toLowerCase() ?? "pending" };

  // Only the first writer flips created → captured; everyone else no-ops.
  const updated = await d
    .update(schema.orders)
    .set({ status: "captured", captureId: cap.id, capturedAt: new Date(), payerEmail: order.payer?.email_address ?? null })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, "created")))
    .returning();
  const row = updated[0];
  if (!row) return { status: "captured", captureId: cap.id };

  const attribution = decodeAttribution(order.purchase_units[0]?.custom_id);
  const net = row.grossCents - row.discountCents;
  const capturedCents = money.toCents(cap.amount.value);
  const platformFee = cap.seller_receivable_breakdown?.platform_fees?.[0]?.amount.value;

  await record({
    type: "captured",
    campaignId: row.campaignId,
    merchantId: row.merchantId,
    publisherId: row.publisherId,
    surface: row.surface,
    buyerRef: row.buyerRef,
    amountCents: net,
    paypalRef: cap.id,
    detail: [
      "PayPal capture COMPLETED",
      attribution ? `attributed via custom_id to ${attribution.surface}` : null,
      capturedCents !== net ? `⚠ PayPal captured ${usd(capturedCents)}, expected ${usd(net)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
  await record({
    type: "fee_collected",
    campaignId: row.campaignId,
    merchantId: row.merchantId,
    publisherId: row.publisherId,
    surface: row.surface,
    feeCents: row.feeCents,
    paypalRef: cap.id,
    detail:
      row.feeMode === "platform_fees"
        ? `Split at capture by PayPal platform_fees (${platformFee ?? money.toValue(row.feeCents)})`
        : row.feeMode === "payouts"
          ? `Kept from the sale. Merchant gets ${usd(row.merchantNetCents)} by PayPal Payouts after the refund hold`
          : "Accrued → billed on next pay-per-sale PayPal invoice",
  });

  if (row.campaignId) {
    const [c] = await d
      .update(schema.campaigns)
      .set({ spentCents: sql`${schema.campaigns.spentCents} + ${row.feeCents}` })
      .where(eq(schema.campaigns.id, row.campaignId))
      .returning();
    if (c && c.spentCents >= c.budgetCents && c.status === "active") {
      await d.update(schema.campaigns).set({ status: "paused" }).where(eq(schema.campaigns.id, c.id));
      await record({ type: "campaign_paused", campaignId: c.id, merchantId: c.merchantId, detail: "Budget reached, auto-paused" });
    }
  }

  // Feed the sale back into the transaction graph so audiences learn from it.
  await d.insert(schema.transactions).values({
    id: id("tx"),
    merchantId: row.merchantId,
    buyerId: (await ensureBuyer(row.buyerRef, order)).id,
    productId: row.productId,
    amountCents: net,
    createdAt: new Date(),
    source: "paypal",
    paypalCaptureId: cap.id,
    campaignId: row.campaignId,
  });

  return { status: "captured", captureId: cap.id };
}

async function ensureBuyer(buyerRef: string | null, order: PayPalOrder) {
  const d = db();
  if (buyerRef) {
    const [b] = await d.select().from(schema.buyers).where(eq(schema.buyers.id, buyerRef));
    if (b) return b;
  }
  const email = order.payer?.email_address ?? `${order.payer?.payer_id ?? "guest"}@paypal.sandbox`;
  const [existing] = await d.select().from(schema.buyers).where(eq(schema.buyers.email, email));
  if (existing) return existing;
  const b = {
    // Keep the shopper ref as the buyer id so holdout and lift measurement can follow them.
    id: buyerRef ?? id("b"),
    name: [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(" ") || "PayPal buyer",
    email,
    city: "—",
  };
  await d.insert(schema.buyers).values(b).onConflictDoNothing();
  return b;
}

/** Refund a sale: money goes back via PayPal, and the ad fee is reversed. No sale, no fee. */
export async function refundOrder(orderId: string, reason = "Refund requested") {
  const [row] = await db().select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!row || !row.captureId || (row.status !== "captured" && row.status !== "settled")) throw new HttpError(409, "Order is not refundable");
  // PayPal-Request-Id makes a repeated refund return the first one, so a double click can't refund twice.
  const refund = await refundCapture(row.captureId, null, reason);
  await applyRefund(row.captureId, refund.id, `Refund ${refund.status}`);
  return refund;
}

/**
 * Book a refund exactly once, whether it came from our API or a PayPal webhook.
 * Returns false if the refund was already booked.
 */
export async function applyRefund(captureId: string, refundId: string | null, source: string): Promise<boolean> {
  const d = db();
  const [row] = await d
    .update(schema.orders)
    .set({ status: "refunded", refundId })
    .where(and(eq(schema.orders.captureId, captureId), inArray(schema.orders.status, ["captured", "settled"])))
    .returning();
  if (!row) return false;

  if (row.campaignId) {
    await d
      .update(schema.campaigns)
      .set({ spentCents: sql`max(0, ${schema.campaigns.spentCents} - ${row.feeCents})` })
      .where(eq(schema.campaigns.id, row.campaignId));
  }
  const alreadyPaidOut = row.payoutId !== null;
  await record({
    type: "refunded",
    campaignId: row.campaignId,
    merchantId: row.merchantId,
    publisherId: row.publisherId,
    surface: row.surface,
    amountCents: -(row.grossCents - row.discountCents),
    feeCents: -row.feeCents,
    paypalRef: refundId ?? captureId,
    detail: [
      `${source} · ad fee reversed`,
      alreadyPaidOut && row.feeMode === "payouts"
        ? `merchant ${usd(row.merchantNetCents)} and publisher ${usd(row.publisherShareCents)} were already paid out: recorded as a clawback owed to ADGENT`
        : alreadyPaidOut
          ? `publisher share ${usd(row.publisherShareCents)} already paid out: recorded as a clawback owed to ADGENT`
          : "refunded inside the hold, so nobody was paid out",
    ].join(" · "),
  });
  return true;
}
