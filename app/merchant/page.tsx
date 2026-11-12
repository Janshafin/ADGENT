"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtCents, fmtUsd } from "@/lib/client/api";
import type { CampaignProposal } from "@/lib/ai/campaigns";
import type { MerchantInsights } from "@/lib/graph/audiences";
import type { CampaignMetrics } from "@/lib/adgent/metrics";
import { CountUp } from "@/components/CountUp";
import { Tilt } from "@/components/Tilt";

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
  const [launching, setLaunching] = useState<number | null>(null);
  // State updates land after the click handler returns, so two clicks in one frame need a ref to see each other.
  const launchLock = useRef(false);
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
    setError(null);
    setInsights(null);
    setProposals(null);
    setLaunched({});
  }

  useEffect(() => {
    api<Insights>(`/api/merchants/${merchantId}/insights`).then(setInsights).catch((e) => setError(String(e.message)));
  }, [merchantId]);

  async function generate() {
    setThinking(true);
    setLaunched({});
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
    // One launch at a time: a double click must not create the campaign twice.
    if (launchLock.current || launched[i]) return;
    launchLock.current = true;
    setLaunching(i);
    setError(null);
    try {
      const r = await api<{ id: string }>("/api/campaigns", { json: { merchantId, proposal: p } });
      setLaunched((s) => ({ ...s, [i]: r.id }));
      refreshCampaigns();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      launchLock.current = false;
      setLaunching(null);
    }
  }

  const mine = campaigns.filter((c) => c.merchantId === merchantId);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl sm:text-5xl">Merchant Copilot</h1>
          <p className="mt-2 text-lg text-muted">{merchant ? `Campaigns for ${merchant.name}, built from its PayPal sales.` : "Loading your PayPal sales…"}</p>
        </div>
        <select
          value={merchantId}
          onChange={(e) => selectMerchant(e.target.value)}
          className="select"
          aria-label="Choose merchant"
        >
          {merchants.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      {error && <div role="alert" className="bubble-in mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">{error}</div>}

      {/* KPIs from PayPal sales */}
      <section className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
        {(
          [
            ["PayPal customers", insights?.customers, undefined],
            ["Orders (6 mo)", insights?.orders, undefined],
            ["Revenue", insights?.revenueCents, (n: number) => fmtCents(n, 0)],
            ["Repeat rate", insights ? insights.repeatRate * 100 : undefined, (n: number) => `${Math.round(n)}%`],
            ["Reorder cycle", insights ? insights.avgCycleDays ?? 0 : undefined, (n: number) => (insights?.avgCycleDays ? `${Math.round(n)} days` : "one-off")],
          ] as const
        ).map(([k, v, format], i) => (
          <Tilt key={k} max={8} className="card stagger p-5" style={{ "--i": i } as React.CSSProperties}>
            <div className="text-sm text-muted">{k}</div>
            {v === undefined ? <div className="skeleton mt-2 h-8 w-20" /> : <div className="stat-num display z-lift-2 mt-2 text-3xl"><CountUp key={merchantId} value={v} format={format} /></div>}
          </Tilt>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        {/* Audiences */}
        <div className="card p-6">
          <h2 className="text-xl font-semibold tracking-tight">Who to reach</h2>
          <p className="mt-1 text-sm text-muted">Built from the PayPal transaction graph across merchants (simulated history in this demo).</p>
          <ul className="mt-4 space-y-3">
            {insights?.audiences.map((a, i) => (
              <li key={a.key} className="tile stagger p-4" style={{ "--i": i } as React.CSSProperties}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{a.label}</span>
                  <span className="stat-num text-lg font-semibold text-pp-sky">{a.size}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{a.description}</p>
                <p className="meta mt-2">
                  Average lifetime value {fmtCents(a.avgLtvCents)}. {(a.baselineConversion * 100).toFixed(1)}% buy within 30 days without an ad.
                </p>
              </li>
            )) ?? Array.from({ length: 3 }, (_, i) => <li key={i} className="skeleton h-24 !rounded-[20px]" />)}
          </ul>
          {insights && insights.affinities[0] && (
            <p className="tile bubble-in mt-4 p-4 text-sm">
              {Math.round(insights.affinities[0].overlapPct * 100)}% of your buyers also shop at {insights.affinities[0].merchantName}, so its
              customers are a natural next audience.
            </p>
          )}
        </div>

        {/* AI proposals */}
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">AI campaign builder</h2>
              <p className="mt-1 text-sm text-muted">AI proposes the campaigns. The forecasts come from your data.</p>
            </div>
            <button className="btn btn-primary" onClick={generate} disabled={thinking || !insights}>
              {thinking ? "Analyzing sales…" : proposals ? "Regenerate" : "Build my campaigns"}
            </button>
          </div>

          {thinking && (
            <div className="mt-5 space-y-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 !rounded-[20px]" />)}
            </div>
          )}

          {!thinking && proposals && (
            <div className="mt-5 space-y-4">
              <p className={`text-xs ${source === "claude" ? "text-muted" : "text-warn"}`}>
                {source === "claude"
                  ? "Strategy by the AI model. Forecasts are computed from your data, so the model can't inflate them."
                  : "Offline mode: rule-based proposals (no AI model key on this deployment). Forecasts are still computed from your data."}
              </p>
              {proposals.map((p, i) => (
                <article key={i} className="tile stagger p-5" style={{ "--i": i } as React.CSSProperties}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="meta">
                        {[OBJECTIVE_LABEL[p.objective], `${p.audienceSize} buyers`, p.discountPct > 0 ? `${p.discountPct}% off` : "no discount", p.payLater ? "Pay in 4" : null]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold">{p.headline}</h3>
                      <p className="text-sm text-muted">{p.body}</p>
                    </div>
                    {launched[i] ? (
                      <Link href="/control" className="bubble-in link link-more text-sm">
                        <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-good align-middle" aria-hidden />
                        Live. View in Mission Control
                      </Link>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => launch(i, p)} disabled={launching !== null} aria-busy={launching === i}>
                        {launching === i ? "Launching…" : "Launch"}
                      </button>
                    )}
                  </div>
                  <p className="mt-3 text-sm"><span className="text-muted">Why:</span> {p.rationale}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <Metric k="Forecast sales" v={p.forecast.expectedSales.toString()} />
                    <Metric k="Revenue" v={fmtCents(p.forecast.expectedRevenueCents, 0)} />
                    <Metric k={`Ad cost at ${(p.feeRate * 100).toFixed(0)}% per sale`} v={fmtCents(p.forecast.expectedAdCostCents, 0)} />
                    <Metric k="ROAS" v={`${p.forecast.expectedRoas}×`} />
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="text-muted">What AI shopping agents will read</summary>
                    <p className="mt-2 rounded-xl bg-panel p-3 font-mono text-xs">[SPONSORED] {p.agentBlurb}</p>
                  </details>
                </article>
              ))}
            </div>
          )}

          {!thinking && !proposals && (
            <div className="tile mt-6 p-8 text-center text-sm text-muted">
              One click: the AI reviews your audiences, products and cross-merchant affinity, then drafts campaigns you only pay for when they sell.
            </div>
          )}
        </div>
      </section>

      {mine.length > 0 && (
        <section className="card mt-6 p-6">
          <h2 className="text-xl font-semibold tracking-tight">Your campaigns</h2>
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
                    <td className="py-2 pr-4"><span className={c.status === "active" ? "text-good" : "text-muted"}>{c.status === "active" ? "Active" : "Paused"}</span></td>
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
    <div className="rounded-xl bg-panel px-3 py-2">
      <div className="text-xs text-muted">{k}</div>
      <div className="stat-num font-semibold">{v}</div>
    </div>
  );
}
