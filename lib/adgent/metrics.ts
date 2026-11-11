import { db, schema } from "../db";
import { inHoldout } from "./offers";

export type CampaignMetrics = {
  campaignId: string;
  name: string;
  merchantId: string;
  merchantName: string;
  status: string;
  objective: string;
  audienceKey: string;
  audienceSize: number;
  discountPct: number;
  feeRate: number;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  sales: number;
  revenue: number;
  fees: number;
  roas: number;
  /** Incremental ROAS: revenue that would NOT have happened without the ad, per $ of ad fee */
  iroas: number | null;
  liftPct: number | null;
  exposedRate: number;
  holdoutRate: number;
  /** Budget-guardian recommendation derived from the holdout test */
  advice: string | null;
  bySurface: Record<string, number>;
  forecastSales: number;
};

/**
 * Lift is measured against the holdout: exposed-group conversion vs the conversion
 * the holdout group shows organically over the same flight (from the transaction graph).
 */
export async function campaignMetrics(): Promise<CampaignMetrics[]> {
  const d = db();
  const [camps, evs, merchs, txs] = await Promise.all([
    d.select().from(schema.campaigns),
    d.select().from(schema.events),
    d.select().from(schema.merchants),
    d.select().from(schema.transactions),
  ]);

  return camps.map((c) => {
    const mine = evs.filter((e) => e.campaignId === c.id);
    const caps = mine.filter((e) => e.type === "captured");
    const refunds = mine.filter((e) => e.type === "refunded");
    const revenue = (caps.reduce((a, e) => a + (e.amountCents ?? 0), 0) + refunds.reduce((a, e) => a + (e.amountCents ?? 0), 0)) / 100;
    const fees = (mine.filter((e) => e.type === "fee_collected").reduce((a, e) => a + (e.feeCents ?? 0), 0) + refunds.reduce((a, e) => a + (e.feeCents ?? 0), 0)) / 100;
    // Holdout test on the launch-time audience: conversion = bought from this merchant during the flight.
    const start = c.createdAt.getTime();
    const buyersInFlight = new Set(
      txs.filter((t) => t.merchantId === c.merchantId && t.createdAt.getTime() >= start).map((t) => t.buyerId),
    );
    for (const e of caps) if (e.buyerRef) buyersInFlight.add(e.buyerRef);
    const holdout = c.audienceBuyerIds.filter((b) => inHoldout(c.id, b, c.holdoutPct));
    const exposed = c.audienceBuyerIds.filter((b) => !inHoldout(c.id, b, c.holdoutPct));
    const rate = (xs: string[]) => (xs.length ? xs.filter((b) => buyersInFlight.has(b)).length / xs.length : 0);
    const exposedRate = rate(exposed);
    const holdoutRate = rate(holdout);
    const measurable = holdout.length >= 5 && exposed.length >= 20 && caps.length >= 5;
    const incrementalShare = measurable && exposedRate > 0 ? Math.max(0, 1 - holdoutRate / exposedRate) : null;
    const bySurface: Record<string, number> = {};
    for (const e of caps) bySurface[e.surface ?? "unknown"] = (bySurface[e.surface ?? "unknown"] ?? 0) + (e.amountCents ?? 0) / 100;

    return {
      campaignId: c.id,
      name: c.name,
      merchantId: c.merchantId,
      merchantName: merchs.find((m) => m.id === c.merchantId)?.name ?? c.merchantId,
      status: c.status,
      objective: c.objective,
      audienceKey: c.audienceKey,
      audienceSize: c.audienceSize,
      discountPct: c.discountPct,
      feeRate: c.feeRate,
      budget: c.budgetCents / 100,
      spent: c.spentCents / 100,
      impressions: mine.filter((e) => e.type === "impression").length,
      clicks: mine.filter((e) => e.type === "click").length,
      sales: caps.length - refunds.length,
      revenue: +revenue.toFixed(2),
      fees: +fees.toFixed(2),
      roas: fees > 0 ? +(revenue / fees).toFixed(1) : 0,
      iroas: incrementalShare !== null && fees > 0 ? +((revenue * incrementalShare) / fees).toFixed(1) : null,
      liftPct: incrementalShare !== null && holdoutRate > 0 ? Math.round((exposedRate / holdoutRate - 1) * 100) : null,
      advice: guardianAdvice(incrementalShare, exposedRate, holdoutRate, c.discountPct, c.status),
      exposedRate: +exposedRate.toFixed(3),
      holdoutRate: +holdoutRate.toFixed(3),
      bySurface,
      forecastSales: c.forecast.expectedSales,
    };
  });
}

function guardianAdvice(share: number | null, exposed: number, holdout: number, discountPct: number, status: string): string | null {
  if (share === null) return null;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  if (share < 0.25) {
    return `Mostly non-incremental: ${pct(holdout)} of the holdout bought anyway vs ${pct(exposed)} exposed. ${discountPct > 0 ? `Drop the ${discountPct}% discount or pause` : "Pause"} and move the budget to new-customer audiences.${status === "paused" ? " (paused)" : ""}`;
  }
  if (share > 0.5) return `Strongly incremental: exposed buyers convert ${(exposed / Math.max(holdout, 0.001)).toFixed(1)}× the holdout. Scale the budget.`;
  return `Moderately incremental (${pct(share)} of sales caused by the ad). Keep running, then test a smaller discount.`;
}

/**
 * What PayPal earns from the ad program. Processing is an estimate at the
 * standard US online rate; Pay Later is an estimate of merchant fee uplift.
 */
export async function paypalEconomics() {
  const d = db();
  const [orders, evs, payouts] = await Promise.all([d.select().from(schema.orders), d.select().from(schema.events), d.select().from(schema.payouts)]);
  // A sale counts once PayPal captured it, whether or not its payouts went out yet.
  const captured = orders.filter((o) => o.status === "captured" || o.status === "settled");
  const tpv = captured.reduce((a, o) => a + o.grossCents - o.discountCents, 0) / 100;
  const adFees = captured.reduce((a, o) => a + o.feeCents, 0) / 100;
  const pubShare = captured.reduce((a, o) => a + o.publisherShareCents, 0) / 100;
  const processing = captured.reduce((a, o) => a + ((o.grossCents - o.discountCents) * 0.0349 + 49), 0) / 100;
  const payLaterEligible = captured.filter((o) => o.grossCents - o.discountCents >= 3000).length;
  const histFees = evs.filter((e) => e.type === "fee_collected").reduce((a, e) => a + (e.feeCents ?? 0), 0) / 100;

  return {
    liveSales: captured.length,
    brandedCheckoutTpv: +tpv.toFixed(2),
    adFeeRevenue: +adFees.toFixed(2),
    publisherPayouts: +pubShare.toFixed(2),
    netAdRevenue: +(adFees - pubShare).toFixed(2),
    processingRevenue: +processing.toFixed(2),
    payLaterEligibleSales: payLaterEligible,
    totalPaypalRevenue: +(adFees - pubShare + processing).toFixed(2),
    perAdDollar: adFees > 0 ? +((adFees - pubShare + processing) / adFees).toFixed(2) : 0,
    allTimeAdFees: +histFees.toFixed(2),
    settledSales: orders.filter((o) => o.status === "settled").length,
    awaitingPayout: orders.filter((o) => o.status === "captured").length,
    refundedSales: orders.filter((o) => o.status === "refunded").length,
    merchantPayoutsPaid: +(payouts.filter((p) => p.kind === "merchant").reduce((a, p) => a + p.amountCents, 0) / 100).toFixed(2),
    publisherPayoutsPaid: +(payouts.filter((p) => p.kind === "publisher").reduce((a, p) => a + p.amountCents, 0) / 100).toFixed(2),
  };
}
