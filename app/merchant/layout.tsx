import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Merchant Copilot",
  description: "Turn your PayPal sales into ready-to-launch campaigns for AI shopping assistants. Pay only when a sale settles.",
  alternates: { canonical: "/merchant" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
