import type { KutiClient } from "../client.js";
import type {
  DiagnosticRequest,
  DiagnosticRequestDetail,
  PaymentTrace,
} from "../types.js";

interface DiagnosticRequestApiShape {
  id: string;
  correlation_id?: string | null;
  livemode: boolean;
  source: DiagnosticRequest["source"];
  api_key_id?: string | null;
  method: string;
  path: string;
  route?: string | null;
  resource_id?: string | null;
  status: number;
  error_code?: string | null;
  duration_ms: number;
  idempotency_key?: string | null;
  created_at: string;
}

interface DetailApiShape {
  request: DiagnosticRequestApiShape;
  events?: {
    id: string;
    type: string;
    created_at: string;
    webhook_deliveries?: {
      id: string;
      status: DiagnosticRequestDetail["events"][number]["webhookDeliveries"][number]["status"];
      attempts: number;
      last_http_status?: number | null;
      last_error?: string | null;
      endpoint_url?: string | null;
      last_attempt_at?: string | null;
    }[];
  }[];
}

interface TraceApiShape {
  payment_intent_id: string;
  status: PaymentTrace["status"];
  amount: PaymentTrace["amount"];
  cancellation_reason?: string | null;
  created_at: string;
  methods?: { method: PaymentTrace["methods"][number]["method"]; status: string }[];
  timeline?: {
    at?: string | null;
    kind: PaymentTrace["timeline"][number]["kind"];
    title: string;
    request_id?: string | null;
    event_id?: string | null;
    delivery_id?: string | null;
    http_status?: number | null;
    error_code?: string | null;
  }[];
}

/**
 * Diagnóstico (permiso `diagnostics:read`): qué pasó con una petición, un cobro o un webhook. Ideal
 * para una key de Solo lectura en un asistente de IA. Nunca expone al proveedor de pago.
 */
export class DiagnosticsResource {
  constructor(private readonly client: KutiClient) {}

  /** GET /diagnostics/requests/:id — usa el `requestId` de un error o el header X-Request-Id. */
  async getRequest(requestId: string): Promise<DiagnosticRequestDetail> {
    const response = await this.client.request<{ data: DetailApiShape }>(
      "GET",
      `/diagnostics/requests/${encodeURIComponent(requestId)}`,
    );
    const d = response.data;
    return {
      request: fromRequest(d.request),
      events: (d.events ?? []).map((e) => ({
        id: e.id,
        type: e.type,
        createdAt: e.created_at,
        webhookDeliveries: (e.webhook_deliveries ?? []).map((w) => ({
          id: w.id,
          status: w.status,
          attempts: w.attempts,
          lastHttpStatus: w.last_http_status ?? undefined,
          lastError: w.last_error ?? undefined,
          endpointUrl: w.endpoint_url ?? undefined,
          lastAttemptAt: w.last_attempt_at ?? undefined,
        })),
      })),
    };
  }

  /** GET /diagnostics/requests?correlation_id= — tus llamadas con el mismo X-Request-Id. */
  async listByCorrelationId(correlationId: string): Promise<DiagnosticRequest[]> {
    const response = await this.client.request<{ data: DiagnosticRequestApiShape[] }>(
      "GET",
      `/diagnostics/requests?correlation_id=${encodeURIComponent(correlationId)}`,
    );
    return response.data.map(fromRequest);
  }

  /** GET /diagnostics/payment-intents/:id/trace — la historia completa de un cobro. */
  async tracePaymentIntent(paymentIntentId: string): Promise<PaymentTrace> {
    const response = await this.client.request<{ data: TraceApiShape }>(
      "GET",
      `/diagnostics/payment-intents/${encodeURIComponent(paymentIntentId)}/trace`,
    );
    const t = response.data;
    return {
      paymentIntentId: t.payment_intent_id,
      status: t.status,
      amount: t.amount,
      cancellationReason: t.cancellation_reason ?? undefined,
      createdAt: t.created_at,
      methods: t.methods ?? [],
      timeline: (t.timeline ?? []).map((e) => ({
        at: e.at ?? undefined,
        kind: e.kind,
        title: e.title,
        requestId: e.request_id ?? undefined,
        eventId: e.event_id ?? undefined,
        deliveryId: e.delivery_id ?? undefined,
        httpStatus: e.http_status ?? undefined,
        errorCode: e.error_code ?? undefined,
      })),
    };
  }
}

function fromRequest(r: DiagnosticRequestApiShape): DiagnosticRequest {
  return {
    id: r.id,
    correlationId: r.correlation_id ?? undefined,
    livemode: r.livemode,
    source: r.source,
    apiKeyId: r.api_key_id ?? undefined,
    method: r.method,
    path: r.path,
    route: r.route ?? undefined,
    resourceId: r.resource_id ?? undefined,
    status: r.status,
    errorCode: r.error_code ?? undefined,
    durationMs: r.duration_ms,
    idempotencyKey: r.idempotency_key ?? undefined,
    createdAt: r.created_at,
  };
}
