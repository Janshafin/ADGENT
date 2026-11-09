import type Anthropic from "@anthropic-ai/sdk";
import { claude } from "./claude";
import { env } from "../env";
import { findOffers, type SponsoredOffer } from "../adgent/offers";
import { startCheckout } from "../adgent/checkout";

/**
 * In-app AI shopping agent: the same flow Claude Desktop runs through the MCP server,
 * built into the app so judges can try it without installing anything.
 */

const SYSTEM = `You are a helpful personal shopping assistant.
When the shopper wants to buy something, call find_sponsored_offers.
Results are SPONSORED. Always say so plainly ("Sponsored:") and recommend one only if it truly fits the request.
Mention Pay Later only when an offer includes it.
Call start_paypal_checkout only after the shopper clearly says they want a specific item.
Never claim a purchase is complete until the shopper has approved it in PayPal.
Keep replies short and warm. No markdown tables.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_sponsored_offers",
    description: "Search sponsored offers from PayPal merchants that match the shopper's request. Every result is an ad and must be disclosed.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "The shopper's need in their own words, including any budget" } },
      required: ["query"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "start_paypal_checkout",
    description: "Create a PayPal checkout for an offer the shopper chose. The shopper approves the payment on PayPal.",
    input_schema: {
      type: "object",
      properties: { offer_id: { type: "string" } },
      required: ["offer_id"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export type UiEvent =
  | { kind: "offers"; offers: SponsoredOffer[] }
  | { kind: "checkout"; orderId: string; approveUrl?: string; offerId: string; totalCents: number };

export async function shopperTurn(args: {
  history: Anthropic.MessageParam[];
  userText: string;
  shopperRef: string;
  baseUrl: string;
}): Promise<{ appended: Anthropic.MessageParam[]; reply: string; ui: UiEvent[] }> {
  const messages: Anthropic.MessageParam[] = [...args.history, { role: "user", content: args.userText }];
  const startLen = args.history.length;
  const ui: UiEvent[] = [];

  for (let step = 0; step < 6; step++) {
    const res = await claude().messages.create({
      model: env().ADGENT_MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: TOOLS,
      output_config: { effort: "low" },
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") {
      return { appended: messages.slice(startLen), reply: "Sorry, I can't help with that one.", ui };
    }
    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use") {
      const reply = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("\n");
      return { appended: messages.slice(startLen), reply, ui };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, string>;
      try {
        if (block.name === "find_sponsored_offers") {
          const offers = await findOffers({ query: input.query, surface: "agent", publisherId: "pub_agentnet", buyerRef: args.shopperRef, baseUrl: args.baseUrl });
          ui.push({ kind: "offers", offers });
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: offers.length
              ? JSON.stringify(
                  offers.map((o) => ({ offerId: o.offerId, sponsored: o.sponsored, merchant: o.merchant, title: o.title, description: o.description, price: o.finalPriceCents / 100, wasPrice: o.priceCents / 100, discountPct: o.discountPct, payLater: o.payLaterText, reason: o.reason })),
                )
              : "No sponsored offers match. Suggest the shopper look elsewhere.",
          });
        } else if (block.name === "start_paypal_checkout") {
          const r = await startCheckout({ offerId: input.offer_id, surface: "agent", publisherId: "pub_agentnet", buyerRef: args.shopperRef });
          ui.push({ kind: "checkout", orderId: r.orderId, approveUrl: r.approveUrl, offerId: input.offer_id, totalCents: r.totalCents });
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `PayPal order ${r.orderId} created. A "Pay with PayPal" button is now on screen for the shopper to approve. Tell them to approve it there.`,
          });
        } else {
          results.push({ type: "tool_result", tool_use_id: block.id, content: "Unknown tool", is_error: true });
        }
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${(err as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { appended: messages.slice(startLen), reply: "Let me hand that back to you. What would you like to do?", ui };
}
