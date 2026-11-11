import Link from "next/link";

// One real sale from the demo, split exactly as settlement does it (see /judges).
const SALE = { product: "Midnight Espresso Blend, 12 oz", total: 18.04, merchant: 16.78, publisher: 0.63, adgent: 0.63 };
const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function Home() {
  return (
    <div className="space-y-3 pb-3">
      <HeroTile
        tone="white"
        eyebrow="ADGENT"
        title="Ads for the age of AI shopping."
        subtitle="Merchants pay only when a sale settles on PayPal."
        primary={{ href: "/judges", label: "Take the tour" }}
        secondary={{ href: "/merchant", label: "Build a campaign" }}
      >
        <SaleSplit />
      </HeroTile>

      <HeroTile
        tone="gray"
        eyebrow="Shop with AI"
        title="Ask. Compare. Pay with PayPal."
        subtitle="Sponsored offers appear inside AI assistants, always labelled, always relevant first."
        primary={{ href: "/agent", label: "Try it" }}
        secondary={{ href: "/judges#claude-desktop", label: "Use in Claude" }}
      >
        <ChatShot />
      </HeroTile>

      <HeroTile
        tone="white"
        eyebrow="Mission Control"
        title="Every dollar. Live."
        subtitle="Watch each sale move from click to PayPal capture to payout, as it happens."
        primary={{ href: "/control", label: "Open Mission Control" }}
        secondary={{ href: "/judges#money", label: "How a sale settles" }}
      >
        <ControlShot />
      </HeroTile>

      <div className="mx-3 grid gap-3 md:grid-cols-2">
        <GridTile
          tone="gray"
          title="Merchant Copilot"
          subtitle="Campaigns built from your PayPal sales."
          primary={{ href: "/merchant", label: "Learn more" }}
          secondary={{ href: "/merchant", label: "Start" }}
        >
          <Stat value="36" label="lapsed buyers ready to win back" />
        </GridTile>
        <GridTile
          tone="gray"
          title="Publishers"
          subtitle="Earn a share of every sale. Paid through PayPal."
          primary={{ href: "/publisher", label: "Learn more" }}
          secondary={{ href: "/demo/blog", label: "See the demo" }}
        >
          <Stat value="50%" label="of the ad fee goes to the site that made the sale" />
        </GridTile>
        <GridTile
          tone="gray"
          title="Honest measurement"
          subtitle="One in ten buyers never sees each ad."
          primary={{ href: "/control", label: "See the lift" }}
        >
          <Stat value="10%" label="holdout per campaign, so you see the sales ads really caused" />
        </GridTile>
        <GridTile
          tone="gray"
          title="Safe with AI"
          subtitle="Ad text can't tell an assistant what to do."
          primary={{ href: "/judges#trust", label: "Learn more" }}
        >
          <Stat value="100%" label="of payments are approved by the shopper on PayPal itself" />
        </GridTile>
      </div>
    </div>
  );
}

type Action = { href: string; label: string };

function Actions({ primary, secondary }: { primary: Action; secondary?: Action }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3.5">
      <Link href={primary.href} className="btn btn-primary">{primary.label}</Link>
      {secondary && <Link href={secondary.href} className="btn btn-ghost">{secondary.label}</Link>}
    </div>
  );
}

function HeroTile(props: { tone: "white" | "gray"; eyebrow: string; title: string; subtitle: string; primary: Action; secondary?: Action; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden px-4 pt-14 text-center sm:pt-16 ${props.tone === "gray" ? "bg-panel" : "bg-bg"}`}>
      <p className="text-lg font-semibold text-muted sm:text-xl">{props.eyebrow}</p>
      <h2 className="display mx-auto mt-2 max-w-3xl text-[40px] sm:text-[56px]">{props.title}</h2>
      <p className="mx-auto mt-3 max-w-2xl text-xl sm:text-[24px] sm:leading-snug">{props.subtitle}</p>
      <Actions primary={props.primary} secondary={props.secondary} />
      <div className="mx-auto mt-12 max-w-[880px] pb-14 sm:pb-16">{props.children}</div>
    </section>
  );
}

function GridTile(props: { tone: "white" | "gray"; title: string; subtitle: string; primary: Action; secondary?: Action; children: React.ReactNode }) {
  return (
    <section className={`flex min-h-[460px] flex-col items-center px-6 pt-12 text-center ${props.tone === "gray" ? "bg-panel" : "bg-bg"}`}>
      <h2 className="display text-[32px] sm:text-[40px]">{props.title}</h2>
      <p className="mt-2 max-w-md text-lg sm:text-xl">{props.subtitle}</p>
      <Actions primary={props.primary} secondary={props.secondary} />
      <div className="flex w-full flex-1 items-center justify-center py-10">{props.children}</div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="max-w-xs">
      <p className="display text-[64px] text-pp sm:text-[80px]">{value}</p>
      <p className="mt-1 text-muted">{label}</p>
    </div>
  );
}

/** Product shot 1: one sale, split three ways. */
function SaleSplit() {
  return (
    <figure className="rounded-[28px] bg-bg p-8 text-left shadow-[0_20px_60px_-20px_rgba(0,0,0,0.18)] ring-1 ring-black/5 sm:p-10">
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
    <div className="mx-auto max-w-[400px] rounded-[44px] bg-[#1d1d1f] p-3 shadow-[0_30px_70px_-25px_rgba(0,0,0,0.45)]" aria-label="Example conversation with the shopping assistant">
      <div className="space-y-3 rounded-[34px] bg-bg px-4 pb-6 pt-8 text-left text-[15px]">
        <div className="flex justify-end">
          <p className="max-w-[80%] rounded-[20px] bg-pp px-4 py-2 text-white">Good espresso beans under $25?</p>
        </div>
        <p className="max-w-[85%] rounded-[20px] bg-panel px-4 py-2">Sponsored: this one fits, and it&apos;s 10% off.</p>
        <div className="rounded-[20px] bg-panel p-4">
          <div className="flex items-center justify-between">
            <span className="chip chip-sponsored">Sponsored</span>
            <span className="meta">Bean There Coffee Roasters</span>
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
    <div className="mx-auto max-w-[820px]">
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
      <div className="mx-auto h-3 w-[104%] -translate-x-[2%] rounded-b-[14px] bg-[#d2d2d7]" aria-hidden />
    </div>
  );
}
