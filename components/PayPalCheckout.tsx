"use client";

import { useEffect, useRef, useState } from "react";
import { api, useStatus } from "@/lib/client/api";

type PayPalButtonsInstance = { render: (el: HTMLElement) => Promise<void>; close?: () => Promise<void> };
type PayPalNamespace = {
  Buttons: (opts: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError?: (err: unknown) => void;
    onCancel?: () => void;
  }) => PayPalButtonsInstance;
  Messages?: (opts: { amount: number; placement: string; style?: Record<string, unknown> }) => { render: (el: HTMLElement) => Promise<void> };
};

declare global {
  interface Window {
    paypal?: PayPalNamespace;
  }
}

const SDK_ID = "paypal-js-sdk";

let sdkPromise: Promise<PayPalNamespace> | null = null;

/** Loads the PayPal JS SDK once per page. A failed load clears itself so the next button retries. */
function loadSdk(clientId: string): Promise<PayPalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  sdkPromise ??= new Promise<PayPalNamespace>((resolve, reject) => {
    document.getElementById(SDK_ID)?.remove();
    const s = document.createElement("script");
    s.id = SDK_ID;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons,messages&enable-funding=paylater`;
    s.async = true;
    s.addEventListener("load", () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK failed to initialise"))));
    s.addEventListener("error", () => reject(new Error("Could not load the PayPal SDK. Check your connection and try again.")));
    document.body.appendChild(s);
  }).catch((e) => {
    sdkPromise = null;
    throw e;
  });
  return sdkPromise;
}

type Props = {
  offerId: string;
  amountCents: number;
  surface: "agent" | "widget" | "winback";
  publisherId?: string | null;
  buyerRef?: string | null;
  /** Approve an order that was already created (e.g. by the AI agent) instead of creating a new one */
  existingOrderId?: string;
  onPaid: (r: { captureId?: string; orderId: string }) => void;
};

/**
 * PayPal checkout. The order is created server-side (with attribution + split) and captured server-side.
 * With sandbox keys: PayPal Smart Buttons + Pay Later messaging.
 * Without: a clearly labelled simulated approval that runs the exact same server code.
 */
export function PayPalCheckout(props: Props) {
  const status = useStatus();
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!status) return <div className="skeleton h-11 !rounded-full" aria-label="Loading checkout" />;
  if (status.paypalMode === "simulated") return <SimulatedCheckout {...props} />;
  if (!clientId) {
    return (
      <p className="rounded-2xl bg-warn/10 p-4 text-sm text-warn">
        Set <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> to show PayPal buttons.
      </p>
    );
  }
  return <SmartButtons {...props} clientId={clientId} />;
}

async function createOrder(p: Props): Promise<string> {
  if (p.existingOrderId) return p.existingOrderId;
  const r = await api<{ orderId: string }>("/api/checkout/create", {
    json: { offerId: p.offerId, surface: p.surface, publisherId: p.publisherId ?? null, buyerRef: p.buyerRef ?? null },
  });
  return r.orderId;
}

async function capture(orderId: string) {
  return api<{ status: string; captureId?: string }>("/api/checkout/capture", { json: { orderId } });
}

function SmartButtons(props: Props & { clientId: string }) {
  const buttonsRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    let instance: PayPalButtonsInstance | undefined;
    let cancelled = false;
    loadSdk(props.clientId)
      .then(async (paypal) => {
        if (cancelled || !buttonsRef.current) return;
        if (paypal.Messages && messageRef.current) {
          await paypal.Messages({ amount: propsRef.current.amountCents / 100, placement: "product", style: { layout: "text", text: { color: "black" } } }).render(messageRef.current);
        }
        instance = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", color: "gold", label: "paypal" },
          createOrder: async () => {
            setError(null);
            return createOrder(propsRef.current);
          },
          onApprove: async ({ orderID }) => {
            const r = await capture(orderID);
            propsRef.current.onPaid({ captureId: r.captureId, orderId: orderID });
          },
          onError: (err) => setError(err instanceof Error ? err.message : "PayPal checkout failed. Please try again."),
        });
        await instance.render(buttonsRef.current);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      instance?.close?.().catch(() => {});
    };
  }, [props.clientId, props.offerId]);

  return (
    <div>
      <div ref={messageRef} className="mb-3 min-h-5" />
      <div ref={buttonsRef} className="min-h-[150px]" />
      {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}

function SimulatedCheckout(props: Props) {
  const [step, setStep] = useState<"idle" | "creating" | "approving" | "capturing">("idle");
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    try {
      setStep("creating");
      const orderId = await createOrder(props);
      setStep("approving");
      await api("/api/sim/approve", { json: { orderId, name: "Sandbox Buyer" } });
      setStep("capturing");
      const r = await capture(orderId);
      props.onPaid({ captureId: r.captureId, orderId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStep("idle");
    }
  }

  const label = { idle: "Pay with PayPal", creating: "Creating PayPal order…", approving: "Approving…", capturing: "Capturing payment…" }[step];
  return (
    <div>
      <button type="button" onClick={pay} disabled={step !== "idle"} className="btn btn-gold w-full justify-center" aria-busy={step !== "idle"}>
        {step !== "idle" && <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/20 border-t-black/70" aria-hidden />}
        {label}
      </button>
      {props.amountCents >= 3000 && <p className="mt-2 text-center text-xs text-muted">Pay in 4 interest-free payments of {(props.amountCents / 400).toLocaleString("en-US", { style: "currency", currency: "USD" })} available</p>}
      <p className="mt-2 text-center text-xs text-muted">Simulated PayPal: this runs the real order, capture and ledger code without moving money.</p>
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
