import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ModeBanner, ModePill } from "@/components/ModeBanner";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

// SF Pro on Apple devices via the system font stack; Inter is the fallback everywhere else.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "ADGENT: PayPal Ads for the AI-shopping era", template: "%s | ADGENT" },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: ["PayPal", "AI shopping", "agentic commerce", "pay per sale ads", "retail media", "AI agents", "publisher monetization", "MCP"],
  authors: [{ name: "ADGENT" }],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: "/",
    title: "ADGENT: PayPal Ads for the AI-shopping era",
    description: "Pay-per-sale product discovery for AI shopping agents, settled end to end on PayPal.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "ADGENT: PayPal Ads for the AI-shopping era",
    description: "Pay-per-sale product discovery for AI shopping agents, settled on PayPal.",
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" };

const NAV = [
  { href: "/merchant", label: "Merchants" },
  { href: "/agent", label: "Shop with AI" },
  { href: "/control", label: "Mission Control" },
  { href: "/publisher", label: "Publishers" },
  { href: "/judges", label: "Tour" },
];

const FOOTER = [
  { title: "Explore", links: [["Merchant Copilot", "/merchant"], ["Shop with AI", "/agent"], ["Mission Control", "/control"], ["Publishers", "/publisher"]] },
  { title: "Learn", links: [["Take the tour", "/judges"], ["What's real", "/judges#real-vs-simulated"], ["Publisher demo site", "/demo/blog"]] },
  { title: "Project", links: [["Source code", "https://github.com/Janshafin/ADGENT"], ["MIT license", "https://github.com/Janshafin/ADGENT/blob/main/LICENSE"], ["System status", "/api/health"]] },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="sticky top-0 z-40 bg-[var(--nav-bg)] backdrop-blur-xl supports-[not(backdrop-filter:blur(1px))]:bg-[#fbfbfd]">
          <nav aria-label="Main" className="mx-auto flex h-11 max-w-[1024px] items-center justify-between gap-6 px-4 text-xs sm:px-6">
            <Link href="/" className="flex flex-none items-center gap-1.5 text-sm font-semibold tracking-tight" aria-label="ADGENT home">
              <Mark />
              ADGENT
            </Link>
            <div className="flex min-w-0 flex-1 items-center gap-6 overflow-x-auto sm:justify-center sm:gap-9">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap text-text/80 transition-colors hover:text-text">
                  {n.label}
                </Link>
              ))}
            </div>
            <span className="hidden flex-none md:inline-flex">
              <ModePill />
            </span>
          </nav>
        </header>
        <ModeBanner />
        <main id="main" className="flex-1">{children}</main>
        <footer className="bg-panel text-xs text-muted">
          <div className="mx-auto max-w-[1024px] px-4 py-10 sm:px-6">
            <p className="border-b border-line pb-4 leading-relaxed">
              ADGENT was built for the PayPal AI Hackathon 2026. Payments use PayPal&apos;s REST APIs: Orders, Payments, Payouts, Invoicing and
              Webhooks. The cross-merchant purchase history in this demo is simulated, and without sandbox keys payments run on a built-in
              PayPal simulator.
            </p>
            <div className="grid grid-cols-2 gap-8 py-6 sm:grid-cols-3">
              {FOOTER.map((col) => (
                <div key={col.title}>
                  <h3 className="mb-2 font-semibold text-text">{col.title}</h3>
                  <ul className="space-y-2">
                    {col.links.map(([label, href]) => (
                      <li key={href}>
                        {href.startsWith("http") ? (
                          <a href={href} className="hover:text-text hover:underline">{label}</a>
                        ) : (
                          <Link href={href} className="hover:text-text hover:underline">{label}</Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="border-t border-line pt-4">Copyright © 2026 ADGENT. MIT licensed.</p>
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
