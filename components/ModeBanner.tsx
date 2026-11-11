"use client";

import Link from "next/link";
import { useStatus } from "@/lib/client/api";

/** Says plainly what is real on this deployment. Shown on every page. */
export function ModeBanner() {
  const s = useStatus();
  if (!s || (s.paypalMode !== "simulated" && s.ai)) return null;
  const parts = [
    s.paypalMode === "simulated" ? "payments run on a PayPal simulator, so no money moves" : null,
    !s.ai ? "the shopping assistant runs without Claude" : null,
  ].filter(Boolean);
  return (
    <div className="bg-panel px-4 py-2.5 text-center text-[13px] text-muted" role="note">
      This is a demo: {parts.join(", and ")}. Everything else is the real product.{" "}
      <Link href="/judges#real-vs-simulated" className="link">See what&apos;s real</Link>
    </div>
  );
}

export function ModePill() {
  const s = useStatus();
  if (!s) return null;
  const label = s.paypalMode === "simulated" ? "PayPal simulator" : s.paypalMode === "sandbox" ? "PayPal sandbox" : "PayPal live";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted" title={`Fee mode: ${s.feeMode}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.paypalMode === "simulated" ? "bg-warn" : "bg-good"}`} aria-hidden /> {label}
    </span>
  );
}
