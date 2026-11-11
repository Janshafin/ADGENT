import type { NextRequest } from "next/server";
import { ledgerSince } from "@/lib/adgent/ledger";
import { clientIp } from "@/lib/http/rate-limit";

/** Each open stream polls the database once a second, so open streams are capped. */
const MAX_PER_IP = 4;
const MAX_TOTAL = 200;
/** Streams end after 10 minutes; EventSource reconnects on its own with the latest cursor. */
const MAX_LIFETIME_MS = 10 * 60_000;
const g = globalThis as unknown as { __adgentStreams?: Map<string, number> };

/**
 * Server-Sent Events: tails the append-only ledger table.
 * Polling the DB (not an in-memory bus) keeps this correct across multiple instances.
 */
export async function GET(req: NextRequest) {
  // On reconnect the browser sends Last-Event-ID, so the stream resumes instead of replaying.
  const after = Number(req.headers.get("last-event-id") ?? req.nextUrl.searchParams.get("after") ?? 0);
  let lastId = Number.isSafeInteger(after) && after >= 0 ? after : 0;

  const open = (g.__adgentStreams ??= new Map());
  const ip = clientIp(req);
  const total = [...open.values()].reduce((a, n) => a + n, 0);
  if ((open.get(ip) ?? 0) >= MAX_PER_IP || total >= MAX_TOTAL) {
    return Response.json({ error: "Too many live connections" }, { status: 429, headers: { "Retry-After": "30" } });
  }
  open.set(ip, (open.get(ip) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const n = (open.get(ip) ?? 1) - 1;
    if (n > 0) open.set(ip, n);
    else open.delete(ip);
  };

  const enc = new TextEncoder();
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const end = () => {
        clearTimeout(timer);
        release();
        try { controller.close(); } catch {}
      };
      const tick = async () => {
        if (req.signal.aborted) return;
        if (Date.now() - startedAt > MAX_LIFETIME_MS) return end();
        try {
          const rows = await ledgerSince(lastId);
          if (rows.length) {
            lastId = rows[rows.length - 1].id;
            controller.enqueue(enc.encode(`id: ${lastId}\nevent: rows\ndata: ${JSON.stringify(rows)}\n\n`));
          } else {
            controller.enqueue(enc.encode(`: keepalive\n\n`));
          }
        } catch (err) {
          console.error("[adgent] ledger stream", err);
        }
        timer = setTimeout(tick, 1000);
      };
      req.signal.addEventListener("abort", end);
      void tick();
    },
    cancel() {
      clearTimeout(timer);
      release();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
