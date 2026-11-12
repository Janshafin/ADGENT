import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content Security Policy. Next.js inlines its bootstrap scripts, so script-src needs
 * 'unsafe-inline' without per-request nonces (which would make every page dynamic).
 * Everything else is locked to this origin: no third-party scripts, no framing, no plugins.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  // No upgrade-insecure-requests: it makes browsers fetch scripts and styles over https even
  // when the site is opened over plain http (a LAN address, or Safari on localhost), which
  // leaves the page unstyled and dead. Render serves https only, and HSTS keeps browsers there.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=(), browsing-topics=()" },
  // Keeps window.opener away from other sites, but still lets PayPal open its approval popup.
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/**
 * HSTS only on requests that really arrived over https (Render's proxy sets x-forwarded-proto).
 * Sent over plain http, Safari still remembers it for localhost and then refuses to open the
 * local server at all, which looks like the site crashed.
 */
const hsts = { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" };

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev only: without these, opening the dev server at 127.0.0.1 or a LAN IP (e.g. on a phone)
  // blocks its scripts, so pages render but never become interactive.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/:path*", has: [{ type: "header", key: "x-forwarded-proto", value: "https" }], headers: [hsts] },
      // API responses are data, never pages: don't index them or let a browser sniff them as HTML.
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }, { key: "Cache-Control", value: "no-store" }] },
      // The widget is embedded on publishers' sites, so other origins must be able to load it.
      { source: "/widget.js", headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }, { key: "Cache-Control", value: "public, max-age=300" }] },
    ];
  },
};

export default nextConfig;
