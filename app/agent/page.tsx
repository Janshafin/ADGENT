"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type Anthropic from "@anthropic-ai/sdk";
import { api, fmtCents } from "@/lib/client/api";
import type { UiEvent } from "@/lib/ai/shopper";
import { PayPalCheckout } from "@/components/PayPalCheckout";

type Bubble =
  | { role: "user" | "assistant"; text: string }
  | { role: "ui"; event: UiEvent };

const STARTERS = ["I need good espresso beans under $25", "Gift idea for a coffee nerd, around $150?", "Something tasty to go with my morning coffee"];

function newShopperRef() {
  return `shopper_${Math.random().toString(36).slice(2, 10)}`;
}

export default function AgentDemo() {
  const [history, setHistory] = useState<Anthropic.MessageParam[]>([]);
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { role: "assistant", text: "Hi! I'm your AI shopping assistant. Tell me what you're looking for." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [shopperRef, setShopperRef] = useState("");
  const [paidOrders, setPaidOrders] = useState<Record<string, string>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ref = "";
    try { ref = localStorage.getItem("adgent-shopper") ?? ""; } catch {}
    if (!ref) {
      ref = newShopperRef();
      try { localStorage.setItem("adgent-shopper", ref); } catch {}
    }
    setShopperRef(ref);
  }, []);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [bubbles, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBubbles((b) => [...b, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api<{ appended: Anthropic.MessageParam[]; reply: string; ui: UiEvent[] }>("/api/agent", {
        json: { history, text, shopperRef },
      });
      setHistory((h) => [...h, ...r.appended]);
      setBubbles((b) => [...b, ...r.ui.map((event) => ({ role: "ui" as const, event })), ...(r.reply ? [{ role: "assistant" as const, text: r.reply }] : [])]);
    } catch (e) {
      setBubbles((b) => [...b, { role: "assistant", text: `⚠ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    const ref = newShopperRef();
    try { localStorage.setItem("adgent-shopper", ref); } catch {}
    setShopperRef(ref);
    setHistory([]);
    setPaidOrders({});
    setBubbles([{ role: "assistant", text: "Fresh start. What are you shopping for?" }]);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_300px]">
      <section className="card flex h-[calc(100vh-140px)] min-h-[520px] flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <div>
            <h1 className="font-semibold">AI Shopping Agent</h1>
            <p className="text-xs text-muted">Claude, using ADGENT sponsored offers and PayPal checkout</p>
          </div>
          <button className="btn btn-ghost text-xs" onClick={reset}>New shopper</button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
          {bubbles.map((b, i) =>
            b.role === "ui" ? (
              <UiCard key={i} event={b.event} shopperRef={shopperRef} paid={b.event.kind === "checkout" ? paidOrders[b.event.orderId] : undefined} onPaid={(orderId, captureId) => {
                setPaidOrders((p) => ({ ...p, [orderId]: captureId }));
                void send(`I approved the payment for order ${orderId}.`);
              }} />
            ) : (
              <div key={i} className={`flex ${b.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${b.role === "user" ? "bg-pp text-white" : "bg-panel-2"}`}>{b.text}</div>
              </div>
            ),
          )}
          {busy && <div className="flex gap-1 px-2"><Dot /><Dot d={150} /><Dot d={300} /></div>}
          <div ref={endRef} />
        </div>

        <div className="border-t border-line p-4">
          {bubbles.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => <button key={s} className="pill hover:text-text" onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask for anything…" className="flex-1 rounded-full border border-line bg-bg px-5 py-2.5 text-sm outline-none focus:border-pp" aria-label="Message" />
            <button className="btn btn-primary" disabled={busy}>Send</button>
          </form>
        </div>
      </section>

      <aside className="space-y-4 text-sm">
        <div className="card p-5">
          <h2 className="font-semibold">What&apos;s happening</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-muted">
            <li>The agent calls <code className="text-pp-sky">find_sponsored_offers</code>, a relevance-first auction across live campaigns.</li>
            <li>Offers are labelled <b className="text-text">Sponsored</b>. A 10% holdout of shoppers never sees them, so lift is measurable.</li>
            <li>You approve on PayPal. Capture triggers the ad fee and the publisher&apos;s revenue share.</li>
          </ol>
          <Link href="/control" className="btn btn-ghost mt-4 w-full justify-center">Watch it in Mission Control →</Link>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Use it from Claude Desktop</h2>
          <p className="mt-2 text-muted">The same tools ship as an MCP server:</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-bg p-3 text-xs">npm run mcp</pre>
        </div>
      </aside>
    </div>
  );
}

function Dot({ d = 0 }: { d?: number }) {
  return <span className="h-2 w-2 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />;
}

function UiCard({ event, shopperRef, paid, onPaid }: { event: UiEvent; shopperRef: string; paid?: string; onPaid: (orderId: string, captureId: string) => void }) {
  if (event.kind === "offers") {
    if (!event.offers.length) return null;
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {event.offers.map((o) => (
          <div key={o.offerId} className="rounded-2xl border border-line bg-panel-2 p-4">
            <div className="flex items-center justify-between">
              <span className="pill text-gold">Sponsored</span>
              <span className="text-xs text-muted">{o.merchant}</span>
            </div>
            <div className="mt-3 flex gap-3">
              <div className="grid h-14 w-14 flex-none place-items-center rounded-xl bg-bg text-3xl" aria-hidden>{o.image}</div>
              <div>
                <div className="font-medium leading-tight">{o.title}</div>
                <div className="mt-1">
                  <b className="stat-num">{fmtCents(o.finalPriceCents)}</b>
                  {o.discountPct > 0 && <span className="ml-2 text-xs text-muted line-through">{fmtCents(o.priceCents)}</span>}
                </div>
                {o.payLaterText && <div className="mt-1 text-xs text-pp-sky">{o.payLaterText}</div>}
              </div>
            </div>
            <p className="mt-2 text-xs text-muted">{o.reason}</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="max-w-sm rounded-2xl border border-pp/40 bg-pp/10 p-4">
      <div className="text-sm font-medium">Approve {fmtCents(event.totalCents)} with PayPal</div>
      <div className="mt-1 text-xs text-muted">Order {event.orderId}</div>
      <div className="mt-3">
        {paid ? (
          <div className="rounded-xl bg-good/15 p-3 text-sm text-good">✓ Paid · capture {paid}</div>
        ) : (
          <PayPalCheckout
            offerId={event.offerId}
            existingOrderId={event.orderId}
            amountCents={event.totalCents}
            surface="agent"
            publisherId="pub_agentnet"
            buyerRef={shopperRef}
            onPaid={(r) => onPaid(r.orderId, r.captureId ?? "")}
          />
        )}
      </div>
    </div>
  );
}
