export type WebhookEvent = {
  id: string;
  event_type: string;
  resource: {
    id?: string;
    links?: { href: string; rel: string }[];
    supplementary_data?: { related_ids?: { order_id?: string } };
    batch_header?: { payout_batch_id?: string; batch_status?: string };
  };
};

/** A refund resource links "up" to the capture it refunds. */
export function capturedIdFromRefund(resource: WebhookEvent["resource"]): string | null {
  const up = resource.links?.find((l) => l.rel === "up")?.href ?? "";
  return /\/captures\/([^/?#]+)/.exec(up)?.[1] ?? null;
}
