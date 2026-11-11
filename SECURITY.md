# Security

How ADGENT is defended when it runs on the public internet (for example the Render blueprint), written from the attacker's side.

## Reporting

Please open a private security advisory on GitHub (Security → Report a vulnerability) rather than a public issue.

## What an attacker can reach

Every page and every `/api/*` route is public: there are no user accounts. That is deliberate for a hackathon demo, so the defences focus on what a stranger could do with that access.

| Attack | Defence | Where |
| --- | --- | --- |
| Move money: payouts, refunds, invoices, fee or budget edits | Need the `ADMIN_TOKEN` bearer token (constant-time compare, 24+ chars, fails closed) once real PayPal keys are set. In simulated mode nothing real moves, so judges can try them. | `lib/auth/admin.ts` |
| Forge a PayPal webhook | Signature verified with PayPal's API; unverified or unconfigured means rejected. Event ids de-duplicated. | `app/api/webhooks/paypal/route.ts` |
| Cross-site request forgery (a malicious page posting to our API from a visitor's browser) | `proxy.ts` refuses any non-GET API request whose `Origin` or `Sec-Fetch-Site` says another site. Bodies must be `application/json`, which forces a CORS preflight we never grant. | `proxy.ts`, `lib/http/index.ts` |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. | `next.config.ts` |
| Cross-site scripting through advertiser text | React escapes all output; the embeddable widget escapes every field and only links to checkout pages on its own origin; the CSP allows scripts only from this origin. | `public/widget.js`, `next.config.ts` |
| Prompt injection through ad copy | Ad text is cleaned, wrapped as untrusted data, ranked down if it tries to steer the agent; the agent can only check out offers it showed, and the shopper approves every payment on PayPal. | `lib/ai/untrusted.ts`, `lib/ai/shopper.ts` |
| Use the shopping agent as a free Claude proxy | Chat history is validated: only text, tool calls and tool results this agent produces; no images or documents; size and length capped. | `app/api/agent/route.ts` |
| Run up the Anthropic bill from many IPs | Global hourly cap (`AI_MAX_CALLS_PER_HOUR`, default 300). Past it, every AI feature falls back to its offline path until the hour resets. | `lib/ai/budget.ts` |
| Dodge rate limits with a fake `X-Forwarded-For` | On Render the limiter reads Cloudflare's `True-Client-IP`; elsewhere the last forwarded hop (the one our own proxy added). `CLIENT_IP_HEADER` overrides. | `lib/http/rate-limit.ts` |
| Exhaust memory with huge requests | JSON bodies capped at 32 KB (160 KB for the chat history). | `lib/http/index.ts` |
| Tie up the database with live-ledger streams | At most 4 open streams per IP and 200 in total; each closes after 10 minutes and resumes from `Last-Event-ID`. | `app/api/ledger/stream/route.ts` |
| Point PayPal return links at another site with a forged `Host` header | Links are built from `APP_URL` (or Render's `RENDER_EXTERNAL_URL`), never from request headers. | `lib/http/index.ts` |
| SQL injection | Every query goes through Drizzle with bound parameters; the "ask your ads" feature returns grid filters, never SQL. | `lib/db`, `lib/ai/ask.ts` |
| Harvest personal data | Public APIs never return PayPal emails, merchant ids, buyer names or buyer emails. Audiences are exposed as sizes only. | `app/api/merchants`, `app/api/orders`, `app/api/merchants/[id]/insights` |
| Learn internals from error messages | In production a 500 says only "Something went wrong"; the details go to the server log. | `lib/http/index.ts` |
| Vandalise the public demo by pausing every campaign | In simulated mode only, seeded campaigns that stay paused for 15 minutes are switched back on. | `lib/adgent/worker.ts` (`demoUpkeep`) |
| Known-vulnerable dependencies | `npm audit --omit=dev` reports 0 vulnerabilities. | `package.json` |

## Security headers

Every response carries `Content-Security-Policy`, `Strict-Transport-Security` (production), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, USB and topics off) and `Cross-Origin-Opener-Policy: same-origin-allow-popups`. API responses add `Cache-Control: no-store` and `X-Robots-Tag: noindex`, and `X-Powered-By` is removed.

## Known limits

- `script-src` allows `'unsafe-inline'` because Next.js inlines its bootstrap scripts; per-request nonces would make every page dynamic. All other sources are locked to this origin.
- Rate limits and the AI budget are kept in memory, which is right for the single always-on Render instance. Running more than one instance would need a shared store.
- Anyone can launch campaigns (within the demo caps). A production version would put merchant actions behind PayPal login ("Log in with PayPal").
- Secrets live only in host environment variables; `.env` is git-ignored and never committed.
