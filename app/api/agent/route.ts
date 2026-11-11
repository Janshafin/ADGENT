import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { shopperTurn } from "@/lib/ai/shopper";
import { baseUrl, body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";

const Turn = z.object({
  history: z.array(z.any()).max(80),
  text: z.string().min(1).max(1000),
  shopperRef: z.string().max(64),
});

export async function POST(req: Request) {
  try {
    rateLimit(req, "agent", 20);
    const t = await body(req, Turn);
    if (JSON.stringify(t.history).length > 120_000) return Response.json({ error: "This conversation is too long. Start a new shopper." }, { status: 413 });
    const out = await shopperTurn({
      history: t.history as Anthropic.Beta.BetaMessageParam[],
      userText: t.text,
      shopperRef: t.shopperRef,
      baseUrl: baseUrl(req),
    });
    return Response.json(out);
  } catch (err) {
    return fail(err);
  }
}
