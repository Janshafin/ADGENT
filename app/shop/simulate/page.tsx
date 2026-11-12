"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/client/api";

/**
 * Stand-in for PayPal's approval page when no sandbox keys are configured.
 * AI agents (MCP) send the shopper here; approving returns them to /shop/return like PayPal does.
 */
export default function SimulatedApprovalPage() {
  return (
    <Suspense>
      <SimulatedApproval />
    </Suspense>
  );
}

function SimulatedApproval() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/sim/approve", { json: { orderId: token, name: "Sandbox Buyer" } });
      router.push(`/shop/return?token=${encodeURIComponent(token)}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card rise p-6">
        <p className="chip chip-sponsored">Simulated PayPal</p>
        <h1 className="mt-2 text-xl font-semibold">Approve this payment</h1>
        <p className="mt-2 text-sm text-muted">
          On a deployment with PayPal sandbox keys, this step happens on paypal.com. Here it is simulated, so no money moves, but the order,
          capture and ledger are the real code paths.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">Order {token ?? "missing"}</p>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn btn-gold flex-1 justify-center" onClick={approve} disabled={!token || busy}>
            {busy ? "Approving…" : "Approve payment"}
          </button>
          <Link href="/shop/cancel" className="btn btn-ghost">Cancel</Link>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-bad">{error}</p>}
      </div>
    </div>
  );
}
