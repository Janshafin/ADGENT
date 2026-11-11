import { env } from "../env";
import type { FeeMode } from "../db/schema";
import { money, paypal } from "./client";

export type PayPalLink = { href: string; rel: string; method?: string };

export type PayPalOrder = {
  id: string;
  status: "CREATED" | "SAVED" | "APPROVED" | "VOIDED" | "COMPLETED" | "PAYER_ACTION_REQUIRED";
  links: PayPalLink[];
  payer?: { email_address?: string; payer_id?: string; name?: { given_name?: string; surname?: string } };
  purchase_units: {
    reference_id?: string;
    custom_id?: string;
    payments?: {
      captures?: {
        id: string;
        status: string;
        amount: { value: string; currency_code: string };
        seller_receivable_breakdown?: {
          gross_amount: { value: string };
          paypal_fee?: { value: string };
          platform_fees?: { amount: { value: string }; payee?: { merchant_id?: string } }[];
          net_amount?: { value: string };
        };
      }[];
    };
  }[];
};

export type AdOrderInput = {
  /** Attribution key encoded into custom_id: campaign|surface|publisher */
  attribution: { campaignId: string | null; surface: string; publisherId: string | null };
  item: { name: string; sku: string; unitCents: number; category?: "PHYSICAL_GOODS" | "DIGITAL_GOODS" };
  discountCents: number;
  /** Ad fee routed to the platform at capture (platform_fees mode only) */
  platformFeeCents: number;
  /** Merchant receiving the sale. Ignored in payouts mode, where ADGENT is the payee and pays the merchant later. */
  payee: { email?: string; merchantId?: string };
  feeMode: FeeMode;
  description: string;
  idempotencyKey: string;
};

export function encodeAttribution(a: AdOrderInput["attribution"]): string {
  return ["adg", a.campaignId ?? "-", a.surface, a.publisherId ?? "-"].join("|").slice(0, 127);
}

export function decodeAttribution(customId?: string) {
  const parts = (customId ?? "").split("|");
  if (parts.length !== 4) return null;
  const [tag, campaignId, surface, publisherId] = parts;
  if (tag !== "adg") return null;
  return {
    campaignId: campaignId === "-" ? null : campaignId,
    surface,
    publisherId: publisherId === "-" ? null : publisherId,
  };
}

/** The order body ADGENT sends to PayPal. Pure, so tests can check it without the network. */
export function buildAdOrderBody(input: AdOrderInput, appUrl: string, platformMerchantId = "") {
  const total = input.item.unitCents - input.discountCents;
  if (total <= 0) throw new RangeError("Order total must be positive");
  const payee: Record<string, string> = {};
  if (input.feeMode !== "payouts") {
    if (input.payee.merchantId) payee.merchant_id = input.payee.merchantId;
    else if (input.payee.email) payee.email_address = input.payee.email;
  }

  const purchaseUnit: Record<string, unknown> = {
    reference_id: input.item.sku,
    custom_id: encodeAttribution(input.attribution),
    description: input.description.slice(0, 127),
    soft_descriptor: "ADGENT",
    amount: {
      currency_code: "USD",
      value: money.toValue(total),
      breakdown: {
        item_total: { currency_code: "USD", value: money.toValue(input.item.unitCents) },
        discount: { currency_code: "USD", value: money.toValue(input.discountCents) },
      },
    },
    items: [
      {
        name: input.item.name.slice(0, 127),
        sku: input.item.sku,
        quantity: "1",
        category: input.item.category ?? "PHYSICAL_GOODS",
        unit_amount: { currency_code: "USD", value: money.toValue(input.item.unitCents) },
      },
    ],
  };
  if (Object.keys(payee).length) purchaseUnit.payee = payee;

  if (input.feeMode === "platform_fees" && input.platformFeeCents > 0) {
    purchaseUnit.payment_instruction = {
      disbursement_mode: "INSTANT",
      platform_fees: [
        {
          amount: { currency_code: "USD", value: money.toValue(input.platformFeeCents) },
          ...(platformMerchantId ? { payee: { merchant_id: platformMerchantId } } : {}),
        },
      ],
    };
  }

  return {
    intent: "CAPTURE",
    purchase_units: [purchaseUnit],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "ADGENT Sponsored Offer",
          user_action: "PAY_NOW",
          shipping_preference: "NO_SHIPPING",
          return_url: `${appUrl}/shop/return`,
          cancel_url: `${appUrl}/shop/cancel`,
        },
      },
    },
  };
}

/**
 * Create a PayPal order for an ad-attributed sale.
 * The discount is a real line-level discount. In platform_fees mode the ad fee is declared
 * on the purchase unit so PayPal splits it out at capture time.
 */
export async function createAdOrder(input: AdOrderInput): Promise<PayPalOrder> {
  const e = env();
  return paypal<PayPalOrder>("/v2/checkout/orders", {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: buildAdOrderBody(input, e.APP_URL, e.PAYPAL_PLATFORM_MERCHANT_ID),
  });
}

export function captureOrder(orderId: string): Promise<PayPalOrder> {
  return paypal<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    idempotencyKey: `capture-${orderId}`,
    body: {},
  });
}

export function getOrder(orderId: string): Promise<PayPalOrder> {
  return paypal<PayPalOrder>(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
}

export function approveLink(order: PayPalOrder): string | undefined {
  return order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
}

export function firstCapture(order: PayPalOrder) {
  return order.purchase_units[0]?.payments?.captures?.[0];
}
