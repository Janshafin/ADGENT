export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly debugId: string | undefined,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }

  /** e.g. "ORDER_NOT_APPROVED": first issue code PayPal returned */
  get issue(): string | undefined {
    const d = this.details as { details?: { issue?: string }[] } | undefined;
    return d?.details?.[0]?.issue;
  }
}

export type RequestOpts = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as PayPal-Request-Id so retries never double-charge. */
  idempotencyKey?: string;
  headers?: Record<string, string>;
};
