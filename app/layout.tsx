import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ADGENT · PayPal Ads for the AI-shopping era",
  description: "Pay-per-sale ads for small merchants, shown inside AI shopping agents and settled on PayPal.",
};

const NAV = [
  { href: "/merchant", label: "Merchant Copilot" },
  { href: "/control", label: "Mission Control" },
  { href: "/agent", label: "Agent Demo" },
  { href: "/demo/blog", label: "Publisher Demo" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/80 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-pp text-sm font-black text-white">A</span>
              ADGENT
              <span className="hidden text-xs font-normal text-muted sm:inline">for PayPal</span>
            </Link>
            <div className="flex flex-1 items-center gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-full px-3 py-1.5 text-muted hover:bg-panel-2 hover:text-text">
                  {n.label}
                </Link>
              ))}
            </div>
            <span className="pill hidden md:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-good" /> PayPal sandbox
            </span>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
