"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { api, fmtUsd } from "@/lib/client/api";
import type { PublisherSummary } from "@/app/api/publishers/route";
import { CountUp } from "@/components/CountUp";
import { Tilt } from "@/components/Tilt";

const noop = () => () => {};

export default function PublisherPage() {
  const [pubs, setPubs] = useState<PublisherSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("pub_dailygrind");
  const [query, setQuery] = useState("espresso coffee beans");
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "https://your-adgent-host");

  useEffect(() => {
    const load = () => api<PublisherSummary[]>("/api/publishers").then(setPubs).catch((e) => setError((e as Error).message));
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  const pub = pubs?.find((p) => p.id === selected);
  const snippet = `<div data-adgent-slot data-query="${query.replace(/"/g, "&quot;")}" data-limit="2"></div>\n<script src="${origin}/widget.js" data-pub="${selected}" async></script>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy. Select the code and copy it by hand.");
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl sm:text-5xl">Earn when your readers buy.</h1>
          <p className="mt-2 max-w-2xl text-muted">
            Add shoppable, clearly labelled ads with one script tag. You get a share of the ad fee on every sale, paid with PayPal Payouts
            once the refund hold passes.
          </p>
        </div>
        <label className="text-sm">
          <span className="meta mb-1 block">Publisher</span>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="select" disabled={!pubs}>
            {(pubs ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="bubble-in mt-4 rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Earnings">
        {(
          [
            ["Ad impressions", pub?.impressions, undefined],
            ["Sales from your slots", pub?.sales, undefined],
            ["Revenue you drove", pub?.revenueDriven, fmtUsd],
            ["You earned", pub?.earned, fmtUsd],
            ["Waiting for payout", pub?.pending, fmtUsd],
          ] as const
        ).map(([k, v, format], i) => (
          <Tilt key={k} max={8} className="card stagger p-5" style={{ "--i": i } as React.CSSProperties}>
            <div className="text-sm text-muted">{k}</div>
            {v === undefined ? <div className="skeleton mt-2 h-8 w-20" /> : <div className="stat-num display z-lift-2 mt-2 text-3xl"><CountUp value={v} format={format} /></div>}
          </Tilt>
        ))}
      </section>
      {pub && <p className="meta mt-2">Revenue share: {Math.round(pub.revShare * 100)}% of the ad fee. Paid so far: {fmtUsd(pub.paid)}.</p>}

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="text-xl font-semibold tracking-tight">Add ads to your site</h2>
          <label className="mt-4 block text-sm">
            <span className="meta mb-1 block">What should the slot show?</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} className="field bg-bg" />
          </label>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-bg p-4 font-mono text-xs leading-relaxed"><code>{snippet}</code></pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={copy} aria-live="polite">{copied ? "Copied" : "Copy code"}</button>
            <Link href="/demo/blog" className="btn btn-ghost">See it on the demo blog</Link>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-semibold tracking-tight">PayPal Payouts</h2>
          {!pub ? (
            <div className="skeleton mt-4 h-24" />
          ) : pub.payouts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No payouts yet. When a reader buys from your slot, your share is paid automatically after the refund hold.{" "}
              <Link href="/demo/blog" className="link">Make a test purchase</Link>.
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-muted">
                <tr>
                  <th scope="col" className="py-2 font-normal">Date</th>
                  <th scope="col" className="py-2 font-normal">Batch</th>
                  <th scope="col" className="py-2 text-right font-normal">Amount</th>
                  <th scope="col" className="py-2 text-right font-normal">Status</th>
                </tr>
              </thead>
              <tbody>
                {pub.payouts.map((p) => (
                  <tr key={`${p.batchId}-${p.createdAt}`} className="border-t border-line">
                    <td className="py-2">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="py-2 font-mono text-xs">{p.batchId}</td>
                    <td className="stat-num py-2 text-right">{fmtUsd(p.amount)}</td>
                    <td className="py-2 text-right">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
