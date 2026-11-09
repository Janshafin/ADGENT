"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";

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

function loadSdk(clientId: string): Promise<PayPalNamespace> {
  if (window.paypal) return Promise.resolve(window.paypal);
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SDK_ID) as HTMLScriptElement | null;
    const s = existing ?? document.createElement("script");
    s.id = SDK_ID;
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture&components=buttons,messages&enable-funding=paylater`;
    s.async = true;
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error("PayPal SDK failed to initialise")));
    s.onerror = () => reject(new Error("Could not load the PayPal SDK"));
    if (!existing) document.body.appendChild(s);
  });
}

/**
 * PayPal Smart Buttons + Pay Later messaging.
 * The order is created server-side (with attribution + fee) and captured server-side.
 */
export function PayPalCheckout(props: {
  offerId: string;
  amountCents: number;
  surface: "agent" | "widget" | "winback";
  publisherId?: string | null;
  buyerRef?: string | null;
  /** Approve an order that was already created (e.g. by the AI agent) instead of creating a new one */
  existingOrderId?: string;
  onPaid: (r: { captureId?: string; orderId: string }) => void;
}) {
  const buttonsRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    if (!clientId) return;
    let instance: PayPalButtonsInstance | undefined;
    let cancelled = false;
    loadSdk(clientId)
      .then(async (paypal) => {
        if (cancelled || !buttonsRef.current) return;
        if (paypal.Messages && messageRef.current) {
          await paypal.Messages({ amount: propsRef.current.amountCents / 100, placement: "product", style: { layout: "text", text: { color: "white" } } }).render(messageRef.current);
        }
        instance = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", color: "gold", label: "paypal" },
          createOrder: async () => {
            setError(null);
            const p = propsRef.current;
            if (p.existingOrderId) return p.existingOrderId;
            const r = await api<{ orderId: string }>("/api/checkout/create", {
              json: { offerId: p.offerId, surface: p.surface, publisherId: p.publisherId ?? null, buyerRef: p.buyerRef ?? null },
            });
            return r.orderId;
          },
          onApprove: async ({ orderID }) => {
            const r = await api<{ status: string; captureId?: string }>("/api/checkout/capture", { json: { orderId: orderID } });
            propsRef.current.onPaid({ captureId: r.captureId, orderId: orderID });
          },
          onError: (err) => setError(err instanceof Error ? err.message : "PayPal checkout failed"),
        });
        await instance.render(buttonsRef.current);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
      instance?.close?.().catch(() => {});
    };
  }, [clientId, props.offerId]);

  if (!clientId) {
    return (
      <div className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
        Set <code>NEXT_PUBLIC_PAYPAL_CLIENT_ID</code> to turn on PayPal checkout.
      </div>
    );
  }
  return (
    <div>
      <div ref={messageRef} className="mb-3 min-h-5" />
      <div ref={buttonsRef} className="min-h-[150px] rounded-xl bg-white/95 p-3" />
      {error && <p className="mt-3 text-sm text-bad">{error}</p>}
    </div>
  );
}
