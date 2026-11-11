import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { env } from "../env";

const g = globalThis as unknown as { __anthropic?: Anthropic };

export function claude(): Anthropic {
  g.__anthropic ??= new Anthropic({ apiKey: env().ANTHROPIC_API_KEY || undefined, timeout: 90_000, maxRetries: 2 });
  return g.__anthropic;
}

/** Server-side refusal fallback for the strategy model: a declined request re-runs on a fallback model in the same call. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * One structured call: the response is validated against `schema` by the SDK.
 * "strategy" work runs on ADGENT_MODEL (Opus) with refusal fallbacks; "fast" work on ADGENT_MODEL_FAST (Haiku).
 * Throws on refusal or invalid output, so callers can fall back to heuristics.
 */
export async function structured<S extends z.ZodType>(args: {
  system: string;
  prompt: string;
  schema: S;
  tier?: "strategy" | "fast";
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const e = env();
  // The system prompt is identical across calls, so cache it.
  const system = [{ type: "text" as const, text: args.system, cache_control: { type: "ephemeral" as const } }];
  const messages = [{ role: "user" as const, content: args.prompt }];

  if (args.tier === "fast") {
    const res = await claude().messages.parse({
      model: e.ADGENT_MODEL_FAST,
      max_tokens: args.maxTokens ?? 8000,
      system,
      messages,
      output_config: { effort: args.effort ?? "low", format: zodOutputFormat(args.schema) },
    });
    if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${res.stop_details?.explanation ?? "refusal"}`);
    if (res.parsed_output == null) throw new Error(`Claude returned unparseable output (stop_reason=${res.stop_reason})`);
    return res.parsed_output as z.infer<S>;
  }

  const res = await claude().beta.messages.parse({
    model: e.ADGENT_MODEL,
    max_tokens: args.maxTokens ?? 16000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system,
    messages,
    output_config: { effort: args.effort ?? "medium", format: betaZodOutputFormat(args.schema) },
  });
  if (res.stop_reason === "refusal") throw new Error(`Claude declined: ${res.stop_details?.explanation ?? "refusal"}`);
  if (res.parsed_output == null) throw new Error(`Claude returned unparseable output (stop_reason=${res.stop_reason})`);
  return res.parsed_output as z.infer<S>;
}
