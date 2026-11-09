import { env } from "../env";
import { money, paypal } from "./client";

// ── Refunds ────────────────────────────────────────────────────────────────

export type PayPalRefund = { id: string; status: string; amount?: { value: string } };

export function refundCapture(captureId: string, cents: number | null, note: string): Promise<PayPalRefund> {
  return paypal<PayPalRefund>(`/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
    method: "POST",
    idempotencyKey: `refund-${captureId}-${cents ?? "full"}`,
    body: {
      ...(cents === null ? {} : { amount: { currency_code: "USD", value: money.toValue(cents) } }),
      note_to_payer: note.slice(0, 255),
    },
  });
}

// ── Payouts (publisher revenue share) ──────────────────────────────────────

export type PayoutItem = { email: string; cents: number; note: string; senderItemId: string };
export type PayoutBatch = { batch_header: { payout_batch_id: string; batch_status: string } };

export function sendPayouts(batchId: string, items: PayoutItem[]): Promise<PayoutBatch> {
  return paypal<PayoutBatch>("/v1/payments/payouts", {
    method: "POST",
    idempotencyKey: batchId,
    body: {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "Your ADGENT publisher earnings",
        email_message: "Revenue share from shoppable ads on your site, paid via PayPal.",
      },
      items: items.map((i) => ({
        recipient_type: "EMAIL",
        receiver: i.email,
        note: i.note,
        sender_item_id: i.senderItemId,
        amount: { currency: "USD", value: money.toValue(i.cents) },
      })),
    },
  });
}

// ── Invoicing (pay-per-sale ad bill; fallback when platform_fees is unavailable) ─

type InvoiceDraft = { id?: string; href?: string; links?: { href: string; rel: string }[] };

export async function sendAdInvoice(args: {
  merchantEmail: string;
  merchantName: string;
  lines: { name: string; cents: number }[];
  memo: string;
  idempotencyKey: string;
}): Promise<{ invoiceId: string }> {
  const draft = await paypal<InvoiceDraft>("/v2/invoicing/invoices", {
    method: "POST",
    idempotencyKey: args.idempotencyKey,
    body: {
      detail: {
        currency_code: "USD",
        note: args.memo.slice(0, 4000),
        terms_and_conditions: "Pay-per-sale advertising. You are billed only for sales that settled on PayPal.",
        payment_term: { term_type: "DUE_ON_RECEIPT" },
      },
      invoicer: { business_name: "ADGENT · PayPal Ads" },
      primary_recipients: [
        { billing_info: { email_address: args.merchantEmail, business_name: args.merchantName } },
      ],
      items: args.lines.map((l) => ({
        name: l.name.slice(0, 200),
        quantity: "1",
        unit_amount: { currency_code: "USD", value: money.toValue(l.cents) },
        unit_of_measure: "AMOUNT",
      })),
    },
  });
  const invoiceId = draft.id ?? draft.href?.split("/").pop() ?? draft.links?.[0]?.href.split("/").pop();
  if (!invoiceId) throw new Error("PayPal did not return an invoice id");
  await paypal(`/v2/invoicing/invoices/${invoiceId}/send`, {
    method: "POST",
    body: { send_to_invoicer: true },
  });
  return { invoiceId };
}

// ── Transaction Search (merchant's settled PayPal history) ────────────────

export type TxSearchResult = {
  transaction_details: {
    transaction_info: {
      transaction_id: string;
      transaction_amount: { value: string };
      transaction_initiation_date: string;
      custom_field?: string;
    };
    payer_info?: { email_address?: string; account_id?: string };
    cart_info?: { item_details?: { item_name?: string; item_code?: string }[] };
  }[];
  total_items?: number;
};

/** Requires the app to have Transaction Search enabled; sandbox data can lag ~3h. */
export function searchTransactions(fromIso: string, toIso: string): Promise<TxSearchResult> {
  const q = new URLSearchParams({
    start_date: fromIso,
    end_date: toIso,
    fields: "transaction_info,payer_info,cart_info",
    page_size: "500",
  });
  return paypal<TxSearchResult>(`/v1/reporting/transactions?${q}`);
}

// ── Webhook signature verification ─────────────────────────────────────────

export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = env().PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const res = await paypal<{ verification_status: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: JSON.parse(rawBody),
    },
  });
  return res.verification_status === "SUCCESS";
}
