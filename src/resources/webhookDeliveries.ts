import type { KutiClient } from "../client.js";
import type { WebhookDelivery } from "../types.js";

export interface WebhookDeliveryApiShape {
  id: string;
  event_id: string;
  webhook_endpoint_id?: string;
  endpoint_url?: string;
  status: WebhookDelivery["status"];
  attempts: number;
  last_http_status?: number | null;
  last_error?: string | null;
  next_attempt_at?: string | null;
  delivered_at?: string | null;
  attempt_history?: {
    id: string;
    attempt_number: number;
    attempted_at: string;
    ok: boolean;
    http_status?: number | null;
    error?: string | null;
    request_body?: string | null;
    response_body?: string | null;
  }[];
}

/** Entregas de webhook: cada intento con el status HTTP y lo que respondió tu servidor. */
export class WebhookDeliveriesResource {
  constructor(private readonly client: KutiClient) {}

  /** GET /webhook-deliveries/:id */
  async retrieve(id: string): Promise<WebhookDelivery> {
    const response = await this.client.request<{ data: WebhookDeliveryApiShape }>(
      "GET",
      `/webhook-deliveries/${encodeURIComponent(id)}`,
    );
    return fromWebhookDeliveryApiShape(response.data);
  }

  /** POST /webhook-deliveries/:id/retry — la reencola para envío inmediato. */
  async retry(id: string): Promise<WebhookDelivery> {
    const response = await this.client.request<{ data: WebhookDeliveryApiShape }>(
      "POST",
      `/webhook-deliveries/${encodeURIComponent(id)}/retry`,
    );
    return fromWebhookDeliveryApiShape(response.data);
  }
}

export function fromWebhookDeliveryApiShape(dto: WebhookDeliveryApiShape): WebhookDelivery {
  return {
    id: dto.id,
    eventId: dto.event_id,
    webhookEndpointId: dto.webhook_endpoint_id,
    endpointUrl: dto.endpoint_url,
    status: dto.status,
    attempts: dto.attempts,
    lastHttpStatus: dto.last_http_status ?? undefined,
    lastError: dto.last_error ?? undefined,
    nextAttemptAt: dto.next_attempt_at ?? undefined,
    deliveredAt: dto.delivered_at ?? undefined,
    attemptHistory: (dto.attempt_history ?? []).map((a) => ({
      id: a.id,
      attemptNumber: a.attempt_number,
      attemptedAt: a.attempted_at,
      ok: a.ok,
      httpStatus: a.http_status ?? undefined,
      error: a.error ?? undefined,
      requestBody: a.request_body ?? undefined,
      responseBody: a.response_body ?? undefined,
    })),
  };
}
