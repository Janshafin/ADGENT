import { z } from "zod";
import { aiConfigured } from "../env";
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
  if (!aiConfigured()) {
    const q = question.toLowerCase();
    const filters: GridQuery["filters"] = [];
    for (const s of ["agent", "widget", "winback"]) if (q.includes(s)) filters.push({ column: "surface", op: "equals", value: s, valueTo: null });
    if (q.includes("sale") || q.includes("revenue") || q.includes("captur")) filters.push({ column: "type", op: "equals", value: "captured", valueTo: null });
    return {
      filters,
      groupBy: q.includes("campaign") ? ["campaignName"] : q.includes("merchant") ? ["merchantName"] : [],
      sort: { column: "ts", dir: "desc" },
      explanation: "Keyword filter (set ANTHROPIC_API_KEY for full natural-language queries).",
    };
  }
  return structured({
    system: `Translate a question about an ad attribution ledger into a grid query. Columns:\n${Object.entries(LEDGER_COLUMNS)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n")}\nRevenue questions mean type=captured. Use groupBy when the question compares categories (sum of amount and fee is shown per group).`,
    prompt: question,
    schema: GridQuery,
    effort: "low",
    maxTokens: 4000,
  });
}
