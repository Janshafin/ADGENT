"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, fmtCents } from "@/lib/client/api";
import { PayPalCheckout } from "@/components/PayPalCheckout";

type OfferView = {
  offerId: string;
  active: boolean;
  merchant: { name: string; emoji: string };
  product: { title: string; description: string; image: string; priceCents: number };
  headline: string;
  discountPct: number;
  payLater: boolean;
  finalPriceCents: number;
};

export default function ShopOfferPage({ params }: PageProps<"/shop/[offerId]">) {
  return (
    <Suspense fallback={<Centered><div className="skeleton h-80 w-full max-w-3xl" /></Centered>}>
      <ShopOffer params={params} />
    </Suspense>
  );
}

function ShopOffer({ params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = use(params);
  const search = useSearchParams();
  const surface = (search.get("surface") as "agent" | "widget" | "winback") ?? "widget";
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ captureId?: string; orderId: string } | null>(null);

  useEffect(() => {
    api<OfferView>(`/api/offer/${encodeURIComponent(offerId)}`).then(setOffer).catch((e) => setError((e as Error).message));
  }, [offerId]);

  if (error) return <Centered><p className="text-bad">{error}</p></Centered>;
  if (!offer) return <Centered><div className="skeleton h-80 w-full max-w-3xl" /></Centered>;

  return (
    <Centered>
      <div className="card grid w-full max-w-4xl gap-8 p-6 sm:p-8 md:grid-cols-[1fr_340px]">
        <div>
          <span className="chip chip-sponsored">Sponsored</span> <span className="meta">{offer.merchant.name} pays an ad fee only if you buy</span>
          <div className="mt-6 grid h-48 place-items-center rounded-2xl bg-panel-2 text-8xl" aria-hidden>{offer.product.image}</div>
          <p className="mt-6 text-sm text-muted">{offer.merchant.name}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{offer.product.title}</h1>
          <p className="mt-2 text-muted">{offer.product.description}</p>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="stat-num text-3xl font-semibold">{fmtCents(offer.finalPriceCents)}</span>
            {offer.discountPct > 0 && (
              <>
                <span className="text-muted line-through">{fmtCents(offer.product.priceCents)}</span>
                <span className="text-sm font-medium text-good">{offer.discountPct}% off</span>
              </>
            )}
          </div>
          <p className="mt-2 text-sm text-pp-sky">{offer.headline}</p>
        </div>

        <div className="flex flex-col justify-center">
          {paid ? (
            <div className="rounded-2xl border border-good/40 bg-good/10 p-6 text-center">
              <Check />
              <h2 className="mt-2 text-lg font-semibold">Paid with PayPal</h2>
              <p className="mt-1 text-sm text-muted">Capture {paid.captureId}</p>
              <Link href="/control" className="btn btn-quiet mt-5">See it in Mission Control</Link>
            </div>
          ) : !offer.active ? (
            <p className="text-sm text-muted">This offer has ended.</p>
          ) : (
            <PayPalCheckout
              offerId={offer.offerId}
              amountCents={offer.finalPriceCents}
              surface={surface}
              publisherId={search.get("pub")}
              buyerRef={search.get("b")}
              onPaid={setPaid}
            />
          )}
          <p className="mt-4 text-center text-xs text-muted">Eligible purchases are covered by PayPal Purchase Protection.</p>
        </div>
      </div>
    </Centered>
  );
}

function Check() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" className="mx-auto" aria-hidden>
      <circle cx="22" cy="22" r="22" fill="var(--good)" />
      <path d="M13 22.5l6 6 12-13" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-7xl justify-center px-4 py-10 sm:px-6">{children}</div>;
}
