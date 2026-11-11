"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { api, fmtUsd } from "@/lib/client/api";
import type { PublisherSummary } from "@/app/api/publishers/route";

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
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="select">
            {(pubs ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">{error}</p>}

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Earnings">
        {[
          ["Ad impressions", pub ? pub.impressions.toLocaleString() : null],
          ["Sales from your slots", pub ? String(pub.sales) : null],
          ["Revenue you drove", pub ? fmtUsd(pub.revenueDriven) : null],
          ["You earned", pub ? fmtUsd(pub.earned) : null],
          ["Waiting for payout", pub ? fmtUsd(pub.pending) : null],
        ].map(([k, v]) => (
          <div key={k} className="card p-4">
            <div className="meta">{k}</div>
            {v === null ? <div className="skeleton mt-2 h-7 w-20" /> : <div className="stat-num mt-1 text-2xl font-semibold">{v}</div>}
          </div>
        ))}
      </section>
      {pub && <p className="meta mt-2">Revenue share: {Math.round(pub.revShare * 100)}% of the ad fee. Paid so far: {fmtUsd(pub.paid)}.</p>}

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">Add ads to your site</h2>
          <label className="mt-4 block text-sm">
            <span className="meta mb-1 block">What should the slot show?</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={120} className="field bg-bg" />
          </label>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-bg p-3 text-xs leading-relaxed"><code>{snippet}</code></pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={copy}>{copied ? "Copied" : "Copy code"}</button>
            <Link href="/demo/blog" className="btn btn-ghost">See it on the demo blog</Link>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">PayPal Payouts</h2>
          {!pub ? (
            <div className="skeleton mt-4 h-24" />
          ) : pub.payouts.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No payouts yet. When a reader buys from your slot, your share is paid automatically after the refund hold.{" "}
              <Link href="/demo/blog" className="text-pp-sky hover:underline">Make a test purchase</Link>.
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
