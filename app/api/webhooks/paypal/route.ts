import { verifyWebhook } from "@/lib/paypal/money-movement";
import { getOrder } from "@/lib/paypal/orders";
import { settleCaptured } from "@/lib/adgent/checkout";
import { record } from "@/lib/adgent/ledger";
import { env } from "@/lib/env";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource: { id?: string; supplementary_data?: { related_ids?: { order_id?: string } } };
};

/**
 * PayPal webhooks keep the ledger correct even if the buyer closes the tab
 * before our capture callback returns. Signature is verified with PayPal.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (env().PAYPAL_WEBHOOK_ID) {
    const ok = await verifyWebhook(req.headers, raw).catch(() => false);
    if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });
  }
  const evt = JSON.parse(raw) as WebhookEvent;

  try {
    switch (evt.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const orderId = evt.resource.supplementary_data?.related_ids?.order_id;
        if (orderId) await settleCaptured(await getOrder(orderId));
        break;
      }
      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.REVERSED":
        await record({ type: "refunded", paypalRef: evt.resource.id ?? null, detail: `Webhook ${evt.event_type}` });
        break;
      case "PAYMENT.PAYOUTSBATCH.SUCCESS":
        await record({ type: "payout_sent", paypalRef: evt.resource.id ?? null, detail: "Payout batch SUCCESS (webhook)" });
        break;
    }
  } catch (err) {
    console.error("[adgent] webhook", evt.event_type, err);
    return Response.json({ error: "processing failed" }, { status: 500 }); // PayPal retries
  }
  return Response.json({ received: true });
}
