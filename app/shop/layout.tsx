import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete a purchase with PayPal.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
