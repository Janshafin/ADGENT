import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Cross-site request forgery guard for the API. A browser always sends Origin (or
 * Sec-Fetch-Site) on a cross-site POST, so a state-changing request from another site is
 * refused here before any route runs. Server-to-server callers (PayPal webhooks, the MCP
 * server, curl) send neither header and are unaffected; webhooks are verified by signature.
 */
export function proxy(req: NextRequest) {
  // A path with broken percent-encoding is a malformed request, not a server error.
  try {
    decodeURIComponent(req.nextUrl.pathname);
  } catch {
    return NextResponse.json({ error: "Malformed URL" }, { status: 400 });
  }
  if (SAFE_METHODS.has(req.method) || req.nextUrl.pathname.startsWith("/api/webhooks/")) return NextResponse.next();

  if (req.headers.get("sec-fetch-site") === "cross-site") return forbidden();
  const origin = req.headers.get("origin");
  if (origin && origin !== "null") {
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return forbidden();
    }
    const allowed = new Set([req.headers.get("host"), req.nextUrl.host]);
    for (const u of [process.env.APP_URL, process.env.RENDER_EXTERNAL_URL]) {
      try {
        if (u) allowed.add(new URL(u).host);
      } catch {}
    }
    if (!allowed.has(host)) return forbidden();
  } else if (origin === "null") {
    return forbidden();
  }
  return NextResponse.next();
}

function forbidden() {
  return NextResponse.json({ error: "Cross-site requests are not allowed" }, { status: 403 });
}

export const config = { matcher: "/api/:path*" };
