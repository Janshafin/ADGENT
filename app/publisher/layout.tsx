import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Publishers",
  description: "Add one script tag and earn a share of every sale your readers make, paid out through PayPal.",
  alternates: { canonical: "/publisher" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
