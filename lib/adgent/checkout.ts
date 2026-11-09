import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Surface } from "../db/schema";
import { env } from "../env";
import { createAdOrder, captureOrder, firstCapture, approveLink, decodeAttribution, type PayPalOrder } from "../paypal/orders";
import { money, PayPalError } from "../paypal/client";
import { refundCapture } from "../paypal/money-movement";
import { getOffer } from "./offers";
import { record } from "./ledger";
import { id } from "../util";
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

  const e = env();
  const gross = product.priceCents;
  const discount = gross - offer.finalPriceCents;
  const fee = Math.round(offer.finalPriceCents * campaign.feeRate);
  const pub = args.publisherId
    ? (await db().select().from(schema.publishers).where(eq(schema.publishers.id, args.publisherId)))[0]
    : undefined;
  const publisherShare = pub ? Math.round(fee * pub.revShare) : 0;

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
    item: { name: product.title, sku: product.id, unitCents: gross },
    discountCents: discount,
    platformFeeCents: fee,
    payee: { email: merchant.paypalEmail ?? undefined, merchantId: merchant.paypalMerchantId ?? undefined },
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
    grossCents: gross,
    discountCents: discount,
    feeCents: fee,
    publisherShareCents: publisherShare,
    feeMode: e.ADGENT_FEE_MODE,
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
    detail: `PayPal order created${e.ADGENT_FEE_MODE === "platform_fees" ? ` with ${money.toValue(fee)} platform fee` : ""}`,
  });

  return { orderId: order.id, approveUrl: approveLink(order), totalCents: offer.finalPriceCents };
}

/**
 * Buyer approved → capture. Idempotent: safe to call from both the browser
 * callback and the PAYMENT.CAPTURE.COMPLETED webhook.
 */
export async function completeCheckout(orderId: string): Promise<{ status: string; captureId?: string }> {
  const d = db();
  const [row] = await d.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!row) throw new HttpError(404, "Unknown order");
  if (row.status === "captured") return { status: "captured", captureId: row.captureId ?? undefined };

  let order: PayPalOrder;
  try {
    order = await captureOrder(orderId);
  } catch (err) {
    if (err instanceof PayPalError && err.issue === "ORDER_ALREADY_CAPTURED") {
      return { status: "captured", captureId: row.captureId ?? undefined };
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
    detail: `PayPal capture COMPLETED${attribution ? ` · attributed via custom_id to ${attribution.surface}` : ""}`,
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
      await record({ type: "campaign_paused", campaignId: c.id, merchantId: c.merchantId, detail: "Budget reached — auto-paused" });
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
    id: id("b"),
    name: [order.payer?.name?.given_name, order.payer?.name?.surname].filter(Boolean).join(" ") || "PayPal buyer",
    email,
    city: "—",
  };
  await d.insert(schema.buyers).values(b);
  return b;
}

/** Refund a sale: money goes back via PayPal, and the ad fee is reversed — no sale, no fee. */
export async function refundOrder(orderId: string, reason = "Refund requested") {
  const d = db();
  const [row] = await d.select().from(schema.orders).where(eq(schema.orders.id, orderId));
  if (!row || row.status !== "captured" || !row.captureId) throw new HttpError(409, "Order is not refundable");
  const refund = await refundCapture(row.captureId, null, reason);
  await d.update(schema.orders).set({ status: "refunded" }).where(eq(schema.orders.id, orderId));
  if (row.campaignId) {
    await d
      .update(schema.campaigns)
      .set({ spentCents: sql`max(0, ${schema.campaigns.spentCents} - ${row.feeCents})` })
      .where(eq(schema.campaigns.id, row.campaignId));
  }
  await record({
    type: "refunded",
    campaignId: row.campaignId,
    merchantId: row.merchantId,
    publisherId: row.publisherId,
    surface: row.surface,
    amountCents: -(row.grossCents - row.discountCents),
    feeCents: -row.feeCents,
    paypalRef: refund.id,
    detail: `Refund ${refund.status} · ad fee reversed`,
  });
  return refund;
}
