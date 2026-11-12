"use client";

import { Suspense, use, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api, fmtCents } from "@/lib/client/api";
import { PayPalCheckout } from "@/components/PayPalCheckout";
import { ProductArt } from "@/components/ProductArt";
import { StatusMark } from "@/components/StatusMark";
import { Tilt } from "@/components/Tilt";

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
  // A hand-edited link must still check out: anything unrecognised counts as the publisher widget.
  const asked = search.get("surface");
  const surface = asked === "agent" || asked === "winback" ? asked : "widget";
  const [offer, setOffer] = useState<OfferView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<{ captureId?: string; orderId: string } | null>(null);

  useEffect(() => {
    api<OfferView>(`/api/offer/${encodeURIComponent(offerId)}`).then(setOffer).catch((e) => setError((e as Error).message));
  }, [offerId]);

  if (error) {
    return (
      <Centered>
        <div className="text-center">
          <StatusMark kind="error" />
          <h1 className="display mt-6 text-3xl">This offer isn&apos;t available.</h1>
          <p className="mt-2 text-muted">{error}</p>
          <Link href="/agent" className="btn btn-quiet mt-6">Shop with AI instead</Link>
        </div>
      </Centered>
    );
  }
  if (!offer) return <Centered><div className="skeleton h-80 w-full max-w-3xl" /></Centered>;

  return (
    <Centered>
      <div className="card rise grid w-full max-w-4xl gap-8 p-6 sm:p-8 md:grid-cols-[1fr_340px]">
        <div>
          <span className="chip chip-sponsored">Sponsored</span> <span className="meta">{offer.merchant.name} pays an ad fee only if you buy</span>
          <Tilt max={10} className="mt-6 rounded-[20px]">
            <ProductArt symbol={offer.product.image} className="h-48 rounded-[20px] [transform-style:preserve-3d] [&>svg]:[transform:translateZ(50px)]" />
          </Tilt>
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
            <div className="tile bubble-in p-6 text-center">
              <StatusMark kind="done" />
              <h2 className="mt-3 text-lg font-semibold">Paid with PayPal</h2>
              <p className="meta mt-1 font-mono">Capture {paid.captureId}</p>
              <Link href="/control" className="link link-more mt-4 inline-block text-sm">See it in Mission Control</Link>
            </div>
          ) : !offer.active ? (
            <p className="tile p-6 text-center text-sm text-muted">This offer has ended.</p>
          ) : (
            <div className="tile p-5">
            <PayPalCheckout
              offerId={offer.offerId}
              amountCents={offer.finalPriceCents}
              surface={surface}
              publisherId={search.get("pub")}
              buyerRef={search.get("b")}
              onPaid={setPaid}
            />
            </div>
          )}
          <p className="mt-4 text-center text-xs text-muted">Eligible purchases are covered by PayPal Purchase Protection.</p>
        </div>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-7xl justify-center px-4 py-10 sm:px-6">{children}</div>;
}
