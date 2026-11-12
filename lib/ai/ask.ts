import { z } from "zod";
import { aiAvailable } from "./budget";
import { structured } from "./claude";

/** Columns the Mission Control ledger grid exposes to natural-language queries. */
export const LEDGER_COLUMNS = {
  ts: "event time (ISO)",
  type: "event type: campaign_launched | campaign_paused | impression | click | order_created | captured | fee_collected | payout_sent | refunded | invoice_sent",
  campaignName: "campaign name",
  merchantName: "merchant name",
  surface: "where the ad ran: agent | widget | winback",
  publisherName: "publisher that hosted the ad",
  amount: "sale amount in USD (number)",
  fee: "ad fee in USD (number)",
  paypalRef: "PayPal order/capture/payout id",
} as const;

const Filter = z.object({
  column: z.enum(Object.keys(LEDGER_COLUMNS) as [keyof typeof LEDGER_COLUMNS, ...(keyof typeof LEDGER_COLUMNS)[]]),
  op: z.enum(["equals", "notEqual", "contains", "greaterThan", "lessThan", "inRange"]),
  value: z.union([z.string(), z.number()]),
  valueTo: z.union([z.string(), z.number()]).nullable(),
});

const GridQuery = z.object({
  filters: z.array(Filter).describe("AND-combined column filters"),
  groupBy: z.array(z.enum(["campaignName", "merchantName", "surface", "type", "publisherName"])).max(2),
  sort: z.object({ column: z.enum(["ts", "amount", "fee"]), dir: z.enum(["asc", "desc"]) }).nullable(),
  explanation: z.string().max(200).describe("One sentence describing what the grid now shows"),
});

export type GridQuery = z.infer<typeof GridQuery>;

export async function askLedger(question: string): Promise<GridQuery> {
  if (!aiAvailable()) return keywordQuery(question);
  try {
    return await structured({
      system: `Translate a question about an ad attribution ledger into a grid query. Columns:\n${Object.entries(LEDGER_COLUMNS)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")}\nRevenue questions mean type=captured. Use groupBy when the question compares categories (sum of amount and fee is shown per group).`,
      prompt: question,
      schema: GridQuery,
      tier: "fast",
      effort: "low",
      maxTokens: 4000,
    });
  } catch (err) {
    // Same answer path as having no key, so the grid still filters.
    console.error("[adgent] ledger question fell back to keywords:", err);
    return keywordQuery(question);
  }
}

const EVENT_WORDS: [RegExp, GridQuery["filters"][number]["value"], string][] = [
  [/refund/, "refunded", "refunds"],
  [/payout|paid out/, "payout_sent", "payouts"],
  [/invoice/, "invoice_sent", "invoices"],
  [/\b(ad )?fees?\b/, "fee_collected", "ad fees"],
  [/click/, "click", "clicks"],
  [/impression/, "impression", "impressions"],
  [/sale|revenue|captur|sold|bought|made the most/, "captured", "sales"],
];
const SURFACE_WORDS: [RegExp, string, string][] = [
  [/agent|assistant|\bai\b/, "agent", "AI assistants"],
  [/widget|publisher site|blog/, "widget", "publisher sites"],
  [/win-?back/, "winback", "win-back links"],
];
const GROUP_WORDS: [RegExp, GridQuery["groupBy"][number], string][] = [
  [/(by|per|each|which) surface/, "surface", "surface"],
  [/(by|per|each|which) campaign/, "campaignName", "campaign"],
  [/(by|per|each|which) merchant/, "merchantName", "merchant"],
  [/(by|per|each|which) publisher/, "publisherName", "publisher"],
];

/** Offline answer: the common questions (event, surface, amount, grouping) read from keywords, no model call. */
export function keywordQuery(question: string): GridQuery {
  const q = question.toLowerCase();
  const filters: GridQuery["filters"] = [];
  const said: string[] = [];

  const event = EVENT_WORDS.find(([re]) => re.test(q));
  if (event) filters.push({ column: "type", op: "equals", value: event[1], valueTo: null });
  said.push(event ? event[2] : "every event");

  const surface = SURFACE_WORDS.find(([re]) => re.test(q));
  if (surface) {
    filters.push({ column: "surface", op: "equals", value: surface[1], valueTo: null });
    said.push(`from ${surface[2]}`);
  }

  const column = event?.[1] === "fee_collected" ? "fee" : "amount";
  const over = /(?:over|above|more than|at least|>)\s*\$?(\d+(?:\.\d+)?)/.exec(q);
  const under = /(?:under|below|less than|at most|<)\s*\$?(\d+(?:\.\d+)?)/.exec(q);
  if (over) {
    filters.push({ column, op: "greaterThan", value: Number(over[1]), valueTo: null });
    said.push(`over $${over[1]}`);
  }
  if (under) {
    filters.push({ column, op: "lessThan", value: Number(under[1]), valueTo: null });
    said.push(`under $${under[1]}`);
  }

  const group = GROUP_WORDS.find(([re]) => re.test(q));
  if (group) said.push(`totalled by ${group[2]}`);

  return {
    filters,
    groupBy: group ? [group[1]] : [],
    sort: { column: /most|top|highest|largest|biggest/.test(q) ? column : "ts", dir: "desc" },
    explanation: `Showing ${said.join(", ")}. Matched by keyword, because no AI model is connected on this deployment.`,
  };
}
