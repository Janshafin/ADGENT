
import { connection } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";
import { requireAdmin } from "@/lib/auth/admin";
const merchantSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(40),
  paypalEmail: z.string().trim().email(),
  emoji: z.string().trim().max(8).default("🛍️"),
});

export async function GET() {
  try {
    await connection();
    const d = db();

    const [merchants, products] = await Promise.all([
      d.select({
        id: schema.merchants.id,
        name: schema.merchants.name,
        category: schema.merchants.category,
        emoji: schema.merchants.emoji,
        trustScore: schema.merchants.trustScore,
      }).from(schema.merchants),
      d.select().from(schema.products),
    ]);

    return Response.json(
      merchants.map((m) => ({
        ...m,
        products: products.filter((p) => p.merchantId === m.id),
      }))
    );
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    rateLimit(req, "merchant-create", 5);
    requireAdmin(req);
    const { name, category, paypalEmail, emoji } =
      await body(req, merchantSchema);

    const id = `m_${randomUUID().slice(0, 8)}`;

    await db().insert(schema.merchants).values({
      id, name, category, emoji, paypalEmail,
    });

    return Response.json(
      { id, name, category, emoji },
      { status: 201 }
    );
  } catch (err) {
    return fail(err);
  }
}
