import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { PayPalError, type RequestOpts } from "./errors";

/**
 * Built-in PayPal simulator. It answers the same REST calls ADGENT makes (Orders, Captures,
 * Refunds, Payouts, Invoicing) so the whole product works before sandbox keys exist.
 * It only runs when PAYPAL_CLIENT_ID/SECRET are unset, and every screen labels it "simulated".
 * State lives in the database, so it survives restarts and works across instances.
 */

type SimOrder = {
  id: string;
  status: "CREATED" | "APPROVED" | "COMPLETED";
  intent: string;
  purchase_units: Record<string, unknown>[];
  payer?: { email_address: string; payer_id: string; name: { given_name: string; surname: string } };
  links: { href: string; rel: string; method?: string }[];
};

const ALNUM = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
function simId(prefix: string, len = 17) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return prefix + Array.from(bytes, (b) => ALNUM[b % ALNUM.length]).join("").slice(prefix.length);
}

async function load<T>(id: string): Promise<T | undefined> {
  const [row] = await db().select().from(schema.simObjects).where(eq(schema.simObjects.id, id));
  return row?.data as T | undefined;
}

async function save(id: string, kind: string, data: object) {
  await db()
    .insert(schema.simObjects)
    .values({ id, kind, data: data as Record<string, unknown>, createdAt: new Date() })
    .onConflictDoUpdate({ target: schema.simObjects.id, set: { data: data as Record<string, unknown> } });
}

function notFound(path: string): never {
  throw new PayPalError(`PayPal (simulated) ${path} → 404 RESOURCE_NOT_FOUND`, 404, "sim", { name: "RESOURCE_NOT_FOUND", details: [{ issue: "INVALID_RESOURCE_ID" }] });
}

function unprocessable(issue: string, description: string): never {
  throw new PayPalError(`PayPal (simulated) → 422 UNPROCESSABLE_ENTITY: ${description}`, 422, "sim", { name: "UNPROCESSABLE_ENTITY", details: [{ issue, description }] });
}

/** Same request-id semantics as PayPal: a retried POST returns the first response. */
async function idempotent<T>(key: string | undefined, run: () => Promise<T>): Promise<T> {
  if (!key) return run();
  const seen = await load<{ response: T }>(`idem:${key}`);
  if (seen) return seen.response;
  const response = await run();
  await save(`idem:${key}`, "idempotency", { response: response as object });
  return response;
}

export async function simulate<T>(path: string, opts: RequestOpts): Promise<T> {
  const method = opts.method ?? "GET";
  const url = new URL(path, "https://sim.paypal.local");
  const p = url.pathname;
  const body = (opts.body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  if (method === "POST" && p === "/v2/checkout/orders") {
    return idempotent(opts.idempotencyKey, async () => {
      const id = simId("SIM");
      const order: SimOrder = {
        id,
        status: "CREATED",
        intent: String(body.intent ?? "CAPTURE"),
        purchase_units: (body.purchase_units as Record<string, unknown>[]) ?? [],
        links: [
          { href: `${env().APP_URL}/shop/simulate?token=${id}`, rel: "payer-action", method: "GET" },
          { href: `/v2/checkout/orders/${id}`, rel: "self", method: "GET" },
        ],
      };
      await save(id, "order", order);
      return order as T;
    });
  }

  if ((m = p.match(/^\/v2\/checkout\/orders\/([^/]+)$/)) && method === "GET") {
    return ((await load<SimOrder>(decodeURIComponent(m[1]))) ?? notFound(p)) as T;
  }

  if ((m = p.match(/^\/v2\/checkout\/orders\/([^/]+)\/capture$/)) && method === "POST") {
    return idempotent(opts.idempotencyKey, async () => {
      const order = (await load<SimOrder>(decodeURIComponent(m![1]))) ?? notFound(p);
      if (order.status === "COMPLETED") unprocessable("ORDER_ALREADY_CAPTURED", "Order already captured.");
      if (order.status !== "APPROVED") unprocessable("ORDER_NOT_APPROVED", "Payer has not yet approved the Order for payment.");
      const amount = (order.purchase_units[0]?.amount ?? { value: "0.00", currency_code: "USD" }) as { value: string; currency_code: string };
      order.status = "COMPLETED";
      order.purchase_units = order.purchase_units.map((pu, i) =>
        i === 0
          ? { ...pu, payments: { captures: [{ id: simId("SIMCAP"), status: "COMPLETED", amount: { value: amount.value, currency_code: amount.currency_code } }] } }
          : pu,
      );
      await save(order.id, "order", order);
      return order as T;
    });
  }

  if ((m = p.match(/^\/v2\/payments\/captures\/([^/]+)\/refund$/)) && method === "POST") {
    return idempotent(opts.idempotencyKey, async () => ({ id: simId("SIMREF"), status: "COMPLETED", amount: body.amount }) as T);
  }

  if (method === "POST" && p === "/v1/payments/payouts") {
    return idempotent(opts.idempotencyKey, async () => {
      const header = body.sender_batch_header as { sender_batch_id?: string } | undefined;
      if (!header?.sender_batch_id) unprocessable("SENDER_BATCH_ID_REQUIRED", "sender_batch_id is required");
      const batch = { batch_header: { payout_batch_id: simId("SIMPO", 13), batch_status: "SUCCESS", sender_batch_header: header } };
      await save(batch.batch_header.payout_batch_id, "payout", { ...batch, items: body.items });
      return batch as T;
    });
  }

  if (method === "POST" && p === "/v2/invoicing/invoices") {
    return idempotent(opts.idempotencyKey, async () => {
      const id = simId("INV2-SIM-", 24);
      await save(id, "invoice", { id, status: "DRAFT", ...body });
      return { id, status: "DRAFT" } as T;
    });
  }
  if ((m = p.match(/^\/v2\/invoicing\/invoices\/([^/]+)\/send$/)) && method === "POST") {
    const inv = (await load<Record<string, unknown>>(m[1])) ?? notFound(p);
    await save(m[1], "invoice", { ...inv, status: "SENT" });
    return {} as T;
  }

  if (method === "GET" && p === "/v1/reporting/transactions") {
    return { transaction_details: [], total_items: 0 } as T;
  }

  if (method === "POST" && p === "/v1/notifications/verify-webhook-signature") {
    // Nobody can send the simulator a genuine PayPal webhook.
    return { verification_status: "FAILURE" } as T;
  }

  throw new PayPalError(`PayPal simulator does not implement ${method} ${p}`, 501, "sim", null);
}

/** Stand-in for the buyer approving on paypal.com. */
export async function simApprove(orderId: string, payer?: { email?: string; name?: string }) {
  const order = await load<SimOrder>(orderId);
  if (!order) notFound(`/v2/checkout/orders/${orderId}`);
  if (order.status === "COMPLETED") return order;
  const [given = "Sandbox", surname = "Buyer"] = (payer?.name ?? "").split(" ").filter(Boolean);
  order.status = "APPROVED";
  order.payer = {
    email_address: payer?.email ?? "buyer@simulated.paypal",
    payer_id: simId("PAYER", 13),
    name: { given_name: given, surname },
  };
  await save(order.id, "order", order);
  return order;
}

export async function simOrder(orderId: string) {
  return load<SimOrder>(orderId);
}
