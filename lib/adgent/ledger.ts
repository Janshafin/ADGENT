import { desc, gt, asc } from "drizzle-orm";
import { db, schema } from "../db";
import type { EventType, Surface } from "../db/schema";

export type NewEvent = {
  type: EventType;
  campaignId?: string | null;
  merchantId?: string | null;
  publisherId?: string | null;
  surface?: Surface | null;
  buyerRef?: string | null;
  amountCents?: number | null;
  feeCents?: number | null;
  paypalRef?: string | null;
  detail?: string | null;
};

export async function record(e: NewEvent) {
  await db().insert(schema.events).values({ ts: new Date(), ...e });
}

export type LedgerRow = {
  id: number;
  ts: string;
  type: EventType;
  campaignId: string | null;
  campaignName: string | null;
  merchantName: string | null;
  publisherName: string | null;
  surface: Surface | null;
  buyerRef: string | null;
  amount: number | null;
  fee: number | null;
  paypalRef: string | null;
  detail: string | null;
};

async function lookups() {
  const d = db();
  const [c, m, p] = await Promise.all([
    d.select({ id: schema.campaigns.id, name: schema.campaigns.name }).from(schema.campaigns),
    d.select({ id: schema.merchants.id, name: schema.merchants.name }).from(schema.merchants),
    d.select({ id: schema.publishers.id, name: schema.publishers.name }).from(schema.publishers),
  ]);
  return { c: new Map(c.map((x) => [x.id, x.name])), m: new Map(m.map((x) => [x.id, x.name])), p: new Map(p.map((x) => [x.id, x.name])) };
}

function toRow(e: typeof schema.events.$inferSelect, l: Awaited<ReturnType<typeof lookups>>): LedgerRow {
  return {
    id: e.id,
    ts: e.ts.toISOString(),
    type: e.type,
    campaignId: e.campaignId,
    campaignName: e.campaignId ? l.c.get(e.campaignId) ?? e.campaignId : null,
    merchantName: e.merchantId ? l.m.get(e.merchantId) ?? e.merchantId : null,
    publisherName: e.publisherId ? l.p.get(e.publisherId) ?? e.publisherId : null,
    surface: e.surface,
    buyerRef: e.buyerRef,
    amount: e.amountCents == null ? null : e.amountCents / 100,
    fee: e.feeCents == null ? null : e.feeCents / 100,
    paypalRef: e.paypalRef,
    detail: e.detail,
  };
}

export async function recentLedger(limit = 2000): Promise<LedgerRow[]> {
  const [rows, l] = await Promise.all([
    db().select().from(schema.events).orderBy(desc(schema.events.id)).limit(limit),
    lookups(),
  ]);
  return rows.reverse().map((r) => toRow(r, l));
}

export async function ledgerSince(afterId: number): Promise<LedgerRow[]> {
  const rows = await db().select().from(schema.events).where(gt(schema.events.id, afterId)).orderBy(asc(schema.events.id)).limit(500);
  if (!rows.length) return [];
  const l = await lookups();
  return rows.map((r) => toRow(r, l));
}
