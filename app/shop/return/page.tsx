"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";
import { StatusMark } from "@/components/StatusMark";

/** PayPal redirects here after the shopper approves an agent-initiated order (?token=ORDER_ID). */
export default function PayPalReturnPage() {
  return (
    <Suspense>
      <PayPalReturn />
    </Suspense>
  );
}

function PayPalReturn() {
  const orderId = useSearchParams().get("token");
  const [state, setState] = useState<{ status: "working" | "done" | "error"; text: string }>({ status: "working", text: "Confirming your payment with PayPal…" });
  const started = useRef(false);

  useEffect(() => {
    if (!orderId || started.current) return;
    started.current = true;
    api<{ status: string; captureId?: string }>("/api/checkout/capture", { json: { orderId } })
      .then((r) => setState({ status: "done", text: `Payment ${r.status}. PayPal capture ${r.captureId ?? ""}` }))
      .catch((e) => setState({ status: "error", text: (e as Error).message }));
  }, [orderId]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <StatusMark kind={!orderId ? "error" : state.status} />
      <h1 className="display mt-6 text-4xl">{state.status === "done" ? "You're all set." : state.status === "error" || !orderId ? "Payment not completed." : "Confirming with PayPal…"}</h1>
      <p className="mt-3 text-lg text-muted">{orderId ? state.text : "This page needs a PayPal order token. Start checkout again from the offer."}</p>
      {state.status === "done" && <p className="meta mt-2">You can go back to your AI assistant. It will confirm the order.</p>}
      <Link href="/control" className="btn btn-quiet mt-8">See it in Mission Control</Link>
    </div>
  );
}
