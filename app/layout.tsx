import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ModeBanner, ModePill } from "@/components/ModeBanner";
import "./globals.css";

// SF Pro on Apple devices via the system font stack; Inter is the fallback everywhere else.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "ADGENT: PayPal Ads for the AI-shopping era", template: "%s | ADGENT" },
  description: "Pay-per-sale ads for small merchants, shown inside AI shopping agents and settled on PayPal.",
  openGraph: {
    title: "ADGENT: PayPal Ads for the AI-shopping era",
    description: "When AI does the shopping, who sees the ads? Pay-per-sale ads inside AI agents, settled end to end on PayPal.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

const NAV = [
  { href: "/merchant", label: "Merchants" },
  { href: "/agent", label: "Shop with AI" },
  { href: "/control", label: "Mission Control" },
  { href: "/publisher", label: "Publishers" },
  { href: "/judges", label: "Tour" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--nav-bg)] backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-bg">
          <nav aria-label="Main" className="mx-auto flex h-12 max-w-[1200px] items-center gap-6 px-4 text-[13px] sm:px-6">
            <Link href="/" className="flex flex-none items-center gap-1.5 text-[15px] font-semibold tracking-tight">
              <Mark />
              ADGENT
            </Link>
            <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap text-text/80 transition-colors hover:text-text">
                  {n.label}
                </Link>
              ))}
            </div>
            <span className="hidden md:inline-flex">
              <ModePill />
            </span>
          </nav>
        </header>
        <ModeBanner />
        <main id="main" className="flex-1">{children}</main>
        <footer className="bg-panel">
          <div className="mx-auto max-w-[1200px] px-4 py-8 text-xs text-muted sm:px-6">
            <p>
              ADGENT was built for the PayPal AI Hackathon 2026 and is MIT licensed. Payments use PayPal&apos;s REST APIs; the cross-merchant
              purchase history is simulated demo data.
            </p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4">
              <Link href="/judges" className="hover:text-text">How it works</Link>
              <Link href="/demo/blog" className="hover:text-text">Publisher demo site</Link>
              <a href="/api/health" className="hover:text-text">System status</a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function Mark() {
  // Two overlapping rounded squares: a sale and the ad that earned it.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="flex-none">
      <rect x="1" y="1" width="11" height="11" rx="3.2" fill="var(--pp-blue)" />
      <rect x="6" y="6" width="11" height="11" rx="3.2" fill="var(--pp-navy)" opacity="0.85" />
    </svg>
  );
}
