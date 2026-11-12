import Link from "next/link";
import type { Metadata } from "next";
import { Reveal } from "@/components/Reveal";
import { Tilt } from "@/components/Tilt";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Judges' tour",
  description: "Try ADGENT end to end in about a minute, and see exactly what is real.",
  alternates: { canonical: "/judges" },
};

const STEPS = [
  {
    title: "Launch a campaign",
    href: "/merchant",
    cta: "Open Merchant Copilot",
    body: "Pick Bean There Coffee Roasters and press Build my campaigns. The audiences come from the PayPal transaction graph; the forecast numbers are computed from that data, not invented by the model. Launch one.",
    look: "The proposal cites real audience sizes and shows exactly what AI agents will read.",
  },
  {
    title: "Buy through an AI agent",
    href: "/agent",
    cta: "Open the AI agent",
    body: "Ask for \"espresso beans under $25\", then say \"I'll take the first one\" and pay with PayPal. Offers are labelled Sponsored and ranked relevance first.",
    look: "The agent can only check out an offer it showed you, and you approve the payment yourself.",
  },
  {
    title: "Watch the money move",
    href: "/control",
    cta: "Open Mission Control",
    body: "Your sale appears live in the AG Grid ledger: click, PayPal order, capture, ad fee. After the refund hold, one PayPal Payouts batch pays the merchant its net and the publisher its share.",
    look: "Try Refund on a sale in the Orders grid: the ad fee is reversed. Ask the ledger a question in plain English.",
  },
  {
    title: "See it on a publisher site",
    href: "/demo/blog",
    cta: "Open the demo blog",
    body: "A coffee blog shows shoppable ads from one script tag. Buying from the widget credits the blog, and its earnings appear on the Publisher page.",
    look: "The same auction serves agents and web pages.",
  },
];

const REAL = [
  ["Order creation, capture, refunds, payouts, invoices", "Real PayPal REST calls (Orders v2, Payments, Payouts, Invoicing) with idempotency keys", "With sandbox keys: real sandbox. Without: the built-in simulator answers the same calls, labelled on every page"],
  ["Attribution, money split, holdout, iROAS, budget guardian", "Real code on every live sale", "Real"],
  ["Ledger, Mission Control, live stream", "Real database, streamed with Server-Sent Events", "Real"],
  ["Campaign strategy, offer ranking, ask-your-ads, shopping agent", "Claude Opus 5.5 (strategy, agent) and Haiku 5.5 (ranking, questions)", "With a Claude key: Claude. Without: deterministic fallbacks, labelled"],
  ["Cross-merchant transaction graph (600 buyers, 2.7k purchases) and two past campaigns", "Synthetic seed data, because a sandbox has no real shoppers", "Simulated, labelled \"simulated history\" in the ledger"],
];

const TRUST = [
  ["Pay only for sales", "The fee exists only on a captured PayPal sale and is reversed by a refund. No sale, no fee."],
  ["Honest measurement", "A stable 10% holdout never sees the ad. Lift and incremental ROAS compare exposed buyers with it, and the guardian pauses campaigns below 1× iROAS."],
  ["Prompt-injection defense", "Advertiser text is cleaned, wrapped as untrusted data, and loses rank if it tries to instruct the agent. An agent can only start checkout for an offer it showed, and the shopper approves every payment on PayPal."],
  ["Money-path safety", "Capture, settlement and refunds are idempotent; each order is claimed before a payout so it can never be paid twice; webhooks are signature-verified and de-duplicated; budgets are checked before an order is created."],
];

const MCP = `{
  "mcpServers": {
    "adgent": {
      "command": "npx",
      "args": ["tsx", "/path/to/adgent/mcp-server/index.ts"],
      "env": { "ADGENT_URL": "${SITE_URL}" }
    }
  }
}`;

export default function JudgesPage() {
  return (
    <div className="mx-auto max-w-[1024px] px-4 py-14 sm:px-6">
      <h1 className="display rise text-4xl sm:text-6xl">See it work in about a minute.</h1>
      <p className="rise-2 mt-4 max-w-2xl text-xl text-muted">
        No login. Four steps, each one a real part of the product. Merchants pay a fee only when a sale settles on PayPal, and PayPal earns on the
        ad, the checkout, Pay Later and Payouts.
      </p>

      <ol className="mt-8 grid gap-4 md:grid-cols-2">
        {STEPS.map((s, i) => (
          <Reveal as="li" key={s.title} delay={(i % 2) * 90}>
            <Tilt max={5} className="card flex h-full flex-col p-6">
            <div className="z-lift-1 flex items-center gap-3">
              <span className="stat-num grid h-7 w-7 place-items-center rounded-full bg-text text-sm font-semibold text-bg" aria-hidden>{i + 1}</span>
              <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
            <p className="mt-2 text-sm"><span className="text-muted">Look for:</span> {s.look}</p>
            <div className="mt-4 flex-1" />
            <Link href={s.href} className="btn btn-primary btn-sm z-lift-2 self-start">{s.cta}</Link>
            </Tilt>
          </Reveal>
        ))}
      </ol>

      <Reveal as="section" className="mt-16 scroll-mt-20">
        <span id="real-vs-simulated" className="block scroll-mt-24" />
        <h2 className="display text-3xl">What&apos;s real, and what&apos;s simulated.</h2>
        <div className="mt-6 overflow-x-auto rounded-[18px] bg-panel">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Part</th>
                <th scope="col" className="px-4 py-2 font-medium">How it works</th>
                <th scope="col" className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {REAL.map(([a, b, c]) => (
                <tr key={a} className="border-t border-line align-top">
                  <td className="px-4 py-3 font-medium">{a}</td>
                  <td className="px-4 py-3 text-muted">{b}</td>
                  <td className="px-4 py-3">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>

      <section id="money" className="mt-16 scroll-mt-20">
        <h2 className="display text-3xl">How one $18.04 sale settles.</h2>
        <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-5">
          {[
            ["Click", "Offer ranked, impression and click logged with surface and publisher"],
            ["PayPal order", "Orders v2 with discount line and custom_id = campaign | surface | publisher"],
            ["Capture", "Buyer approves on PayPal; capture books the sale and the 7% ad fee ($1.26)"],
            ["Refund hold", "Money waits out the hold (2 min in the demo) so refunds never chase payouts"],
            ["Payouts", "One batch: merchant $16.78, publisher $0.63; ADGENT keeps $0.63"],
          ].map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 80} className="card p-4">
              <div className="text-xs text-muted">Step {i + 1}</div>
              <div className="font-medium">{t}</div>
              <p className="mt-1 text-xs text-muted">{d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="trust" className="mt-16 grid scroll-mt-20 gap-4 md:grid-cols-2">
        {TRUST.map(([t, d], i) => (
          <Reveal key={t} delay={(i % 2) * 90} className="card p-6">
            <h3 className="text-lg font-semibold tracking-tight">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
          </Reveal>
        ))}
      </section>

      <section id="claude-desktop" className="mt-16 grid scroll-mt-20 gap-6 md:grid-cols-2">
        <div>
          <h2 className="display text-3xl">Connect any MCP agent.</h2>
          <p className="mt-2 text-sm text-muted">
            The same three tools ship as an MCP server: <code>find_sponsored_offers</code>, <code>start_paypal_checkout</code>,{" "}
            <code>confirm_purchase</code>. Add this to your MCP client&apos;s config file, then ask for espresso beans under $25.
          </p>
        </div>
        <pre className="overflow-x-auto rounded-[18px] bg-panel p-5 font-mono text-[13px] leading-relaxed"><code>{MCP}</code></pre>
      </section>
    </div>
  );
}
