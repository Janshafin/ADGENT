import Link from "next/link";

// One real sale from the demo, split exactly as settlement does it (see /judges).
const SALE = { product: "Midnight Espresso Blend, 12 oz", total: 18.04, merchant: 16.78, publisher: 0.63, adgent: 0.63 };

const SURFACES = [
  {
    title: "For merchants",
    body: "Claude reads your PayPal sales, finds the buyers worth reaching, and drafts campaigns. You pay a fee only when a sale settles.",
    href: "/merchant",
    cta: "Build a campaign",
  },
  {
    title: "Inside AI assistants",
    body: "When someone asks an AI assistant to shop, relevant offers appear, clearly marked as sponsored, and they pay with PayPal.",
    href: "/agent",
    cta: "Shop with AI",
  },
  {
    title: "For publishers",
    body: "Add shoppable ads to any site with one line of code, and receive a share of every sale through PayPal Payouts.",
    href: "/publisher",
    cta: "See earnings",
  },
];

const PRINCIPLES = [
  ["Pay only for sales", "No impressions, no clicks. The ad fee exists only once PayPal captures a payment, and a refund takes it back."],
  ["Relevant before profitable", "Offers are ranked by how well they fit the request first. A bigger bid can't buy a place it doesn't deserve."],
  ["Measured honestly", "One in ten buyers never sees each campaign, so merchants learn which sales the ads actually caused."],
  ["Safe with AI", "Ad text can't instruct the assistant, and every payment is approved by the shopper on PayPal."],
];

const REVENUE = [
  ["Ad fees", "Earned on every settled sale."],
  ["Checkout", "Every sale goes through the PayPal button."],
  ["Pay Later", "Offered on baskets over $30."],
  ["Payouts", "Merchants and publishers are paid on PayPal."],
];

const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Home() {
  return (
    <>
      <section className="px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
        <h1 className="display mx-auto max-w-4xl text-[44px] sm:text-[72px]">When AI does the shopping, who sees the ads?</h1>
        <p className="mx-auto mt-6 max-w-2xl text-xl text-muted sm:text-[21px]">
          ADGENT brings PayPal Ads to AI shopping assistants. Small merchants reach the right buyers, and pay only when a sale settles on
          PayPal.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link href="/judges" className="btn btn-primary">Take the tour</Link>
          <Link href="/agent" className="btn btn-ghost">Shop with AI</Link>
        </div>

        <figure className="card mx-auto mt-16 max-w-3xl p-8 text-left sm:p-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="meta">Sold through an AI assistant</p>
              <p className="mt-1 text-xl font-semibold">{SALE.product}</p>
            </div>
            <p className="display stat-num text-5xl sm:text-6xl">{fmt(SALE.total)}</p>
          </div>
          {/* The two ad-fee slices are drawn wider than scale (they are 3.5% each) so they stay visible. */}
          <div className="split-bar mt-10 grid h-3 gap-1" style={{ gridTemplateColumns: "1fr 2.75rem 2.75rem" }} aria-hidden>
            <span className="block rounded-full bg-pp" />
            <span className="block rounded-full bg-[var(--pp-navy)] dark:bg-[#5e8bff]" />
            <span className="block rounded-full bg-[var(--paypal-yellow)]" />
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-4">
            {[
              ["Merchant", SALE.merchant, "bg-pp"],
              ["Publisher", SALE.publisher, "bg-[var(--pp-navy)] dark:bg-[#5e8bff]"],
              ["Ad fee kept", SALE.adgent, "bg-[var(--paypal-yellow)]"],
            ].map(([k, v, dot]) => (
              <div key={k as string}>
                <dt className="flex items-center gap-2 text-sm text-muted">
                  <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
                  {k}
                </dt>
                <dd className="stat-num mt-1 text-2xl font-semibold">{fmt(v as number)}</dd>
              </div>
            ))}
          </dl>
          <figcaption className="meta mt-8 border-t border-line pt-5">
            PayPal captures the payment, holds it through the refund window, then pays the merchant and the publisher in one Payouts batch.
          </figcaption>
        </figure>
      </section>

      <section className="bg-panel px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-[1024px]">
          <h2 className="display text-center text-4xl sm:text-5xl">One ad, wherever people shop.</h2>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {SURFACES.map((s) => (
              <article key={s.title} className="flex flex-col rounded-[22px] bg-bg p-8">
                <h3 className="text-2xl font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-3 flex-1 text-muted">{s.body}</p>
                <Link href={s.href} className="link mt-6 font-medium">{s.cta}</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-[1024px]">
          <h2 className="display max-w-2xl text-4xl sm:text-5xl">Built so merchants can trust it.</h2>
          <dl className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {PRINCIPLES.map(([t, d]) => (
              <div key={t} className="border-t border-line pt-6">
                <dt className="text-xl font-semibold tracking-tight">{t}</dt>
                <dd className="mt-2 text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="bg-panel px-4 py-20 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-[1024px] gap-12 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div>
            <h2 className="display text-4xl sm:text-5xl">Every ad dollar is four kinds of PayPal revenue.</h2>
            <p className="mt-5 text-lg text-muted">
              Shopping is moving into AI assistants, where nobody sees a banner. PayPal holds both the purchase data and the checkout, so it
              can sell placement inside assistants and prove each sale on its own rails.
            </p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-[22px] bg-line">
            {REVENUE.map(([k, v]) => (
              <li key={k} className="flex items-baseline justify-between gap-6 bg-bg px-6 py-5">
                <span className="font-semibold">{k}</span>
                <span className="text-right text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="px-4 py-24 text-center sm:px-6">
        <h2 className="display text-4xl sm:text-5xl">See a sale settle in about a minute.</h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">Launch a campaign, buy through the assistant, and watch the money move. No sign-in needed.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          <Link href="/judges" className="btn btn-primary">Take the tour</Link>
          <Link href="/control" className="btn btn-ghost">Open Mission Control</Link>
        </div>
      </section>
    </>
  );
}
