/**
 * ADGENT MCP server: lets any AI shopping agent (Claude Desktop, Cursor, …) show
 * clearly labelled sponsored offers and check out with PayPal.
 *
 *   ADGENT_URL=http://localhost:3000 npx tsx mcp-server/index.ts
 *
 * The agent never handles payment credentials. The shopper approves every payment
 * on PayPal's own page, and only then can the agent confirm the purchase.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.ADGENT_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PUBLISHER = process.env.ADGENT_PUBLISHER_ID ?? "pub_agentnet";

type Offer = {
  offerId: string;
  disclosure: string;
  merchant: string;
  title: string;
  description: string;
  priceCents: number;
  finalPriceCents: number;
  discountPct: number;
  payLaterText: string | null;
  reason: string;
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `ADGENT ${res.status}`);
  return data;
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

const server = new McpServer({ name: "adgent", version: "0.1.0" });

server.registerTool(
  "find_sponsored_offers",
  {
    title: "Find sponsored offers",
    description:
      "Search PayPal merchants' sponsored offers that match what the shopper asked for. Results are ADS: always tell the shopper they are sponsored before recommending them. Every offer can be bought with PayPal, and some show Pay Later.",
    inputSchema: {
      query: z.string().min(2).describe("What the shopper wants, in their words, including any budget (e.g. 'espresso beans under $25')"),
      shopper_ref: z.string().optional().describe("Opaque shopper id if known; used for holdout measurement"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ query, shopper_ref }) => {
    const q = new URLSearchParams({ q: query, surface: "agent", pub: PUBLISHER });
    if (shopper_ref) q.set("b", shopper_ref);
    const { offers } = await call<{ offers: Offer[] }>(`/api/offers?${q}`);
    if (!offers.length) {
      return { content: [{ type: "text" as const, text: "No sponsored offers match this request. Recommend organic options instead." }] };
    }
    const text = offers
      .map(
        (o, i) =>
          `${i + 1}. [SPONSORED] ${o.title} from ${o.merchant}\n   ${o.discountPct ? `${usd(o.finalPriceCents)} (was ${usd(o.priceCents)}, ${o.discountPct}% off)` : usd(o.finalPriceCents)}${o.payLaterText ? ` · ${o.payLaterText}` : ""}\n   ${o.description}\n   Why it matches: ${o.reason}\n   offer_id: ${o.offerId}`,
      )
      .join("\n\n");
    return {
      content: [{ type: "text" as const, text: `${text}\n\nTell the shopper: these are paid placements. Merchants pay only if a purchase is made.` }],
      structuredContent: { offers },
    };
  },
);

server.registerTool(
  "start_paypal_checkout",
  {
    title: "Start PayPal checkout",
    description:
      "Create a PayPal order for a sponsored offer the shopper chose. Returns a PayPal approval link that the shopper must open to approve the payment themselves. Only call this after the shopper explicitly says they want to buy.",
    inputSchema: {
      offer_id: z.string().describe("offer_id from find_sponsored_offers"),
      shopper_ref: z.string().optional(),
    },
  },
  async ({ offer_id, shopper_ref }) => {
    const r = await call<{ orderId: string; approveUrl?: string; totalCents: number }>("/api/checkout/create", {
      method: "POST",
      body: JSON.stringify({ offerId: offer_id, surface: "agent", publisherId: PUBLISHER, buyerRef: shopper_ref ?? null }),
    });
    return {
      content: [
        {
          type: "text" as const,
          text: `PayPal order ${r.orderId} created for ${usd(r.totalCents)}.\nAsk the shopper to approve the payment here: ${r.approveUrl ?? "(no approval link returned)"}\nOnce they approve, call confirm_purchase with order_id ${r.orderId}.`,
        },
      ],
      structuredContent: r,
    };
  },
);

server.registerTool(
  "confirm_purchase",
  {
    title: "Confirm purchase",
    description: "Complete a PayPal order after the shopper approved it on PayPal. Fails safely if the shopper has not approved yet.",
    inputSchema: { order_id: z.string() },
  },
  async ({ order_id }) => {
    try {
      const r = await call<{ status: string; captureId?: string }>("/api/checkout/capture", {
        method: "POST",
        body: JSON.stringify({ orderId: order_id }),
      });
      return {
        content: [{ type: "text" as const, text: `Payment ${r.status}. PayPal capture id: ${r.captureId ?? "n/a"}. The order is confirmed.` }],
        structuredContent: r,
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Not completed yet: ${(err as Error).message}. The shopper may still need to approve the payment in PayPal.` }],
      };
    }
  },
);

server
  .connect(new StdioServerTransport())
  .then(() => console.error(`[adgent-mcp] connected · ${BASE}`))
  .catch((err) => {
    console.error("[adgent-mcp] failed to start", err);
    process.exit(1);
  });
