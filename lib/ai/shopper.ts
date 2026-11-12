import type Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { claude, FALLBACK_BETA } from "./claude";
import { UNTRUSTED_RULE, wrapUntrusted } from "./untrusted";
import { env } from "../env";
import { aiAvailable } from "./budget";
import { db, schema } from "../db";
import { findOffers, heldOutMatches, type SponsoredOffer } from "../adgent/offers";
import { startCheckout } from "../adgent/checkout";
import { usd } from "../util";

/**
 * In-app AI shopping agent: the same flow Claude Desktop runs through the MCP server,
 * built into the app so judges can try it without installing anything.
 * Without an Anthropic key, a rule-based agent runs the same tools so the demo still works.
 */

type Msg = Anthropic.Beta.BetaMessageParam;

const SYSTEM = `You are a helpful personal shopping assistant inside ADGENT's demo.
When the shopper wants to buy something, call find_sponsored_offers.
Results are SPONSORED. Always say so plainly ("Sponsored:") and recommend one only if it truly fits the request.
Mention Pay Later only when an offer includes it.
Call start_paypal_checkout only after the shopper clearly says they want a specific item, using an offer_id from find_sponsored_offers.
Never claim a purchase is complete until the shopper has approved it in PayPal.
Keep replies short and warm: two or three sentences. No markdown tables or headings.
${UNTRUSTED_RULE}`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
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

export type TurnResult = { appended: Msg[]; reply: string; ui: UiEvent[]; mode: "claude" | "offline" };

type TurnArgs = { history: Msg[]; userText: string; shopperRef: string; baseUrl: string };

/** Offer ids this conversation has actually shown the shopper. Checkout is limited to these. */
export function shownOfferIds(messages: Msg[]): Set<string> {
  const ids = new Set<string>();
  const text = JSON.stringify(messages);
  for (const m of text.matchAll(/offerId\\?":\\?"([a-z0-9_]+:[a-z0-9_]+)/gi)) ids.add(m[1]);
  for (const m of text.matchAll(/<!--offers:([^>]*)-->/g)) for (const id of m[1].split(",")) if (id) ids.add(id);
  return ids;
}

function offerSummary(o: SponsoredOffer) {
  return {
    offerId: o.offerId,
    sponsored: true,
    merchant: o.merchant,
    title: o.title,
    description: o.description,
    price: o.finalPriceCents / 100,
    wasPrice: o.priceCents / 100,
    discountPct: o.discountPct,
    payLater: o.payLaterText,
    reason: o.reason,
  };
}

export async function shopperTurn(args: TurnArgs): Promise<TurnResult> {
  return aiAvailable() ? claudeTurn(args) : offlineTurn(args);
}

async function claudeTurn(args: TurnArgs): Promise<TurnResult> {
  const messages: Msg[] = [...args.history, { role: "user", content: args.userText }];
  const startLen = args.history.length;
  const ui: UiEvent[] = [];

  for (let step = 0; step < 6; step++) {
    const res = await claude().beta.messages.create({
      model: env().ADGENT_MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      output_config: { effort: "low" },
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason === "refusal") {
      return { appended: messages.slice(startLen), reply: "Sorry, I can't help with that one.", ui, mode: "claude" };
    }
    if (res.stop_reason === "pause_turn") continue;
    if (res.stop_reason !== "tool_use") {
      const reply = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n");
      return { appended: messages.slice(startLen), reply, ui, mode: "claude" };
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type !== "tool_use") continue;
      const input = block.input as Record<string, unknown>;
      try {
        if (block.name === "find_sponsored_offers" && typeof input.query === "string") {
          const offers = await findOffers({ query: input.query.slice(0, 300), surface: "agent", publisherId: "pub_agentnet", buyerRef: args.shopperRef, baseUrl: args.baseUrl });
          ui.push({ kind: "offers", offers });
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: offers.length
              ? wrapUntrusted(offers.map(offerSummary))
              : (await heldOutMatches(input.query, args.shopperRef))
                ? "No offers shown: this shopper is in the 10% holdout group that never sees these ads, which is how ADGENT measures real lift. Explain that briefly and suggest pressing New shopper to try as someone else."
                : "No sponsored offers match. Suggest the shopper look elsewhere.",
          });
        } else if (block.name === "start_paypal_checkout" && typeof input.offer_id === "string") {
          // Structural guard: only offers this shopper was shown can be bought, whatever any text says.
          if (!shownOfferIds(messages).has(input.offer_id)) {
            results.push({ type: "tool_result", tool_use_id: block.id, content: "That offer was not shown to the shopper. Search first, then let them choose.", is_error: true });
            continue;
          }
          const r = await startCheckout({ offerId: input.offer_id, surface: "agent", publisherId: "pub_agentnet", buyerRef: args.shopperRef });
          ui.push({ kind: "checkout", orderId: r.orderId, approveUrl: r.approveUrl, offerId: input.offer_id, totalCents: r.totalCents });
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `PayPal order ${r.orderId} created for ${usd(r.totalCents)}. A "Pay with PayPal" button is now on screen for the shopper to approve. Tell them to approve it there.`,
          });
        } else {
          results.push({ type: "tool_result", tool_use_id: block.id, content: "Unknown tool or bad input", is_error: true });
        }
      } catch (err) {
        results.push({ type: "tool_result", tool_use_id: block.id, content: `Error: ${(err as Error).message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { appended: messages.slice(startLen), reply: "Let me hand that back to you. What would you like to do?", ui, mode: "claude" };
}

// ── Offline agent (no ANTHROPIC_API_KEY) ───────────────────────────────────

const ORDINALS: Record<string, number> = { first: 0, "1st": 0, second: 1, "2nd": 1, third: 2, "3rd": 2 };

/** Words that carry no product meaning in a buying message ("I'll take that one, please"). */
const FILLER = new Set(
  "i ll im the a an to me my it its that this those these one ones please can could you would like want wanna need get got take buy order purchase checkout check out have go with for and now then look at okay ok yes sure hmm something just also instead some any them of on in really lets let us do show find search item thing".split(" "),
);

/** Does the message name something that none of the shown offers is ("I want the gym shoes")? */
export function namesSomethingElse(text: string, offers: { title: string }[]): boolean {
  const titles = offers.map((o) => o.title.toLowerCase()).join(" ");
  return (text.toLowerCase().match(/[a-z]{3,}/g) ?? []).some((w) => !FILLER.has(w) && !titles.includes(w.replace(/s$/, "")));
}

/** Which shown offer does "I'll take the second one" / "buy the decaf" mean? */
export function pickOffer(text: string, offers: { offerId: string; title: string }[]): string | null {
  if (!offers.length) return null;
  const t = text.toLowerCase();
  // A full product name wins over any digit inside it ("Subscription (2 bags)" is not "the second one").
  const named = offers.find((o) => o.title && t.includes(o.title.toLowerCase()));
  if (named) return named.offerId;
  for (const [word, i] of Object.entries(ORDINALS)) if (new RegExp(`\\b${word}\\b`).test(t) && offers[i]) return offers[i].offerId;
  const num = /#?\b([1-3])\b/.exec(t);
  if (num && offers[Number(num[1]) - 1]) return offers[Number(num[1]) - 1].offerId;
  const words = t.match(/[a-z]{4,}/g) ?? [];
  const scored = offers.map((o) => ({ o, hits: words.filter((w) => o.title.toLowerCase().includes(w)).length })).sort((a, b) => b.hits - a.hits);
  if (scored[0].hits > 0) return scored[0].o.offerId;
  // "Buy the gym shoes" after coffee was shown is a new request, not a pick from the old list.
  if (namesSomethingElse(text, offers)) return null;
  return offers.length === 1 || /\b(it|that|this)\b/.test(t) ? offers[0].offerId : null;
}

const BUY = /\b(buy|get it|get the|take|order|purchase|checkout|check out|i'?ll have|go with|want (it|that|the))\b/i;
const PAID = /approved the payment for order ([A-Z0-9-]+)/i;

async function offlineTurn(args: TurnArgs): Promise<TurnResult> {
  const ui: UiEvent[] = [];
  const say = (reply: string, memo = ""): TurnResult => ({
    appended: [
      { role: "user", content: args.userText },
      { role: "assistant", content: memo ? `${reply}\n${memo}` : reply },
    ],
    reply,
    ui,
    mode: "offline",
  });

  const paid = PAID.exec(args.userText);
  if (paid) {
    const [o] = await db().select().from(schema.orders).where(eq(schema.orders.id, paid[1]));
    if (o && (o.status === "captured" || o.status === "settled")) {
      return say(`Payment confirmed by PayPal (capture ${o.captureId}). Your order is on its way. The merchant only paid an ad fee because you bought.`);
    }
    return say("I don't see that payment as completed yet. Approve it in the PayPal box above and I'll confirm.");
  }

  const lastShown = [...args.history]
    .reverse()
    .map((m) => (typeof m.content === "string" ? /<!--offers:([^>]*)-->/.exec(m.content)?.[1] : undefined))
    .find(Boolean);
  if (lastShown && BUY.test(args.userText)) {
    const ids = lastShown.split(",");
    const titles = await Promise.all(
      ids.map(async (offerId) => {
        const [, productId] = offerId.split(":");
        const [p] = await db().select({ title: schema.products.title }).from(schema.products).where(eq(schema.products.id, productId));
        return { offerId, title: p?.title ?? "" };
      }),
    );
    const chosen = pickOffer(args.userText, titles);
    if (chosen) {
      const r = await startCheckout({ offerId: chosen, surface: "agent", publisherId: "pub_agentnet", buyerRef: args.shopperRef });
      ui.push({ kind: "checkout", orderId: r.orderId, approveUrl: r.approveUrl, offerId: chosen, totalCents: r.totalCents });
      const title = titles.find((x) => x.offerId === chosen)?.title ?? "your pick";
      return say(`Great choice. I created a PayPal order for ${title} at ${usd(r.totalCents)}. Approve it with PayPal below. Nothing is charged until you do.`, `<!--offers:${lastShown}-->`);
    }
    // A message naming something new falls through to a fresh search below; only a vague one gets "which one?".
    if (!namesSomethingElse(args.userText, titles)) {
      return say("Which one would you like? You can say \"the first one\" or name it.", `<!--offers:${lastShown}-->`);
    }
  }

  const offers = await findOffers({ query: args.userText.slice(0, 300), surface: "agent", publisherId: "pub_agentnet", buyerRef: args.shopperRef, baseUrl: args.baseUrl });
  if (!offers.length && (await heldOutMatches(args.userText, args.shopperRef))) {
    return say(
      "You're in this campaign's holdout group: 10% of shoppers never see its ads, so ADGENT can measure the sales the ads really cause. Press New shopper to try as someone else.",
    );
  }
  if (!offers.length) {
    return say("I couldn't find a sponsored offer that fits. The merchants advertising right now sell coffee, brewing gear, baked goods, tea and outdoor gear. Try something like \"espresso beans under $25\" or \"a gift for a tea lover\".");
  }
  ui.push({ kind: "offers", offers });
  const lines = offers.map((o, i) => `${i + 1}. ${o.title} from ${o.merchant}, ${usd(o.finalPriceCents)}${o.discountPct ? ` (${o.discountPct}% off)` : ""}`);
  return say(
    `Sponsored: here's what fits.\n${lines.join("\n")}\nThese are paid placements; the merchant pays only if you buy. Want one? Say "the first one" or name it.`,
    `<!--offers:${offers.map((o) => o.offerId).join(",")}-->`,
  );
}
