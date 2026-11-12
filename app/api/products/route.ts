import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db, schema } from "@/lib/db";
import { fail } from "@/lib/http";

export async function GET(req: Request) {
  try {
    await connection();
    const merchantId = new URL(req.url).searchParams.get("merchantId");
    const q = db().select().from(schema.products);
    const rows = merchantId ? await q.where(eq(schema.products.merchantId, merchantId)) : await q;
    return Response.json(rows);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const merchantId = String(b.merchantId ?? "");
    const title = String(b.title ?? "").trim();
    const description = String(b.description ?? "").trim();
    const category = String(b.category ?? "").trim();
    const image = String(b.image ?? "").trim();
    const priceCents = Number(b.priceCents);
    const tags = Array.isArray(b.tags) ? b.tags.map((t: unknown) => String(t).trim().slice(0, 30)).slice(0, 8) : [];

    if (title.length < 2 || title.length > 100) return Response.json({ error: "title must be 2-100 chars" }, { status: 400 });
    if (description.length < 5 || description.length > 500) return Response.json({ error: "description must be 5-500 chars" }, { status: 400 });
    if (category.length < 2 || category.length > 40) return Response.json({ error: "category must be 2-40 chars" }, { status: 400 });
    if (!Number.isInteger(priceCents) || priceCents < 50 || priceCents > 1_000_000) return Response.json({ error: "priceCents must be an integer 50-1000000" }, { status: 400 });
    if (!/^(https:\/\/|\/)/.test(image)) return Response.json({ error: "image must be an https URL or a / path" }, { status: 400 });

    const [m] = await db().select({ id: schema.merchants.id }).from(schema.merchants).where(eq(schema.merchants.id, merchantId));
    if (!m) return Response.json({ error: "merchant not found" }, { status: 404 });

    const id = `p_${randomUUID().slice(0, 8)}`;
    await db().insert(schema.products).values({ id, merchantId, title, description, category, priceCents, image, tags });
    return Response.json({ id, merchantId, title, description, category, priceCents, image, tags }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}