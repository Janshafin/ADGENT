import { connection } from "next/server";
import { db, schema } from "@/lib/db";

export async function GET() {
  await connection();
  const d = db();
  const [merchants, products] = await Promise.all([d.select().from(schema.merchants), d.select().from(schema.products)]);
  return Response.json(merchants.map((m) => ({ ...m, products: products.filter((p) => p.merchantId === m.id) })));
}
