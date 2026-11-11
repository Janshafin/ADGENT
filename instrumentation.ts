/** Starts the settlement / reconciliation / guardian worker once per Node.js server instance. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startWorker } = await import("./lib/adgent/worker");
  startWorker();
}
