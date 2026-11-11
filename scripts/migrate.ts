/** Applies the SQL migrations in ./drizzle. Safe to run on every deploy: already-applied steps are skipped. */
import "dotenv/config";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../lib/db";

migrate(db(), { migrationsFolder: "drizzle" }).then(
  () => {
    console.log("Database is up to date.");
    process.exit(0);
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
