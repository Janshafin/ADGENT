import type { NextRequest } from "next/server";
import { ledgerSince } from "@/lib/adgent/ledger";

/**
 * Server-Sent Events: tails the append-only ledger table.
 * Polling the DB (not an in-memory bus) keeps this correct across multiple instances.
 */
export async function GET(req: NextRequest) {
  let lastId = Number(req.nextUrl.searchParams.get("after") ?? 0);
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    start(controller) {
      const tick = async () => {
        if (req.signal.aborted) return;
        try {
          const rows = await ledgerSince(lastId);
          if (rows.length) {
            lastId = rows[rows.length - 1].id;
            controller.enqueue(enc.encode(`event: rows\ndata: ${JSON.stringify(rows)}\n\n`));
          } else {
            controller.enqueue(enc.encode(`: keepalive\n\n`));
          }
        } catch (err) {
          console.error("[adgent] ledger stream", err);
        }
        timer = setTimeout(tick, 1000);
      };
      req.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        try { controller.close(); } catch {}
      });
      void tick();
    },
    cancel() {
      clearTimeout(timer);
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
