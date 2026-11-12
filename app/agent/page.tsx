"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type Anthropic from "@anthropic-ai/sdk";
import { api, fmtCents, useStatus } from "@/lib/client/api";
import type { UiEvent } from "@/lib/ai/shopper";
import { PayPalCheckout } from "@/components/PayPalCheckout";
import { ProductArt } from "@/components/ProductArt";

type Bubble =
  | { role: "user" | "assistant"; text: string }
  | { role: "ui"; event: UiEvent };

const STARTERS = ["I need good espresso beans under $25", "Gift idea for a coffee nerd, around $150?", "Something tasty to go with my morning coffee"];

function newShopperRef() {
  return `shopper_${Math.random().toString(36).slice(2, 10)}`;
}

export default function AgentDemo() {
  const [history, setHistory] = useState<Anthropic.Beta.BetaMessageParam[]>([]);
  const status = useStatus();
  const [bubbles, setBubbles] = useState<Bubble[]>([
    { role: "assistant", text: "Hi, I'm your shopping assistant. Tell me what you're looking for." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [shopperRef, setShopperRef] = useState("");
  const [paidOrders, setPaidOrders] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ref = "";
    try { ref = localStorage.getItem("adgent-shopper") ?? ""; } catch {}
    if (!ref) {
      ref = newShopperRef();
      try { localStorage.setItem("adgent-shopper", ref); } catch {}
    }
    setShopperRef(ref);
  }, []);

  // Scroll the conversation itself, never the page around it.
  useEffect(() => {
    const el = listRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [bubbles, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput("");
    setBubbles((b) => [...b, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api<{ appended: Anthropic.Beta.BetaMessageParam[]; reply: string; ui: UiEvent[] }>("/api/agent", {
        json: { history, text, shopperRef },
      });
      setHistory((h) => [...h, ...r.appended]);
      // The reply introduces the cards ("approve it below"), so it comes first.
      setBubbles((b) => [...b, ...(r.reply ? [{ role: "assistant" as const, text: r.reply }] : []), ...r.ui.map((event) => ({ role: "ui" as const, event }))]);
    } catch (e) {
      setBubbles((b) => [...b, { role: "assistant", text: `Something went wrong: ${(e as Error).message}` }]);
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

  const lastOffers = bubbles.findLastIndex((b) => b.role === "ui" && b.event.kind === "offers");

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_300px]">
      <section className="card flex h-[calc(100dvh-200px)] min-h-[480px] flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--hairline)] px-5 py-3.5">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">Shop with AI</h1>
            <p className="text-xs text-muted">
              {status === null ? "Connecting…" : status.ai ? "AI agent using ADGENT discovery and PayPal checkout" : "Offline mode: a rule-based agent using the same discovery and checkout"}
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-sm flex-none whitespace-nowrap" onClick={reset}>New shopper</button>
        </header>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-5" aria-live="polite">
          {bubbles.map((b, i) =>
            b.role === "ui" ? (
              <UiCard
                key={i}
                event={b.event}
                shopperRef={shopperRef}
                canBuy={i === lastOffers && !busy}
                onBuy={(title) => void send(`I'll take the ${title}`)}
                paid={b.event.kind === "checkout" ? paidOrders[b.event.orderId] : undefined}
                onPaid={(orderId, captureId) => {
                  setPaidOrders((p) => ({ ...p, [orderId]: captureId }));
                  void send(`I approved the payment for order ${orderId}.`);
                }}
              />
            ) : (
              <div key={i} className={`flex ${b.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`bubble-in max-w-[82%] whitespace-pre-wrap rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed ${b.role === "user" ? "bubble-in-right bg-pp text-white" : "bubble-in-left bg-bg"}`}>{b.text}</div>
              </div>
            ),
          )}
          {busy && (
            <div className="bubble-in bubble-in-left flex" role="status" aria-label="The assistant is replying">
              <span className="typing"><span /><span /><span /></span>
            </div>
          )}
        </div>

        <div className="border-t border-[var(--hairline)] p-4">
          {bubbles.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {STARTERS.map((s, i) => (
                <button key={s} type="button" className="pill stagger" style={{ "--i": i } as React.CSSProperties} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          )}
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask for anything…" className="field flex-1 !py-2.5 !text-[15px]" aria-label="Message" maxLength={1000} />
            <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
          </form>
        </div>
      </section>

      <aside className="space-y-4 text-sm">
        <div className="card rise-2 p-5">
          <h2 className="font-semibold">What&apos;s happening</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-muted">
            <li>The agent calls <code className="text-pp-sky">find_sponsored_offers</code>, a relevance-first auction across live campaigns.</li>
            <li>Offers are labelled <b className="text-text">Sponsored</b>. A 10% holdout of shoppers never sees them, so lift is measurable.</li>
            <li>You approve on PayPal. Capture triggers the ad fee and the publisher&apos;s revenue share.</li>
          </ol>
          <Link href="/control" className="btn btn-quiet btn-sm mt-5 w-full">Watch it in Mission Control</Link>
        </div>
        <div className="card rise-3 p-5">
          <h2 className="font-semibold">Connect your own agent</h2>
          <p className="mt-2 text-muted">The same tools ship as an MCP server, for any agent that speaks MCP:</p>
          <pre className="mt-2 overflow-x-auto rounded-xl bg-bg p-3 font-mono text-xs">npm run mcp</pre>
          <Link href="/judges#claude-desktop" className="link link-more mt-3 inline-block">See the config</Link>
        </div>
      </aside>
    </div>
  );
}

type UiCardProps = {
  event: UiEvent;
  shopperRef: string;
  paid?: string;
  canBuy: boolean;
  onBuy: (title: string) => void;
  onPaid: (orderId: string, captureId: string) => void;
};

function UiCard({ event, shopperRef, paid, canBuy, onBuy, onPaid }: UiCardProps) {
  if (event.kind === "offers") {
    if (!event.offers.length) return null;
    return (
      <ul className="max-w-xl space-y-2">
        {event.offers.map((o, i) => (
          <li key={o.offerId} className="stagger rounded-[20px] bg-bg p-4" style={{ "--i": i } as React.CSSProperties}>
            <div className="flex items-center gap-3.5">
              <ProductArt symbol={o.image} className="h-14 w-14 flex-none rounded-2xl !bg-panel" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2">
                  <span className="chip chip-sponsored">Sponsored</span>
                  <span className="meta truncate">{o.merchant}</span>
                </p>
                <p className="mt-0.5 font-medium leading-tight">{o.title}</p>
                <p className="mt-1 text-[15px]">
                  <b className="stat-num font-semibold">{fmtCents(o.finalPriceCents)}</b>
                  {o.discountPct > 0 && <span className="ml-2 text-xs text-muted line-through">{fmtCents(o.priceCents)}</span>}
                  {o.discountPct > 0 && <span className="ml-2 text-xs font-medium text-good">{o.discountPct}% off</span>}
                </p>
              </div>
              {canBuy && (
                <button type="button" className="btn btn-primary btn-sm flex-none" onClick={() => onBuy(o.title)} aria-label={`Buy ${o.title}`}>Buy</button>
              )}
            </div>
            {o.payLaterText && <p className="mt-2 text-xs text-pp-sky">{o.payLaterText}</p>}
            <details className="mt-2.5 text-xs text-muted">
              <summary className="select-none">Why am I seeing this?</summary>
              <p className="mt-1.5 leading-relaxed">{o.disclosure}. Ranked by relevance to your request first, then bid and merchant trust. {o.reason}.</p>
            </details>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="bubble-in bubble-in-left max-w-sm rounded-[20px] bg-bg p-4">
      <p className="font-medium">{paid ? "Paid" : "Approve"} {fmtCents(event.totalCents)} with PayPal</p>
      <p className="meta mt-0.5 font-mono">Order {event.orderId}</p>
      <div className="mt-3">
        {paid ? (
          <p className="flex items-center gap-2.5 text-sm text-good">
            <svg width="22" height="22" viewBox="0 0 44 44" className="pop flex-none" aria-hidden>
              <circle cx="22" cy="22" r="22" fill="var(--good)" />
              <path className="draw" d="M13 22.5l6 6 12-13" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>PayPal capture <span className="font-mono text-xs">{paid}</span></span>
          </p>
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
