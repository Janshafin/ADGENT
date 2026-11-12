
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { body, fail } from "@/lib/http";
import { rateLimit } from "@/lib/http/rate-limit";

const productSchema = z.object({
  merchantId: z.string().min(1).max(80),
  title: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(500),
  category: z.string().trim().min(2).max(40),
  priceCents: z.number().int().min(50).max(1_000_000),
  image: z.string().regex(/^(https:\/\/|\/)/),
  tags: z.array(z.string().trim().max(30)).max(8).default([]),
});

export async function GET(req: Request) {
  try {
    await connection();
    const merchantId = new URL(req.url).searchParams.get("merchantId");
    const q = db().select().from(schema.products);
    const rows = merchantId
      ? await q.where(eq(schema.products.merchantId, merchantId))
      : await q;

    return Response.json(rows);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    rateLimit(req, "product-create", 20);
    const data = await body(req, productSchema);

    const [merchant] = await db()
      .select({ id: schema.merchants.id })
      .from(schema.merchants)
      .where(eq(schema.merchants.id, data.merchantId));

    if (!merchant) {
      return Response.json({ error: "merchant not found" }, { status: 404 });
    }

    const id = `p_${randomUUID().slice(0, 8)}`;

    await db().insert(schema.products).values({ id, ...data });

    return Response.json({ id, ...data }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
