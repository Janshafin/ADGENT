/**
 * Day-0 spike: checks every PayPal capability ADGENT relies on, against the sandbox.
 *
 *   npm run spike
 *
 * 1. OAuth with the app credentials
 * 2. Create an order with a discount line, a custom_id and a payee (to the merchant)
 * 3. Same order with platform_fees, to see whether your app has Multiparty enabled
 * 4. Payouts API access
 * 5. Invoicing API access
 * 6. Transaction Search access
 */
import "dotenv/config";
import { createAdOrder, approveLink } from "../lib/paypal/orders";
import { paypal, PayPalError } from "../lib/paypal/client";
import { env } from "../lib/env";

type Result = { step: string; ok: boolean; note: string };
const results: Result[] = [];

async function step(name: string, fn: () => Promise<string>) {
  try {
    results.push({ step: name, ok: true, note: await fn() });
  } catch (err) {
    const note = err instanceof PayPalError ? `${err.status} ${err.issue ?? ""} ${err.message.slice(0, 160)} (debug ${err.debugId})` : String(err);
    results.push({ step: name, ok: false, note });
  }
}

async function main() {
  const e = env();
  const payee = { email: e.DEMO_MERCHANT_PAYPAL_EMAIL || undefined, merchantId: e.DEMO_MERCHANT_PAYPAL_ID || undefined };
  const base = {
    attribution: { campaignId: "c_spike", surface: "agent", publisherId: "pub_agentnet" },
    item: { name: "Spike test espresso", sku: "p_bt_espresso", unitCents: 1899 },
    discountCents: 190,
    payee,
    description: "ADGENT spike",
  };

  await step("oauth", async () => {
    await paypal("/v1/identity/oauth2/userinfo?schema=paypalv1.1").catch((err) => {
      if (err instanceof PayPalError && err.status === 401) throw err;
    });
    return "token issued";
  });

  await step("order (discount + custom_id + payee)", async () => {
    process.env.ADGENT_FEE_MODE = "invoice";
    const o = await createAdOrder({ ...base, platformFeeCents: 0, idempotencyKey: `spike-a-${Date.now()}` });
    return `${o.id} ${o.status} approve: ${approveLink(o)}`;
  });

  await step("order with platform_fees (Multiparty)", async () => {
    const saved = process.env.ADGENT_FEE_MODE;
    process.env.ADGENT_FEE_MODE = "platform_fees";
    // env() is cached, so build the order body by hand for this probe
    const o = await paypal<{ id: string; status: string }>("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: `spike-b-${Date.now()}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: "adg|c_spike|agent|pub_agentnet",
            amount: { currency_code: "USD", value: "17.09" },
            ...(payee.merchantId ? { payee: { merchant_id: payee.merchantId } } : payee.email ? { payee: { email_address: payee.email } } : {}),
            payment_instruction: {
              disbursement_mode: "INSTANT",
              platform_fees: [{ amount: { currency_code: "USD", value: "1.71" } }],
            },
          },
        ],
      },
    });
    process.env.ADGENT_FEE_MODE = saved;
    return `${o.id} ${o.status}. platform_fees accepted at create time; capture one to confirm the split`;
  });

  await step("payouts access", async () => {
    const r = await paypal<{ batch_header: { payout_batch_id: string; batch_status: string } }>("/v1/payments/payouts", {
      method: "POST",
      idempotencyKey: `spike-po-${Date.now()}`,
      body: {
        sender_batch_header: { sender_batch_id: `spike-${Date.now()}`, email_subject: "ADGENT spike" },
        items: [{ recipient_type: "EMAIL", receiver: process.env.DEMO_PUBLISHER_PAYPAL_EMAIL || "sb-publisher@example.com", amount: { currency: "USD", value: "0.50" }, note: "spike" }],
      },
    });
    return `${r.batch_header.payout_batch_id} ${r.batch_header.batch_status}`;
  });

  await step("invoicing access", async () => {
    const r = await paypal<{ total_items?: number }>("/v2/invoicing/invoices?page_size=1&total_required=true");
    return `ok (${r.total_items ?? 0} invoices)`;
  });

  await step("transaction search access", async () => {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86400000);
    const q = new URLSearchParams({ start_date: start.toISOString().replace(/\.\d+Z$/, "Z"), end_date: end.toISOString().replace(/\.\d+Z$/, "Z") });
    const r = await paypal<{ total_items?: number }>(`/v1/reporting/transactions?${q}`);
    return `ok (${r.total_items ?? 0} transactions)`;
  });

  console.log("\nADGENT × PayPal sandbox spike\n");
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.step}\n   ${r.note}\n`);
  const pf = results.find((r) => r.step.includes("platform_fees"));
  console.log(
    pf?.ok
      ? "→ platform_fees works. Set ADGENT_FEE_MODE=platform_fees"
      : "→ platform_fees unavailable. Keep ADGENT_FEE_MODE=invoice (fees are billed through the PayPal Invoicing API)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
