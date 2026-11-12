import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

/** Structured data so search engines can describe the product. */
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  url: SITE_URL,
  description: SITE_DESCRIPTION,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Pay per sale: no cost until a sale settles on PayPal" },
};

// One real sale from the demo, split exactly as settlement does it (see /judges).
const SALE = { product: "Midnight Espresso Blend, 12 oz", total: 18.04, merchant: 16.78, publisher: 0.63, adgent: 0.63 };
const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Home() {
  return (
    <div>
      {/* Static JSON with no user input; "<" is escaped so it can never close the script tag. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }} />

      {/* Product local nav: title on the left, two compact pills on the right. */}
      <div className="sticky top-11 z-30 border-b border-[var(--hairline)] bg-[var(--nav-bg)] backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-[var(--frost)]">
        <div className="mx-auto flex h-[52px] max-w-[1024px] items-center justify-between gap-4 px-4 sm:px-6">
          <p className="text-[19px] font-semibold leading-[1.21] tracking-[-0.01em]">ADGENT</p>
          <div className="flex items-center gap-2.5">
            <Link href="/judges" className="btn btn-ghost btn-xs">Take the tour</Link>
            <Link href="/merchant" className="btn btn-primary btn-xs">Build a campaign</Link>
          </div>
        </div>
      </div>

      {/* Hero stage: white, centred, the product shown without a frame around the section. */}
      <section className="overflow-hidden px-4 pt-16 text-center sm:pt-20">
        <p className="kicker rise">Pay-per-sale ads</p>
        <h1 className="display rise rise-2 mx-auto mt-3 max-w-4xl text-[44px] sm:text-[64px] lg:text-[80px] lg:tracking-[-1.2px]">Ads for the age of AI shopping.</h1>
        <p className="rise rise-3 mx-auto mt-5 max-w-xl text-[19px] leading-[1.42] sm:text-[21px] sm:leading-[1.38]">
          Merchants pay only when a sale settles on PayPal.
        </p>
        <p className="rise rise-3 mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[19px] sm:text-[21px]">
          <Link href="/agent" className="link link-more">Try the shopping agent</Link>
          <Link href="/judges#money" className="link link-more">How a sale settles</Link>
        </p>
        <div className="rise rise-4 mx-auto mt-14 max-w-[880px] pb-[90px]">
          <SaleSplit />
        </div>
      </section>

      {/* Highlights stage: a grey band holding flat white cards. */}
      <section className="band bg-panel px-4 py-[90px] sm:px-6">
        <div className="mx-auto max-w-[1024px]">
          <h2 className="display text-[32px] sm:text-[40px] sm:leading-none">Get the highlights.</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            <FeatureCard
              kicker="Shop with AI"
              title="Ask. Compare. Pay with PayPal."
              copy="Any AI shopping agent can connect through our API or MCP. Sponsored results are always labelled, with the reason shown."
              links={[{ href: "/agent", label: "Try it" }, { href: "/judges#claude-desktop", label: "Connect your agent" }]}
            >
              <ChatShot />
            </FeatureCard>
            <FeatureCard
              kicker="Mission Control"
              title="Every dollar. Live."
              copy="Watch each sale move from click to PayPal capture to payout, as it happens."
              links={[{ href: "/control", label: "Open Mission Control" }]}
            >
              <ControlShot />
            </FeatureCard>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard value="0" unit="$" label="upfront. A fee exists only on a captured sale." href="/merchant" cta="For merchants" />
            <StatCard value="50" unit="%" unitAfter label="of the ad fee goes to the site that made the sale." href="/publisher" cta="For publishers" />
            <StatCard value="10" unit="%" unitAfter label="of shoppers never see each ad, so lift is measured, not guessed." href="/control" cta="See the lift" />
            <StatCard value="100" unit="%" unitAfter label="of payments are approved by the shopper on PayPal itself." href="/judges#trust" cta="How it stays safe" />
          </div>
        </div>
      </section>

      {/* Editorial block: small kicker, large left-aligned statement, body copy. */}
      <section className="px-4 py-[90px] sm:px-6">
        <div className="mx-auto max-w-[1024px]">
          <p className="kicker text-muted">How it works</p>
          <h2 className="display mt-3 max-w-3xl text-[36px] sm:text-[56px] sm:leading-[1.07] sm:tracking-[-0.28px]">
            The merchant pays when the sale is real. Not before.
          </h2>
          <ol className="mt-14 grid gap-x-10 gap-y-10 border-t border-line pt-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <p className="stat-num text-[14px] font-semibold text-muted">{String(i + 1).padStart(2, "0")}</p>
                <h3 className="mt-2 text-[21px] font-semibold leading-[1.19]">{s.title}</h3>
                <p className="mt-2 text-muted">{s.copy}</p>
              </li>
            ))}
          </ol>
          <p className="mt-12 flex flex-wrap gap-x-8 gap-y-2">
            <Link href="/judges" className="link link-more">Take the one-minute tour</Link>
            <Link href="/judges#real-vs-simulated" className="link link-more">See what&apos;s real in this demo</Link>
          </p>
        </div>
      </section>
    </div>
  );
}

const STEPS = [
  { title: "An agent asks.", copy: "A shopping agent sends the shopper's request to ADGENT and gets back relevant offers, each one labelled as sponsored with the reason it was chosen." },
  { title: "The shopper approves.", copy: "ADGENT creates the PayPal order for that exact offer. The shopper approves it on PayPal, so the sale is tied to the campaign from the start." },
  { title: "The fee follows the sale.", copy: "PayPal confirms the capture. After the refund window the merchant is charged the agreed fee, and a refund takes it back." },
];

type Action = { href: string; label: string };

function FeatureCard(props: { kicker: string; title: string; copy: string; links: Action[]; children: React.ReactNode }) {
  return (
    <article className="card flex flex-col overflow-hidden px-7 pt-10 text-center sm:px-10">
      <p className="kicker text-muted">{props.kicker}</p>
      <h3 className="display mt-2 text-[28px] sm:text-[36px] sm:leading-[1.1]">{props.title}</h3>
      <p className="mx-auto mt-3 max-w-sm">{props.copy}</p>
      <p className="mt-3 flex flex-wrap items-center justify-center gap-x-7 gap-y-1">
        {props.links.map((l) => (
          <Link key={l.href} href={l.href} className="link link-more">{l.label}</Link>
        ))}
      </p>
      <div className="mt-10 flex flex-1 items-end justify-center">{props.children}</div>
    </article>
  );
}

function StatCard(props: { value: string; unit: string; unitAfter?: boolean; label: string; href: string; cta: string }) {
  return (
    <article className="card flex flex-col p-7">
      <p className="display stat-num text-[56px] leading-none">
        {!props.unitAfter && <span className="text-[32px] align-[0.35em]">{props.unit}</span>}
        {props.value}
        {props.unitAfter && <span className="text-[32px]">{props.unit}</span>}
      </p>
      <p className="small mt-3 flex-1 text-muted">{props.label}</p>
      <Link href={props.href} className="link link-more small mt-5">{props.cta}</Link>
    </article>
  );
}

/** Product shot 1: one sale, split three ways. */
function SaleSplit() {
  return (
    <figure className="rounded-[28px] bg-bg p-7 text-left shadow-[inset_0_0_0_1px_var(--control)] sm:p-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="meta">Sold through an AI assistant</p>
          <p className="mt-1 text-xl font-semibold">{SALE.product}</p>
        </div>
        <p className="display stat-num text-5xl sm:text-6xl">{fmt(SALE.total)}</p>
      </div>
      {/* The two ad-fee slices are drawn wider than scale (3.5% each) so they stay visible. */}
      <div className="mt-10 grid h-3 gap-1" style={{ gridTemplateColumns: "1fr 2.75rem 2.75rem" }} aria-hidden>
        <span className="block rounded-full bg-pp" />
        <span className="block rounded-full bg-[var(--pp-navy)]" />
        <span className="block rounded-full bg-[var(--paypal-yellow)]" />
      </div>
      <dl className="mt-6 grid grid-cols-3 gap-4">
        {(
          [
            ["Merchant", SALE.merchant, "bg-pp"],
            ["Publisher", SALE.publisher, "bg-[var(--pp-navy)]"],
            ["Ad fee kept", SALE.adgent, "bg-[var(--paypal-yellow)]"],
          ] as const
        ).map(([k, v, dot]) => (
          <div key={k}>
            <dt className="flex items-center gap-2 text-sm text-muted">
              <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />
              {k}
            </dt>
            <dd className="stat-num mt-1 text-2xl font-semibold">{fmt(v)}</dd>
          </div>
        ))}
      </dl>
      <figcaption className="meta mt-8 border-t border-line pt-5">
        PayPal captures the payment, holds it through the refund window, then pays the merchant and the publisher in one Payouts batch.
      </figcaption>
    </figure>
  );
}

/** Product shot 2: the assistant conversation, drawn like a phone screen. */
function ChatShot() {
  return (
    <div className="mx-auto w-full max-w-[340px] rounded-t-[44px] bg-[#1d1d1f] p-3 pb-0" aria-label="Example conversation with the shopping assistant">
      <div className="space-y-3 rounded-t-[34px] bg-bg px-4 pb-6 pt-8 text-left text-[15px]">
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-[20px] bg-pp px-4 py-2 text-white">Good espresso beans under $25?</p>
        </div>
        <p className="max-w-[85%] rounded-[20px] bg-panel px-4 py-2">Sponsored: this one fits, and it&apos;s 10% off.</p>
        <div className="rounded-[20px] bg-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <span className="chip chip-sponsored">Sponsored</span>
            <span className="meta text-right">Bean There Coffee Roasters</span>
          </div>
          <p className="mt-3 font-semibold">Midnight Espresso Blend</p>
          <p className="meta">Dark chocolate, molasses, low acidity</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="stat-num text-lg font-semibold">$17.09 <span className="text-sm font-normal text-muted line-through">$18.99</span></span>
          </div>
          <p className="btn btn-gold mt-3 w-full">Pay with PayPal</p>
        </div>
        <div className="flex justify-end">
          <p className="rounded-[20px] bg-pp px-4 py-2 text-white">I&apos;ll take it.</p>
        </div>
      </div>
    </div>
  );
}

/** Product shot 3: Mission Control, drawn like a laptop screen. */
function ControlShot() {
  const rows = [
    ["11:57:34", "Payout", "Merchant", "$15.38", "text-gold"],
    ["11:57:34", "Payout", "Publisher", "$0.51", "text-gold"],
    ["11:55:12", "Captured", "AI assistant", "$17.09", "text-good"],
    ["11:55:12", "Ad fee", "AI assistant", "$1.71", "text-gold"],
    ["11:55:04", "PayPal order", "AI assistant", "$17.09", "text-pp-sky"],
  ];
  return (
    <div className="mx-auto w-full max-w-[820px]">
      <div className="rounded-t-[22px] bg-[#1d1d1f] p-2.5 pb-0">
        <div className="overflow-hidden rounded-t-[14px] bg-bg p-5 text-left sm:p-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Sales through PayPal", "$34.18"],
              ["Paid out", "$31.78"],
              ["PayPal per ad dollar", "$1.34"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-[14px] bg-panel p-3 sm:p-4">
                <p className="text-[11px] text-muted sm:text-xs">{k}</p>
                <p className="stat-num display mt-1 text-xl sm:text-2xl">{v}</p>
              </div>
            ))}
          </div>
          <table className="mt-4 w-full text-[12px] sm:text-[13px]">
            <tbody>
              {rows.map(([t, ev, where, amt, cls], i) => (
                <tr key={i} className="border-t border-[var(--hairline)]">
                  <td className="stat-num py-2 text-muted">{t}</td>
                  <td className={`py-2 font-medium ${cls}`}>{ev}</td>
                  <td className="py-2 text-muted">{where}</td>
                  <td className="stat-num py-2 text-right">{amt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
