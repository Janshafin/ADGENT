import { connection } from "next/server";
import { db, schema } from "@/lib/db";

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
