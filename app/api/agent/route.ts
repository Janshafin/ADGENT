import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { shopperTurn } from "@/lib/ai/shopper";
import { aiConfigured } from "@/lib/env";
import { baseUrl, body, fail } from "@/lib/http";

const Turn = z.object({
  history: z.array(z.any()).max(80),
  text: z.string().min(1).max(1000),
  shopperRef: z.string().max(64),
});

export async function POST(req: Request) {
  try {
    if (!aiConfigured()) return Response.json({ error: "Set ANTHROPIC_API_KEY to use the shopping agent" }, { status: 503 });
    const t = await body(req, Turn);
    const out = await shopperTurn({
      history: t.history as Anthropic.MessageParam[],
      userText: t.text,
      shopperRef: t.shopperRef,
      baseUrl: baseUrl(req),
    });
    return Response.json(out);
  } catch (err) {
    return fail(err);
  }
}
