import Link from "next/link";

const FLOW = [
  { n: "1", title: "Merchant Copilot", body: "Claude reads the merchant's PayPal sales and finds who to target: lapsed buyers, customers due for a refill, VIPs, and shoppers who buy from similar merchants." },
  { n: "2", title: "Ads where AI shops", body: "Sponsored offers show up inside AI shopping agents (through MCP), on publisher sites, and in win-back links. They are always labelled and ranked by relevance first." },
  { n: "3", title: "Settled on PayPal", body: "The click becomes a PayPal order with attribution. At capture the ad fee is split off, publishers get paid through Payouts, and a refund reverses the fee." },
  { n: "4", title: "Measured honestly", body: "Every campaign keeps a 10% holdout, so merchants see incremental ROAS, not just clicks. Mission Control streams every dollar live." },
];

const REVENUE = [
  { k: "Ad fee", v: "Pay-per-sale, only when a sale settles" },
  { k: "Branded checkout", v: "Every ad redeems through the PayPal button" },
  { k: "Pay Later", v: "Pay in 4 shown on eligible offers" },
  { k: "Payouts", v: "Publisher revenue share moves on PayPal rails" },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="py-16 sm:py-24">
        <span className="pill mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" /> PayPal AI Hackathon 2026
        </span>
        <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          When AI does the shopping,
          <br />
          <span className="bg-gradient-to-r from-pp-sky to-gold bg-clip-text text-transparent">who sees the ads?</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          ADGENT is PayPal Ads for the AI-shopping era. Small merchants launch AI-built campaigns from their PayPal sales data. The
          ads run inside AI shopping agents and on publisher sites, and merchants <b className="text-text">pay only when a sale settles on PayPal</b>.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/merchant" className="btn btn-primary">Launch a campaign →</Link>
          <Link href="/control" className="btn btn-ghost">Open Mission Control</Link>
          <Link href="/agent" className="btn btn-ghost">Shop with an AI agent</Link>
        </div>
      </section>

      <section className="grid gap-4 pb-12 sm:grid-cols-2 lg:grid-cols-4">
        {FLOW.map((f) => (
          <div key={f.n} className="card p-5">
            <div className="mb-3 grid h-8 w-8 place-items-center rounded-full bg-pp/15 text-sm font-bold text-pp-sky">{f.n}</div>
            <h3 className="font-semibold">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="card mb-16 grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Every ad dollar brings PayPal four revenue lines</h2>
          <p className="mt-3 text-muted">
            Branded checkout growth has stalled at 1–2% for four quarters. ADGENT turns PayPal&apos;s transaction graph into ad revenue,
            and every ad it sells routes a sale through the PayPal button.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {REVENUE.map((r) => (
            <li key={r.k} className="rounded-xl border border-line bg-panel-2 p-4">
              <div className="font-semibold text-gold">{r.k}</div>
              <div className="mt-1 text-sm text-muted">{r.v}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
