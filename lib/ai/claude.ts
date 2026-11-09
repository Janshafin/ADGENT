import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { env } from "../env";

const g = globalThis as unknown as { __anthropic?: Anthropic };

export function claude(): Anthropic {
  g.__anthropic ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY || undefined });
  return g.__anthropic;
}

/**
 * One structured call: the response is validated against `schema` by the SDK.
 * Throws if Claude refuses or the output fails validation, so callers can fall back.
 */
export async function structured<S extends z.ZodType>(args: {
  system: string;
  prompt: string;
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const res = await claude().messages.parse({
    model: env().ADGENT_MODEL,
    max_tokens: args.maxTokens ?? 16000,
    system: args.system,
    messages: [{ role: "user", content: args.prompt }],
    output_config: { effort: args.effort ?? "medium", format: zodOutputFormat(args.schema) },
  });
  if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${res.stop_details?.explanation ?? "refusal"}`);
  if (res.parsed_output == null) throw new Error(`Claude returned unparseable output (stop_reason=${res.stop_reason})`);
  return res.parsed_output as z.infer<S>;
}
