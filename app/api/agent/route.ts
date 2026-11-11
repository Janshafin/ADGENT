import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { shopperTurn } from "@/lib/ai/shopper";
import { baseUrl, body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";

/**
 * The conversation lives in the browser, so the history is untrusted input. Only the block
 * types this agent itself produces are accepted: no images, documents or other content that
 * would turn the endpoint into a free general-purpose Claude proxy.
 */
const Text = z.string().max(8000);
const UserBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: Text }).loose(),
  z.object({ type: z.literal("tool_result"), tool_use_id: z.string().max(100) }).loose(),
]);
const AssistantBlock = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: Text }).loose(),
  z.object({ type: z.literal("tool_use"), id: z.string().max(100), name: z.enum(["find_sponsored_offers", "start_paypal_checkout"]) }).loose(),
  z.object({ type: z.literal("thinking") }).loose(),
  z.object({ type: z.literal("redacted_thinking") }).loose(),
]);
const HistoryMessage = z.union([
  z.object({ role: z.literal("user"), content: z.union([Text, z.array(UserBlock).max(10)]) }),
  z.object({ role: z.literal("assistant"), content: z.union([Text, z.array(AssistantBlock).max(10)]) }),
]);

const Turn = z.object({
  history: z.array(HistoryMessage).max(80),
  text: z.string().min(1).max(1000),
  shopperRef: z.string().max(64),
});

export async function POST(req: Request) {
  try {
    rateLimit(req, "agent", 20);
    const t = await body(req, Turn, 160 * 1024);
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
