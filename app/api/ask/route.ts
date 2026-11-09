import { z } from "zod";
import { askLedger } from "@/lib/ai/ask";
import { body, fail } from "@/lib/http";

export async function POST(req: Request) {
  try {
    const { question } = await body(req, z.object({ question: z.string().min(3).max(300) }));
    return Response.json(await askLedger(question));
  } catch (err) {
    return fail(err);
  }
}
