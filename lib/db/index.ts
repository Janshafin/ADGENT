import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { env } from "../env";

type DB = LibSQLDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __adgentDb?: DB; __adgentClient?: Client };

export function db(): DB {
  if (!globalForDb.__adgentDb) {
    const e = env();
    globalForDb.__adgentClient = createClient({
      url: e.DATABASE_URL,
      authToken: e.DATABASE_AUTH_TOKEN || undefined,
    });
    globalForDb.__adgentDb = drizzle(globalForDb.__adgentClient, { schema });
  }
  return globalForDb.__adgentDb;
}

export { schema };
