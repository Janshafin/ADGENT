import { connection } from "next/server";
import { fail } from "@/lib/http";
import { db, schema } from "@/lib/db";
import { randomUUID } from "node:crypto";
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const name = String(b.name ?? "").trim();
    const category = String(b.category ?? "").trim();
    const paypalEmail = String(b.paypalEmail ?? "").trim();
    const emoji = String(b.emoji ?? "🛍️").trim().slice(0, 8);

    if (name.length < 2 || name.length > 80) return Response.json({ error: "name must be 2-80 chars" }, { status: 400 });
    if (category.length < 2 || category.length > 40) return Response.json({ error: "category must be 2-40 chars" }, { status: 400 });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) return Response.json({ error: "valid paypalEmail required" }, { status: 400 });

    const id = `m_${randomUUID().slice(0, 8)}`;
    await db().insert(schema.merchants).values({ id, name, category, emoji, paypalEmail });
    // never echo the PayPal email back
    return Response.json({ id, name, category, emoji }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
export async function GET() {
  await connection();
  const d = db();
  // Public fields only: a merchant's PayPal email and merchant id are where money is sent, never shown.
  const [merchants, products] = await Promise.all([
    d.select({ id: schema.merchants.id, name: schema.merchants.name, category: schema.merchants.category, emoji: schema.merchants.emoji, trustScore: schema.merchants.trustScore }).from(schema.merchants),
    d.select().from(schema.products),
  ]);
  return Response.json(merchants.map((m) => ({ ...m, products: products.filter((p) => p.merchantId === m.id) })));
}
