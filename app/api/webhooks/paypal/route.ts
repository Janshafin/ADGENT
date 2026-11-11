import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { verifyWebhook } from "@/lib/paypal/money-movement";
import { capturedIdFromRefund, type WebhookEvent } from "@/lib/paypal/webhooks";
import { getOrder } from "@/lib/paypal/orders";
import { settleCaptured, applyRefund } from "@/lib/adgent/checkout";
import { env, paypalConfigured } from "@/lib/env";

/**
 * PayPal webhooks keep the ledger correct even if the buyer closes the tab before our
 * capture callback returns. Fails closed: no verified signature, no processing.
 * Each event id is applied once, because PayPal retries deliveries.
 */
export async function POST(req: Request) {
  if (!paypalConfigured()) return Response.json({ error: "Webhooks need PayPal sandbox credentials" }, { status: 404 });
  if (!env().PAYPAL_WEBHOOK_ID) return Response.json({ error: "PAYPAL_WEBHOOK_ID is not set, so signatures can't be verified" }, { status: 503 });

  const raw = await req.text();
  let evt: WebhookEvent;
  try {
    evt = JSON.parse(raw) as WebhookEvent;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const ok = await verifyWebhook(req.headers, evt).catch(() => false);
  if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });
  if (!evt.id || !evt.event_type) return Response.json({ error: "Missing event id" }, { status: 400 });

  const d = db();
  const fresh = await d
    .insert(schema.webhookEvents)
    .values({ id: evt.id, type: evt.event_type, receivedAt: new Date() })
    .onConflictDoNothing()
    .returning();
  if (!fresh.length) return Response.json({ received: true, duplicate: true });

  try {
    switch (evt.event_type) {
      case "PAYMENT.CAPTURE.COMPLETED": {
        const orderId = evt.resource.supplementary_data?.related_ids?.order_id;
        if (orderId) await settleCaptured(await getOrder(orderId));
        break;
      }
      case "PAYMENT.CAPTURE.REFUNDED":
      case "PAYMENT.CAPTURE.REVERSED": {
        const captureId = capturedIdFromRefund(evt.resource);
        if (captureId) await applyRefund(captureId, evt.resource.id ?? null, `Webhook ${evt.event_type}`);
        break;
      }
      case "PAYMENT.PAYOUTSBATCH.SUCCESS":
      case "PAYMENT.PAYOUTSBATCH.DENIED":
      case "PAYMENT.PAYOUTSBATCH.PROCESSING": {
        const batchId = evt.resource.batch_header?.payout_batch_id;
        const status = evt.resource.batch_header?.batch_status ?? evt.event_type.split(".").pop()!;
        if (batchId) await d.update(schema.payouts).set({ status }).where(eq(schema.payouts.batchId, batchId));
        break;
      }
    }
  } catch (err) {
    console.error("[adgent] webhook", evt.event_type, err);
    // Forget the event so PayPal's retry gets processed.
    await d.delete(schema.webhookEvents).where(eq(schema.webhookEvents.id, evt.id));
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
  return Response.json({ received: true });
}
