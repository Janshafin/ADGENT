import os from "node:os";
import path from "node:path";

// Every test file gets its own throwaway SQLite database and runs against the PayPal simulator.
process.env.DATABASE_URL = `file:${path.join(os.tmpdir(), `adgent-test-${process.pid}-${Math.random().toString(36).slice(2)}.db`)}`;
process.env.PAYPAL_CLIENT_ID = "";
process.env.PAYPAL_CLIENT_SECRET = "";
process.env.ANTHROPIC_API_KEY = "";
process.env.ADGENT_FEE_MODE = "payouts";
process.env.ADGENT_DISABLE_WORKER = "1";
process.env.APP_URL = "http://test.local";
