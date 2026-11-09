"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtCents, fmtUsd } from "@/lib/client/api";
import type { CampaignProposal } from "@/lib/ai/campaigns";
import type { MerchantInsights } from "@/lib/graph/audiences";
import type { CampaignMetrics } from "@/lib/adgent/metrics";

type MerchantRow = { id: string; name: string; emoji: string; category: string; products: { id: string; title: string; priceCents: number; image: string }[] };
type Insights = Omit<MerchantInsights, "audiences"> & { audiences: Omit<MerchantInsights["audiences"][number], "buyerIds">[] };

const OBJECTIVE_LABEL: Record<string, string> = { winback: "Win-back", cross_sell: "Cross-sell", replenish: "Replenish", acquire: "New customers" };

export default function MerchantPage() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [merchantId, setMerchantId] = useState("m_beanthere");
  const [insights, setInsights] = useState<Insights | null>(null);
  const [proposals, setProposals] = useState<CampaignProposal[] | null>(null);
  const [source, setSource] = useState<string>("");
  const [thinking, setThinking] = useState(false);
  const [launched, setLaunched] = useState<Record<number, string>>({});
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [error, setError] = useState<string | null>(null);

  const merchant = merchants.find((m) => m.id === merchantId);

  const refreshCampaigns = useCallback(() => {
    api<CampaignMetrics[]>("/api/campaigns").then(setCampaigns).catch(() => {});
  }, []);

  useEffect(() => {
    api<MerchantRow[]>("/api/merchants").then(setMerchants).catch((e) => setError(String(e.message)));
    refreshCampaigns();
  }, [refreshCampaigns]);

  function selectMerchant(id: string) {
    setMerchantId(id);
    setInsights(null);
    setProposals(null);
    setLaunched({});
  }

  useEffect(() => {
    api<Insights>(`/api/merchants/${merchantId}/insights`).then(setInsights).catch((e) => setError(String(e.message)));
  }, [merchantId]);

  async function generate() {
    setThinking(true);
    setError(null);
    try {
      const r = await api<{ proposals: CampaignProposal[]; source: string }>("/api/campaigns/propose", { json: { merchantId } });
      setProposals(r.proposals);
      setSource(r.source);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function launch(i: number, p: CampaignProposal) {
    try {
      const r = await api<{ id: string }>("/api/campaigns", { json: { merchantId, proposal: p } });
      setLaunched((s) => ({ ...s, [i]: r.id }));
      refreshCampaigns();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const mine = campaigns.filter((c) => c.merchantId === merchantId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Merchant Copilot</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {merchant ? `${merchant.emoji} ${merchant.name}` : "Loading…"}
          </h1>
        </div>
        <select
          value={merchantId}
          onChange={(e) => selectMerchant(e.target.value)}
          className="rounded-full border border-line bg-panel px-4 py-2 text-sm"
          aria-label="Choose merchant"
        >
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.emoji} {m.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>}

      {/* KPIs from PayPal sales */}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["PayPal customers", insights?.customers.toLocaleString()],
          ["Orders (6 mo)", insights?.orders.toLocaleString()],
          ["Revenue", insights ? fmtCents(insights.revenueCents, 0) : undefined],
          ["Repeat rate", insights ? `${Math.round(insights.repeatRate * 100)}%` : undefined],
          ["Reorder cycle", insights ? (insights.avgCycleDays ? `${insights.avgCycleDays} days` : "one-off") : undefined],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="text-xs text-muted">{k}</div>
            {v === undefined ? <div className="skeleton mt-2 h-7 w-20" /> : <div className="stat-num mt-1 text-2xl font-semibold">{v}</div>}
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Audiences */}
        <div className="card p-5">
          <h2 className="font-semibold">Audiences found in your PayPal data</h2>
          <p className="mt-1 text-sm text-muted">Built from the PayPal transaction graph across merchants.</p>
          <ul className="mt-4 space-y-3">
            {insights?.audiences.map((a) => (
              <li key={a.key} className="rounded-xl border border-line bg-panel-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{a.label}</span>
                  <span className="stat-num text-lg font-semibold text-pp-sky">{a.size}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
                <div className="mt-2 flex gap-2 text-xs text-muted">
                  <span className="pill">avg LTV {fmtCents(a.avgLtvCents)}</span>
                  <span className="pill">baseline {(a.baselineConversion * 100).toFixed(1)}% / 30d</span>
                </div>
              </li>
            )) ?? Array.from({ length: 3 }, (_, i) => <li key={i} className="skeleton h-24" />)}
          </ul>
          {insights && insights.affinities[0] && (
            <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4 text-sm">
              <span className="font-semibold text-gold">Graph insight:</span>{" "}
              {Math.round(insights.affinities[0].overlapPct * 100)}% of your buyers also shop at {insights.affinities[0].merchantName}.
            </div>
          )}
        </div>

        {/* AI proposals */}
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">AI campaign builder</h2>
              <p className="mt-1 text-sm text-muted">Claude proposes the campaigns. The forecasts come from your data.</p>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={thinking || !insights}>
              {thinking ? "Analyzing sales…" : proposals ? "Regenerate" : "✨ Build my campaigns"}
            </button>
          </div>

          {thinking && (
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-36" />)}
            </div>
          )}

          {!thinking && proposals && (
            <div className="mt-5 space-y-4">
              {source === "heuristic" && (
                <p className="text-xs text-warn">Heuristic mode: set ANTHROPIC_API_KEY to get Claude&apos;s campaign strategy.</p>
              )}
              {proposals.map((p, i) => (
                <article key={i} className="rounded-xl border border-line bg-panel-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <span className="pill">{OBJECTIVE_LABEL[p.objective]}</span>
                        <span className="pill">{p.audienceSize} buyers</span>
                        {p.discountPct > 0 && <span className="pill">{p.discountPct}% off</span>}
                        {p.payLater && <span className="pill text-gold">Pay in 4</span>}
                      </div>
                      <h3 className="mt-2 text-lg font-semibold">{p.headline}</h3>
                      <p className="text-sm text-muted">{p.body}</p>
                    </div>
                    {launched[i] ? (
                      <Link href="/control" className="btn btn-ghost text-good">✓ Live, view in Mission Control</Link>
                    ) : (
                      <button className="btn btn-gold" onClick={() => launch(i, p)}>Launch</button>
                    )}
                  </div>
                  <p className="mt-3 text-sm"><span className="text-muted">Why:</span> {p.rationale}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Metric k="Forecast sales" v={p.forecast.expectedSales.toString()} />
                    <Metric k="Revenue" v={fmtCents(p.forecast.expectedRevenueCents, 0)} />
                    <Metric k="Ad cost (pay-per-sale)" v={`${fmtCents(p.forecast.expectedAdCostCents, 0)} · ${(p.feeRate * 100).toFixed(0)}%`} />
                    <Metric k="ROAS" v={`${p.forecast.expectedRoas}×`} />
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-muted">What AI shopping agents will read</summary>
                    <p className="mt-2 rounded-lg bg-bg p-3 font-mono text-xs">[SPONSORED] {p.agentBlurb}</p>
                  </details>
                </article>
              ))}
            </div>
          )}

          {!thinking && !proposals && (
            <div className="mt-6 rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">
              One click: Claude reviews your audiences, products and cross-merchant affinity, then drafts campaigns you only pay for when they sell.
            </div>
          )}
        </div>
      </section>

      {mine.length > 0 && (
        <section className="card mt-6 p-5">
          <h2 className="font-semibold">Your campaigns</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-2 pr-4 font-normal">Campaign</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  <th className="py-2 pr-4 font-normal">Sales</th>
                  <th className="py-2 pr-4 font-normal">Revenue</th>
                  <th className="py-2 pr-4 font-normal">Ad fees</th>
                  <th className="py-2 pr-4 font-normal">iROAS</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((c) => (
                  <tr key={c.campaignId} className="border-t border-line">
                    <td className="py-2 pr-4">{c.name}</td>
                    <td className="py-2 pr-4"><span className={c.status === "active" ? "text-good" : "text-muted"}>{c.status}</span></td>
                    <td className="stat-num py-2 pr-4">{c.sales}</td>
                    <td className="stat-num py-2 pr-4">{fmtUsd(c.revenue)}</td>
                    <td className="stat-num py-2 pr-4">{fmtUsd(c.fees)}</td>
                    <td className="stat-num py-2 pr-4">{c.iroas === null ? "measuring…" : `${c.iroas}×`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <div className="text-xs text-muted">{k}</div>
      <div className="stat-num font-semibold">{v}</div>
    </div>
  );
}
