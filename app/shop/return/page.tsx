"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";

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
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <div className="text-5xl">{state.status === "done" ? "✅" : state.status === "error" ? "⚠️" : "⏳"}</div>
      <h1 className="mt-4 text-2xl font-semibold">{state.status === "done" ? "You're all set" : state.status === "error" ? "Something went wrong" : "One moment"}</h1>
      <p className="mt-2 text-muted">{orderId ? state.text : "Missing PayPal order token."}</p>
      {state.status === "done" && <p className="mt-2 text-sm text-muted">You can go back to your AI assistant. It will confirm the order.</p>}
      <Link href="/control" className="btn btn-ghost mt-6">Mission Control →</Link>
    </div>
  );
}
