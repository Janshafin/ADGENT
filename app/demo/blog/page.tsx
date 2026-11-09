import Script from "next/script";

export const metadata = { title: "The Daily Grind · How to dial in espresso at home" };

/** A stand-in for any small publisher's site, with the ADGENT widget embedded by one script tag. */
export default function DemoBlog() {
  return (
    <div className="min-h-screen bg-[#faf7f2] text-[#2b2119]">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs uppercase tracking-[0.2em] text-[#8a6d52]">The Daily Grind · Coffee blog</p>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_320px]">
          <article className="font-serif text-lg leading-relaxed">
            <h1 className="font-sans text-4xl font-bold leading-tight tracking-tight">How to dial in espresso at home (without losing your mind)</h1>
            <p className="mt-2 font-sans text-sm text-[#8a6d52]">8 min read · by Ines Rossi</p>
            <p className="mt-6">
              Dialing in is a loop: dose, grind, time, taste. Start with 18 grams in and aim for about 36 grams out in 25–30 seconds.
              Sour and thin means you should grind finer. Bitter and harsh means coarser.
            </p>
            <p className="mt-4">
              Fresh beans matter more than any gadget. Coffee peaks roughly one to three weeks after roasting, so buy small bags often.
              A dark, chocolatey blend is the most forgiving place to start.
            </p>
            <div className="my-8 font-sans" data-adgent-slot data-query="espresso coffee beans dark roast" data-limit="2" />
            <p>
              Once your beans are dialed, your grinder becomes the bottleneck. A burr grinder with fine steps makes small adjustments
              possible. Blade grinders can&apos;t get you there.
            </p>
            <p className="mt-4">Keep a notebook, change one variable at a time, and enjoy the bad shots too. They&apos;re how you learn.</p>
          </article>
          <aside className="font-sans">
            <div className="sticky top-20 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8a6d52]">Gear we like</p>
              <div data-adgent-slot data-query="coffee grinder or brewing gear" data-limit="2" />
              <p className="text-xs text-[#8a6d52]">
                The Daily Grind earns a share of the ad fee when you buy, paid through PayPal. Merchants pay only for sales.
              </p>
            </div>
          </aside>
        </div>
      </div>
      <Script src="/widget.js" data-pub="pub_dailygrind" strategy="afterInteractive" />
    </div>
  );
}
