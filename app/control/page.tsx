"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type GridApi,
  type CellValueChangedEvent,
  type RowClassParams,
} from "ag-grid-community";
import { api, fmtUsd, useStatus, getAdminToken, setAdminToken } from "@/lib/client/api";
import type { OrderRow } from "@/app/api/orders/route";
import type { LedgerRow } from "@/lib/adgent/ledger";
import type { CampaignMetrics } from "@/lib/adgent/metrics";
import type { GridQuery } from "@/lib/ai/ask";

ModuleRegistry.registerModules([AllCommunityModule]);

// Grid colours come from the same tokens as the page, so it follows light and dark mode.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--bg)",
  foregroundColor: "var(--text)",
  headerBackgroundColor: "var(--panel)",
  headerTextColor: "var(--muted)",
  oddRowBackgroundColor: "var(--row-alt)",
  borderColor: "var(--hairline)",
  rowBorder: { color: "var(--hairline)" },
  wrapperBorder: false,
  accentColor: "var(--pp-blue)",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  headerFontWeight: 500,
  rowHeight: 44,
  headerHeight: 40,
  wrapperBorderRadius: 18,
  spacing: 7,
});

type Economics = {
  liveSales: number;
  brandedCheckoutTpv: number;
  adFeeRevenue: number;
  publisherPayouts: number;
  netAdRevenue: number;
  processingRevenue: number;
  payLaterEligibleSales: number;
  totalPaypalRevenue: number;
  perAdDollar: number;
  allTimeAdFees: number;
  settledSales: number;
  awaitingPayout: number;
  refundedSales: number;
  merchantPayoutsPaid: number;
  publisherPayoutsPaid: number;
};

const ORDER_STATUS: Record<string, string> = {
  created: "text-muted",
  captured: "text-pp-sky",
  settled: "text-good",
  refunded: "text-bad",
  failed: "text-muted",
};

const TYPE_STYLE: Record<string, { label: string; cls: string }> = {
  campaign_launched: { label: "Launched", cls: "text-pp-sky" },
  campaign_paused: { label: "Paused", cls: "text-muted" },
  impression: { label: "Impression", cls: "text-muted" },
  click: { label: "Click", cls: "text-text" },
  order_created: { label: "PayPal order", cls: "text-pp-sky" },
  captured: { label: "Captured", cls: "text-good" },
  fee_collected: { label: "Ad fee", cls: "text-gold" },
  payout_sent: { label: "Payout", cls: "text-gold" },
  refunded: { label: "Refunded", cls: "text-bad" },
  invoice_sent: { label: "Invoice", cls: "text-gold" },
  guardian: { label: "Guardian", cls: "text-warn" },
};

const SURFACE: Record<string, string> = { agent: "AI assistant", widget: "Publisher site", winback: "Win-back link" };

export default function MissionControl() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [econ, setEcon] = useState<Economics | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [query, setQuery] = useState<GridQuery | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showNoise, setShowNoise] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  // Only rendered after /api/status loads on the client, so reading sessionStorage here cannot mismatch hydration.
  const [adminToken, setAdminTokenState] = useState(() => (typeof window === "undefined" ? "" : getAdminToken()));
  const status = useStatus();
  const ledgerApi = useRef<GridApi<LedgerRow> | null>(null);
  const freshIds = useRef(new Set<number>());

  const refreshAggregates = useCallback(() => {
    api<CampaignMetrics[]>("/api/campaigns").then(setCampaigns).catch(() => {});
    api<Economics>("/api/economics").then(setEcon).catch(() => {});
    api<OrderRow[]>("/api/orders").then(setOrders).catch(() => {});
  }, []);

  // Initial load + live SSE tail of the ledger
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    api<LedgerRow[]>("/api/ledger").then((initial) => {
      if (cancelled) return;
      setRows(initial);
      const after = initial.length ? initial[initial.length - 1].id : 0;
      es = new EventSource(`/api/ledger/stream?after=${after}`);
      es.addEventListener("rows", (e) => {
        const incoming = JSON.parse((e as MessageEvent).data) as LedgerRow[];
        incoming.forEach((r) => freshIds.current.add(r.id));
        setRows((prev) => [...prev, ...incoming].slice(-5000));
        if (incoming.some((r) => r.type !== "impression")) refreshAggregates();
        const sale = incoming.find((r) => r.type === "captured");
        if (sale) setToast(`New sale on PayPal: ${fmtUsd(sale.amount ?? 0)} via ${SURFACE[sale.surface ?? ""] ?? sale.surface}`);
      });
    });
    refreshAggregates();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [refreshAggregates]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const visibleRows = useMemo(
    () => [...(showNoise ? rows : rows.filter((r) => r.type !== "impression"))].reverse(),
    [rows, showNoise],
  );

  const ledgerCols = useMemo<ColDef<LedgerRow>[]>(
    () => [
      { field: "ts", headerName: "Time", width: 110, valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : ""), sort: "desc", filter: "agTextColumnFilter" },
      {
        field: "type",
        headerName: "Event",
        width: 150,
        filter: "agTextColumnFilter",
        cellRenderer: (p: { value: string }) => {
          const s = TYPE_STYLE[p.value];
          return <span className={s?.cls}>{s?.label ?? p.value}</span>;
        },
      },
      { field: "campaignName", headerName: "Campaign", flex: 1.4, minWidth: 180, filter: "agTextColumnFilter" },
      { field: "merchantName", headerName: "Merchant", flex: 1, minWidth: 150, filter: "agTextColumnFilter" },
      { field: "surface", headerName: "Surface", width: 130, filter: "agTextColumnFilter", valueFormatter: (p) => (p.value ? SURFACE[p.value] ?? p.value : "") },
      { field: "publisherName", headerName: "Publisher", width: 170, filter: "agTextColumnFilter" },
      { field: "amount", headerName: "Sale", width: 100, type: "rightAligned", filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value == null ? "" : fmtUsd(p.value)) },
      { field: "fee", headerName: "Ad fee", width: 100, type: "rightAligned", filter: "agNumberColumnFilter", valueFormatter: (p) => (p.value == null ? "" : fmtUsd(p.value)), cellClass: "text-gold" },
      { field: "paypalRef", headerName: "PayPal ID", width: 170, filter: "agTextColumnFilter", cellClass: "font-mono text-xs" },
      { field: "detail", headerName: "Detail", flex: 2, minWidth: 240, tooltipField: "detail" },
    ],
    [],
  );

  const campaignCols = useMemo<ColDef<CampaignMetrics>[]>(
    () => [
      { field: "name", headerName: "Campaign", flex: 1.6, minWidth: 220, pinned: "left" },
      { field: "merchantName", headerName: "Merchant", flex: 1, minWidth: 160 },
      {
        field: "status",
        headerName: "Status",
        width: 110,
        editable: true,
        cellEditor: "agSelectCellEditor",
        cellEditorParams: { values: ["active", "paused"] },
        cellRenderer: (p: { value: string }) => (
          <span className={p.value === "active" ? "text-good" : "text-muted"}>{p.value === "active" ? "● active" : "○ paused"}</span>
        ),
      },
      { field: "impressions", headerName: "Impr.", width: 90, type: "rightAligned" },
      { field: "sales", headerName: "Sales", width: 80, type: "rightAligned" },
      { field: "revenue", headerName: "Revenue", width: 110, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0) },
      { field: "fees", headerName: "Ad fees", width: 100, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0), cellClass: "text-gold" },
      {
        field: "feeRate",
        headerName: "Fee %",
        width: 90,
        editable: true,
        type: "rightAligned",
        valueFormatter: (p) => `${Math.round((p.value ?? 0) * 100)}%`,
        valueParser: (p) => Math.min(0.3, Math.max(0.01, Number(String(p.newValue).replace("%", "")) / 100)),
      },
      { field: "budget", headerName: "Budget", width: 110, editable: true, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0, 0), valueParser: (p) => Math.min(1000, Math.max(10, Number(String(p.newValue).replace(/[$,]/g, "")) || 10)) },
      {
        field: "spent",
        headerName: "Spent",
        width: 130,
        cellRenderer: (p: { value: number; data: CampaignMetrics }) => {
          const pct = Math.min(100, (p.value / Math.max(1, p.data.budget)) * 100);
          return (
            <div className="flex h-full items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-line">
                <div className="h-1.5 rounded-full bg-gold" style={{ width: `${pct}%` }} />
              </div>
              <span className="stat-num text-xs text-muted">{Math.round(pct)}%</span>
            </div>
          );
        },
      },
      { field: "roas", headerName: "ROAS", width: 85, type: "rightAligned", valueFormatter: (p) => (p.value ? `${p.value}×` : "—") },
      {
        field: "iroas",
        headerName: "iROAS",
        width: 90,
        type: "rightAligned",
        headerTooltip: "Incremental ROAS vs the 10% holdout",
        cellRenderer: (p: { value: number | null }) =>
          p.value === null ? <span className="text-xs text-muted">measuring…</span> : <b className={p.value >= 3 ? "text-good" : p.value > 0 ? "text-warn" : "text-muted"}>{p.value}×</b>,
      },
      {
        field: "liftPct",
        headerName: "Lift",
        width: 90,
        type: "rightAligned",
        headerTooltip: "Conversion lift of exposed buyers over the holdout",
        valueFormatter: (p) => (p.value === null || p.value === undefined ? "—" : `+${p.value}%`),
        cellClass: "text-good",
      },
    ],
    [],
  );

  const refund = useCallback(
    (o: OrderRow) => {
      if (!window.confirm(`Refund ${fmtUsd(o.sale)} to the buyer for ${o.productTitle}? The ad fee is reversed.`)) return;
      void action("refund", async () => {
        const r = await api<{ id: string; status: string }>(`/api/orders/${encodeURIComponent(o.id)}/refund`, { method: "POST" });
        return `Refunded (${r.id}): ${fmtUsd(o.sale)} back to the buyer, ${fmtUsd(o.fee)} ad fee reversed`;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const orderCols = useMemo<ColDef<OrderRow>[]>(
    () => [
      { field: "createdAt", headerName: "Time", width: 110, sort: "desc", valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleTimeString() : "") },
      { field: "status", headerName: "Status", width: 105, cellRenderer: (p: { value: string }) => <span className={ORDER_STATUS[p.value]}>{p.value}</span> },
      { field: "productTitle", headerName: "Product", flex: 1.3, minWidth: 180 },
      { field: "surface", headerName: "Surface", width: 120, valueFormatter: (p) => (p.value ? SURFACE[p.value] ?? p.value : "") },
      { field: "sale", headerName: "Sale", width: 95, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0) },
      { field: "fee", headerName: "Ad fee", width: 90, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0), cellClass: "text-gold" },
      { field: "merchantNet", headerName: "Merchant", width: 100, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0), headerTooltip: "Paid to the merchant by PayPal Payouts after the refund hold" },
      { field: "publisherShare", headerName: "Publisher", width: 100, type: "rightAligned", valueFormatter: (p) => fmtUsd(p.value ?? 0) },
      { field: "captureId", headerName: "PayPal capture", width: 170, cellClass: "font-mono text-xs" },
      { field: "payoutId", headerName: "Payout batch", width: 160, cellClass: "font-mono text-xs" },
      {
        headerName: "",
        width: 100,
        sortable: false,
        filter: false,
        cellRenderer: (p: { data?: OrderRow }) =>
          p.data && (p.data.status === "captured" || p.data.status === "settled") ? (
            <button type="button" className="text-xs font-medium text-bad hover:underline" onClick={() => refund(p.data!)}>
              Refund
            </button>
          ) : null,
      },
    ],
    [refund],
  );

  async function onCampaignEdit(e: CellValueChangedEvent<CampaignMetrics>) {
    const f = e.colDef.field;
    const patch: Record<string, unknown> = {};
    if (f === "status") patch.status = e.newValue;
    if (f === "feeRate") patch.feeRate = e.newValue;
    if (f === "budget") patch.budgetCents = Math.round(Number(e.newValue) * 100);
    try {
      await api(`/api/campaigns/${e.data.campaignId}`, { method: "PATCH", json: patch });
      setToast(`Updated ${e.data.name}`);
    } catch (err) {
      setToast((err as Error).message);
    }
    refreshAggregates();
  }

  // Natural-language → grid filter model
  async function ask(q = question) {
    if (q.trim().length < 3) return;
    setAsking(true);
    try {
      const gq = await api<GridQuery>("/api/ask", { json: { question: q } });
      setQuery(gq);
      setShowNoise(gq.filters.some((f) => f.column === "type" && f.value === "impression"));
      const model: Record<string, unknown> = {};
      for (const f of gq.filters) {
        const isNum = f.column === "amount" || f.column === "fee";
        model[f.column] = {
          filterType: isNum ? "number" : "text",
          type: f.op,
          filter: isNum ? Number(f.value) : String(f.value),
          ...(f.op === "inRange" && f.valueTo != null ? { filterTo: isNum ? Number(f.valueTo) : String(f.valueTo) } : {}),
        };
      }
      ledgerApi.current?.setFilterModel(model);
      if (gq.sort) ledgerApi.current?.applyColumnState({ state: [{ colId: gq.sort.column, sort: gq.sort.dir }], defaultState: { sort: null } });
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setAsking(false);
    }
  }

  function clearQuery() {
    setQuery(null);
    setQuestion("");
    ledgerApi.current?.setFilterModel(null);
  }

  // Group-by view, computed client-side from the filtered ledger rows
  const grouped = useMemo(() => {
    if (!query?.groupBy.length) return null;
    const source = rows.filter((r) => query.filters.every((f) => matchesFilter(r, f)));
    const map = new Map<string, { key: string; events: number; sales: number; amount: number; fee: number }>();
    for (const r of source) {
      const key = query.groupBy.map((g) => (r[g as keyof LedgerRow] as string) ?? "—").join(" · ");
      const g = map.get(key) ?? { key, events: 0, sales: 0, amount: 0, fee: 0 };
      g.events += 1;
      if (r.type === "captured") g.sales += 1;
      g.amount += r.amount ?? 0;
      g.fee += r.fee ?? 0;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [query, rows]);

  async function action(name: string, fn: () => Promise<string>) {
    setBusy(name);
    try {
      setToast(await fn());
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(null);
      refreshAggregates();
    }
  }

  const getRowClass = useCallback((p: RowClassParams<LedgerRow>) => {
    if (p.data && freshIds.current.has(p.data.id)) {
      freshIds.current.delete(p.data.id);
      return "row-new";
    }
    return undefined;
  }, []);

  const SUGGESTIONS = ["Which campaign made the most revenue from AI agents?", "Show sales over $20", "Ad fees by surface", "Every refund"];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="display text-4xl sm:text-5xl">Mission Control</h1>
          <p className="mt-2 text-lg text-muted">Every ad dollar, from the click to the payout, as it happens on PayPal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status?.adminRequired && (
            <label className="flex items-center gap-2 text-xs text-muted">
              Admin token
              <input
                type="password"
                value={adminToken}
                onChange={(e) => {
                  setAdminTokenState(e.target.value);
                  setAdminToken(e.target.value);
                }}
                className="w-40 rounded-md border border-line bg-bg px-2 py-1.5 text-sm"
                autoComplete="off"
              />
            </label>
          )}
          <button
            className="btn btn-primary"
            disabled={busy !== null}
            title="Pays every sale whose refund hold has passed. A background worker also does this automatically."
            onClick={() =>
              action("settle", async () => {
                const r = await api<{ batchId: string | null; paid: { name: string; kind: string; cents: number }[]; orders: number }>("/api/settle/payouts", { method: "POST" });
                return r.batchId
                  ? `Paid out ${r.orders} sale(s) in PayPal Payouts batch ${r.batchId}: ${r.paid.map((p) => `${p.name} ${fmtUsd(p.cents / 100)}`).join(", ")}`
                  : `Nothing to settle yet. Sales wait ${status?.holdSeconds ?? 120}s (the refund hold) before payout.`;
              })
            }
          >
            {busy === "settle" ? "Paying out…" : "Pay out now"}
          </button>
          {status?.feeMode === "invoice" && (
            <button
              className="btn btn-ghost"
              disabled={busy !== null}
              onClick={() =>
                action("invoice", async () => {
                  const r = await api<{ invoices: { invoiceId: string }[]; totalCents?: number; message?: string }>("/api/settle/invoice", { json: {} });
                  return r.invoices.length ? `${r.invoices.length} PayPal invoice${r.invoices.length > 1 ? "s" : ""} sent for ${fmtUsd((r.totalCents ?? 0) / 100)}` : r.message ?? "Done";
                })
              }
            >
              {busy === "invoice" ? "Sending invoice…" : "Invoice ad fees"}
            </button>
          )}
        </div>
      </div>

      {/* PayPal P&L */}
      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi label="Sales through PayPal" value={econ ? fmtUsd(econ.brandedCheckoutTpv) : null} hint={`${econ?.liveSales ?? 0} sales`} />
        <Kpi label="Ad fee revenue" value={econ ? fmtUsd(econ.adFeeRevenue) : null} hint="Charged only on sales" accent="gold" />
        <Kpi label="Paid out via Payouts" value={econ ? fmtUsd(econ.merchantPayoutsPaid + econ.publisherPayoutsPaid) : null} hint={econ ? `${econ.settledSales} settled, ${econ.awaitingPayout} in refund window` : "Merchants and publishers"} />
        <Kpi label="Processing revenue" value={econ ? fmtUsd(econ.processingRevenue) : null} hint="Estimated at 3.49% + 49¢" />
        <Kpi label="Pay Later eligible" value={econ ? String(econ.payLaterEligibleSales) : null} hint="Sales of $30 or more" />
        <Kpi label="PayPal revenue per ad dollar" value={econ ? (econ.perAdDollar ? `$${econ.perAdDollar.toFixed(2)}` : "—") : null} hint="Ad fees plus processing" accent="good" />
      </section>

      {/* Ask your ads */}
      <section className="card mt-5 p-4">
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void ask();
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your ads anything, e.g. which campaign made the most from AI agents?"
            className="flex-1 rounded-full border border-line bg-bg px-5 py-2.5 text-sm outline-none focus:border-pp"
            aria-label="Ask the ledger"
          />
          <button className="btn btn-primary" disabled={asking}>{asking ? "Thinking…" : "Ask"}</button>
          {query && <button type="button" className="btn btn-ghost" onClick={clearQuery}>Clear</button>}
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="pill hover:text-text" onClick={() => { setQuestion(s); void ask(s); }}>{s}</button>
          ))}
          <label className="pill ml-auto cursor-pointer select-none">
            <input type="checkbox" checked={showNoise} onChange={(e) => setShowNoise(e.target.checked)} className="accent-pp" /> show impressions
          </label>
        </div>
        {query && <p className="mt-3 text-sm text-muted">{query.explanation}</p>}
        {grouped && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr><th className="py-1 pr-4 font-normal">{query?.groupBy.join(" · ")}</th><th className="py-1 pr-4 font-normal">Events</th><th className="py-1 pr-4 font-normal">Sales</th><th className="py-1 pr-4 font-normal">Revenue</th><th className="py-1 font-normal">Ad fees</th></tr>
              </thead>
              <tbody>
                {grouped.map((g) => (
                  <tr key={g.key} className="border-t border-line">
                    <td className="py-1.5 pr-4">{SURFACE[g.key] ?? g.key}</td>
                    <td className="stat-num pr-4">{g.events}</td>
                    <td className="stat-num pr-4">{g.sales}</td>
                    <td className="stat-num pr-4">{fmtUsd(g.amount)}</td>
                    <td className="stat-num text-gold">{fmtUsd(g.fee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Budget guardian */}
      {campaigns.some((c) => c.advice) && (
        <section className="mt-5 grid gap-3 md:grid-cols-2">
          {campaigns.filter((c) => c.advice).map((c) => (
            <div key={c.campaignId} className="card p-5">
              <div className="meta">Budget guardian</div>
              <div className="mt-1 font-medium">{c.name}</div>
              <p className="mt-1 text-sm text-muted">{c.advice}</p>
            </div>
          ))}
        </section>
      )}

      {/* Campaigns */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Campaigns</h2>
        <p className="meta mb-4 mt-1">Double-click a status, fee or budget to change it.</p>
        <div style={{ height: Math.min(480, 48 + campaigns.length * 44) }}>
          <AgGridReact<CampaignMetrics>
            theme={theme}
            rowData={campaigns}
            columnDefs={campaignCols}
            getRowId={(p) => p.data.campaignId}
            onCellValueChanged={onCampaignEdit}
            defaultColDef={{ sortable: true, resizable: true }}
            stopEditingWhenCellsLoseFocus
          />
        </div>
      </section>

      {/* Orders: the money split per sale */}
      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">Orders</h2>
        <p className="meta mb-4 mt-1">Every sale and where each dollar went.</p>
        {orders.length === 0 ? (
          <div className="card p-6 text-sm text-muted">
            No live sales yet. <a href="/agent" className="text-pp-sky hover:underline">Buy something through the AI agent</a> or the{" "}
            <a href="/demo/blog" className="text-pp-sky hover:underline">publisher demo</a>, and it lands here in real time.
          </div>
        ) : (
          <div style={{ height: Math.min(440, 48 + orders.length * 44) }}>
            <AgGridReact<OrderRow>
              theme={theme}
              rowData={orders}
              columnDefs={orderCols}
              getRowId={(p) => p.data.id}
              defaultColDef={{ sortable: true, resizable: true, filter: true }}
            />
          </div>
        )}
      </section>

      {/* Live ledger */}
      <section className="mt-12">
        <h2 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
          Live ledger
          <span className="inline-flex h-2 w-2 rounded-full bg-good" aria-label="live" />
        </h2>
        <p className="meta mb-4 mt-1">Each step of every sale: impression, click, PayPal order, capture, fee, payout.</p>
        <div style={{ height: 560 }}>
          <AgGridReact<LedgerRow>
            theme={theme}
            rowData={visibleRows}
            columnDefs={ledgerCols}
            getRowId={(p) => String(p.data.id)}
            getRowClass={getRowClass}
            onGridReady={(e) => (ledgerApi.current = e.api)}
            defaultColDef={{ sortable: true, resizable: true, floatingFilter: false }}
            tooltipShowDelay={300}
            pagination
            paginationPageSize={100}
            paginationPageSizeSelector={[50, 100, 500]}
          />
        </div>
      </section>

      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-full border border-line bg-panel-2 px-5 py-3 text-sm shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

/** Mirrors the AG Grid filter semantics so the group-by summary matches the grid. */
function matchesFilter(r: LedgerRow, f: GridQuery["filters"][number]): boolean {
  const v = r[f.column as keyof LedgerRow];
  if (f.column === "amount" || f.column === "fee") {
    const n = typeof v === "number" ? v : NaN;
    const x = Number(f.value);
    switch (f.op) {
      case "equals": return n === x;
      case "notEqual": return n !== x;
      case "greaterThan": return n > x;
      case "lessThan": return n < x;
      case "inRange": return n >= x && n <= Number(f.valueTo);
      default: return String(v ?? "").includes(String(f.value));
    }
  }
  const s = String(v ?? "").toLowerCase();
  const x = String(f.value).toLowerCase();
  switch (f.op) {
    case "equals": return s === x;
    case "notEqual": return s !== x;
    default: return s.includes(x);
  }
}

function Kpi({ label, value, hint, accent }: { label: string; value: string | null; hint: string; accent?: "gold" | "good" }) {
  return (
    <div className="card p-5">
      <div className="text-sm text-muted">{label}</div>
      {value === null ? (
        <div className="skeleton mt-2 h-7 w-24" />
      ) : (
        <div className={`stat-num display mt-2 text-3xl ${accent === "gold" ? "text-gold" : accent === "good" ? "text-good" : ""}`}>{value}</div>
      )}
      <div className="meta mt-1">{hint}</div>
    </div>
  );
}
