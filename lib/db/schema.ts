import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/** All money is stored as integer cents (USD). */

/**
 * How ADGENT gets paid:
 *  payouts       → ADGENT is the payee; after the refund hold, PayPal Payouts sends the merchant its net and the publisher its share
 *  platform_fees → merchant is the payee; PayPal splits the ad fee out at capture (needs a PayPal-enabled partner app)
 *  invoice       → merchant is the payee; ad fees are billed afterwards with the PayPal Invoicing API
 */
export const FEE_MODES = ["payouts", "platform_fees", "invoice"] as const;
export type FeeMode = (typeof FEE_MODES)[number];
export const ORDER_STATUSES = ["created", "captured", "settled", "refunded", "failed"] as const;

export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  emoji: text("emoji").notNull().default("🛍️"),
  paypalEmail: text("paypal_email"),
  paypalMerchantId: text("paypal_merchant_id"),
  /** 0..1 trust score derived from dispute + refund history. */
  trustScore: real("trust_score").notNull().default(0.9),
});

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    title: text("title").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    image: text("image").notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
  },
  (t) => [index("products_merchant_idx").on(t.merchantId)],
);

export const buyers = sqliteTable("buyers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  city: text("city").notNull(),
});

/** Transaction graph: every purchase across every merchant. */
export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    buyerId: text("buyer_id").notNull().references(() => buyers.id),
    productId: text("product_id").notNull().references(() => products.id),
    amountCents: integer("amount_cents").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    /** seed = synthetic history, paypal = settled sandbox capture */
    source: text("source", { enum: ["seed", "paypal"] }).notNull(),
    paypalCaptureId: text("paypal_capture_id"),
    campaignId: text("campaign_id"),
  },
  (t) => [
    index("tx_merchant_idx").on(t.merchantId),
    index("tx_buyer_idx").on(t.buyerId),
  ],
);

export const publishers = sqliteTable("publishers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  site: text("site").notNull(),
  paypalEmail: text("paypal_email").notNull(),
  /** Share of the ad fee paid to the publisher, 0..1 */
  revShare: real("rev_share").notNull().default(0.5),
});

export type AudienceKey = "lapsed" | "high_ltv" | "replenish_due" | "affinity" | "lookalike";

export type CampaignForecast = {
  reach: number;
  expectedSales: number;
  expectedRevenueCents: number;
  expectedAdCostCents: number;
  expectedRoas: number;
};

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    name: text("name").notNull(),
    objective: text("objective", {
      enum: ["winback", "cross_sell", "replenish", "acquire"],
    }).notNull(),
    audienceKey: text("audience_key").$type<AudienceKey>().notNull(),
    audienceSize: integer("audience_size").notNull(),
    /** Audience snapshot at launch; split into exposed vs holdout by a stable hash */
    audienceBuyerIds: text("audience_buyer_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    productIds: text("product_ids", { mode: "json" }).$type<string[]>().notNull(),
    discountPct: integer("discount_pct").notNull().default(0),
    payLater: integer("pay_later", { mode: "boolean" }).notNull().default(true),
    /** Ad fee as a fraction of the sale, charged only when a sale settles. */
    feeRate: real("fee_rate").notNull(),
    budgetCents: integer("budget_cents").notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    holdoutPct: integer("holdout_pct").notNull().default(10),
    headline: text("headline").notNull(),
    body: text("body").notNull(),
    /** Plain-language card that AI shopping agents read. */
    agentBlurb: text("agent_blurb").notNull(),
    rationale: text("rationale").notNull(),
    forecast: text("forecast", { mode: "json" }).$type<CampaignForecast>().notNull(),
    status: text("status", { enum: ["draft", "active", "paused"] }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("campaign_merchant_idx").on(t.merchantId)],
);

export type Surface = "agent" | "widget" | "winback";

export const orders = sqliteTable(
  "orders",
  {
    /** PayPal order id */
    id: text("id").primaryKey(),
    campaignId: text("campaign_id").references(() => campaigns.id),
    merchantId: text("merchant_id").notNull().references(() => merchants.id),
    productId: text("product_id").notNull().references(() => products.id),
    publisherId: text("publisher_id").references(() => publishers.id),
    surface: text("surface").$type<Surface>().notNull(),
    buyerRef: text("buyer_ref"),
    grossCents: integer("gross_cents").notNull(),
    discountCents: integer("discount_cents").notNull(),
    feeCents: integer("fee_cents").notNull(),
    publisherShareCents: integer("publisher_share_cents").notNull(),
    /** Merchant's share of the sale after the ad fee (paid out by ADGENT in "payouts" mode). */
    merchantNetCents: integer("merchant_net_cents").notNull().default(0),
    feeMode: text("fee_mode", { enum: FEE_MODES }).notNull(),
    /** created → captured → settled (payouts sent) | refunded | failed */
    status: text("status", { enum: ORDER_STATUSES }).notNull(),
    captureId: text("capture_id"),
    payerEmail: text("payer_email"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }),
    /** PayPal Payouts batch that settled this order (merchant net and/or publisher share) */
    payoutId: text("payout_id"),
    settledAt: integer("settled_at", { mode: "timestamp_ms" }),
    refundId: text("refund_id"),
    /** Set once the ad fee was billed on a PayPal invoice (invoice fee mode) */
    invoiceId: text("invoice_id"),
  },
  (t) => [index("orders_campaign_idx").on(t.campaignId), index("orders_status_idx").on(t.status), index("orders_capture_idx").on(t.captureId)],
);

/** One row per recipient in a PayPal Payouts batch. */
export const payouts = sqliteTable("payouts", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["merchant", "publisher"] }).notNull().default("publisher"),
  publisherId: text("publisher_id").references(() => publishers.id),
  merchantId: text("merchant_id").references(() => merchants.id),
  receiver: text("receiver").notNull().default(""),
  batchId: text("batch_id"),
  amountCents: integer("amount_cents").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const adInvoices = sqliteTable("ad_invoices", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull().references(() => merchants.id),
  paypalInvoiceId: text("paypal_invoice_id"),
  amountCents: integer("amount_cents").notNull(),
  orderIds: text("order_ids", { mode: "json" }).$type<string[]>().notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type EventType =
  | "campaign_launched"
  | "campaign_paused"
  | "impression"
  | "click"
  | "order_created"
  | "captured"
  | "fee_collected"
  | "payout_sent"
  | "refunded"
  | "invoice_sent"
  | "guardian";

/** Append-only attribution ledger. Everything the Mission Control grid shows. */
export const events = sqliteTable(
  "events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp_ms" }).notNull(),
    type: text("type").$type<EventType>().notNull(),
    campaignId: text("campaign_id"),
    merchantId: text("merchant_id"),
    publisherId: text("publisher_id"),
    surface: text("surface").$type<Surface>(),
    buyerRef: text("buyer_ref"),
    amountCents: integer("amount_cents"),
    feeCents: integer("fee_cents"),
    paypalRef: text("paypal_ref"),
    detail: text("detail"),
  },
  (t) => [index("events_ts_idx").on(t.ts), index("events_campaign_idx").on(t.campaignId)],
);

/** PayPal webhook ids we already processed: PayPal retries, so every delivery must be applied once. */
export const webhookEvents = sqliteTable("webhook_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),
});

/** State of the built-in PayPal simulator, used only when no sandbox credentials are configured. */
export const simObjects = sqliteTable("sim_objects", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type Merchant = typeof merchants.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type LedgerEvent = typeof events.$inferSelect;
export type Publisher = typeof publishers.$inferSelect;
