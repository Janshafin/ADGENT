"use client";

import Link from "next/link";
import { useStatus } from "@/lib/client/api";

/** Apple-style ribbon under the nav: says plainly what is real on this deployment. */
export function ModeBanner() {
  const s = useStatus();
  if (!s || (s.paypalMode !== "simulated" && s.ai)) return null;
  const parts = [
    s.paypalMode === "simulated" ? "payments run on a PayPal simulator, so no money moves" : null,
    !s.ai ? "the shopping agent runs in offline mode, without an AI model" : null,
  ].filter(Boolean);
  return (
    <div className="bg-panel px-4 py-3 text-center text-sm text-text/80" role="note">
      Demo mode: {parts.join(", and ")}.{" "}
      <Link href="/judges#real-vs-simulated" className="link whitespace-nowrap">See what&apos;s real &gt;</Link>
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
