import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Shop with AI",
  description: "Chat with an AI shopping assistant that shows clearly labelled sponsored offers and checks out with PayPal.",
  alternates: { canonical: "/agent" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
