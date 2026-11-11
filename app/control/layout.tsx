import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mission Control",
  description: "Every ad dollar, live: impressions, PayPal captures, payouts, refunds and measured lift for each campaign.",
  alternates: { canonical: "/control" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
