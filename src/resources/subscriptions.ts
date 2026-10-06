import type { KutiClient } from "../client.js";
import type {
  ChargeSubscriptionParams,
  CreateSubscriptionParams,
  ListSubscriptionsParams,
  RequestOptions,
  Subscription,
  SubscriptionCycle,
  SubscriptionList,
  SubscriptionRetryPolicy,
  UpdateSubscriptionParams,
} from "../types.js";
import { toCustomerBody } from "./customerShape.js";

interface CycleApiShape {
  id: string;
  billing_period: string;
  due_date: string;
  amount?: SubscriptionCycle["amount"];
  status: SubscriptionCycle["status"];
  attempts?: number;
  last_failure_code?: SubscriptionCycle["lastFailureCode"];
  next_attempt_at?: string | null;
  payment_intent_id?: string | null;
  checkout_url?: string | null;
  paid_at?: string | null;
}

interface SubscriptionApiShape {
  id: string;
  merchant_id: string;
  livemode?: boolean;
  customer?: Subscription["customer"];
  description: string;
  billing_mode?: Subscription["billingMode"];
  amount?: Subscription["amount"];
  setup_url?: string | null;
  items?: { description?: string | null; unit_amount: string; quantity?: number; amount?: string }[];
  frequency: Subscription["frequency"];
  interval: number;
  day_of_month?: number | null;
  last_day_of_month?: boolean;
  day_of_week?: number | null;
  start_date: string;
  end_date?: string | null;
  charge_time?: string;
  next_charge_at?: string | null;
  status: Subscription["status"];
  payment_method?: { id: string; type?: string; phone_last4?: string | null; status?: string } | null;
  retry_policy?: { interval_days?: number[]; on_exhausted?: "past_due" | "cancel" };
  latest_cycle?: CycleApiShape | null;
  external_reference?: string | null;
  metadata?: Record<string, string>;
  cancelled_at?: string | null;
  created_at: string;
  updated_at?: string;
}

interface SubscriptionEnvelope {
  data: SubscriptionApiShape;
}

interface SubscriptionPageEnvelope {
  data: SubscriptionApiShape[];
  pagination: { page: number; per_page: number; total: number; total_pages: number; has_more: boolean };
}

/**
 * Suscripciones: KUTI le cobra solo a tu cliente, cada periodo, sobre su Yape afiliado
 * (máximo S/ 2,500 por periodo). Cada periodo es un cobro normal (`paymentIntents`).
 */
export class SubscriptionsResource {
  constructor(private readonly client: KutiClient) {}

  /**
   * POST /subscriptions. Monto fijo: se cobra el primer periodo al crearla (si el cliente aún no
   * tiene su Yape afiliado nace `INCOMPLETE` con `latestCycle.checkoutUrl`). Monto variable
   * (`billingMode: "variable"`): no cobra nada; si falta afiliar, trae `setupUrl`.
   */
  async create(params: CreateSubscriptionParams, opts?: RequestOptions): Promise<Subscription> {
    const body = {
      customer: toCustomerBody(params.customer),
      description: params.description,
      billing_mode: params.billingMode,
      amount: params.amount,
      items: toItemsBody(params.items),
      currency: params.currency,
      frequency: params.frequency,
      interval: params.interval,
      day_of_month: params.dayOfMonth,
      last_day_of_month: params.lastDayOfMonth,
      day_of_week: params.dayOfWeek,
      start_date: params.startDate,
      end_date: params.endDate,
      charge_time: params.chargeTime,
      retry_policy: toRetryBody(params.retryPolicy),
      external_reference: params.externalReference,
      metadata: params.metadata,
      send_via: params.sendVia,
    };
    const response = await this.client.request<SubscriptionEnvelope>("POST", "/subscriptions", body, opts);
    return fromApiShape(response.data);
  }

  /** GET /subscriptions/:id — la devuelve ya puesta al día con sus cobros. */
  async retrieve(id: string): Promise<Subscription> {
    const response = await this.client.request<SubscriptionEnvelope>("GET", path(id));
    return fromApiShape(response.data);
  }

  /** GET /subscriptions */
  async list(params: ListSubscriptionsParams = {}): Promise<SubscriptionList> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.customerId) qs.set("customer_id", params.customerId);
    if (params.page != null) qs.set("page", String(params.page));
    if (params.perPage != null) qs.set("per_page", String(params.perPage));
    const query = qs.toString();
    const response = await this.client.request<SubscriptionPageEnvelope>(
      "GET",
      `/subscriptions${query ? `?${query}` : ""}`,
    );
    return {
      data: (response.data ?? []).map(fromApiShape),
      pagination: {
        page: response.pagination.page,
        perPage: response.pagination.per_page,
        total: response.pagination.total,
        totalPages: response.pagination.total_pages,
        hasMore: response.pagination.has_more,
      },
    };
  }

  /** PATCH /subscriptions/:id — rige desde el próximo periodo; solo cambia lo que envías. */
  async update(id: string, params: UpdateSubscriptionParams): Promise<Subscription> {
    const body = {
      description: params.description,
      amount: params.amount,
      items: toItemsBody(params.items),
      end_date: params.endDate,
      charge_time: params.chargeTime,
      retry_policy: toRetryBody(params.retryPolicy),
      metadata: params.metadata,
    };
    const response = await this.client.request<SubscriptionEnvelope>("PATCH", path(id), body);
    return fromApiShape(response.data);
  }

  /** POST /subscriptions/:id/pause — deja de cobrar y de reintentar. */
  pause(id: string, opts?: RequestOptions): Promise<Subscription> {
    return this.action(id, "pause", opts);
  }

  /** POST /subscriptions/:id/resume */
  resume(id: string, opts?: RequestOptions): Promise<Subscription> {
    return this.action(id, "resume", opts);
  }

  /** POST /subscriptions/:id/cancel — final; anula el cobro del periodo que siga sin pagar. */
  cancel(id: string, opts?: RequestOptions): Promise<Subscription> {
    return this.action(id, "cancel", opts);
  }

  /** POST /subscriptions/:id/retry — debita ahora el periodo más antiguo sin pagar. */
  retry(id: string, opts?: RequestOptions): Promise<Subscription> {
    return this.action(id, "retry", opts);
  }

  /**
   * POST /subscriptions/:id/charges — solo monto variable: envía el monto de un periodo y KUTI lo
   * debita. Llámalo al recibir `subscription.amount_required` o al cerrar tu periodo. Un solo
   * cobro por periodo (409 SUBSCRIPTION_PERIOD_ALREADY_CHARGED si lo repites).
   */
  async charge(id: string, params: ChargeSubscriptionParams, opts?: RequestOptions): Promise<Subscription> {
    const response = await this.client.request<SubscriptionEnvelope>(
      "POST",
      `${path(id)}/charges`,
      { amount: params.amount, description: params.description, period: params.period },
      opts,
    );
    return fromApiShape(response.data);
  }

  /** GET /subscriptions/:id/cycles — periodos, del más reciente al más antiguo. */
  async listCycles(id: string): Promise<SubscriptionCycle[]> {
    const response = await this.client.request<{ data: CycleApiShape[] }>("GET", `${path(id)}/cycles`);
    return (response.data ?? []).map(fromCycle);
  }

  private async action(id: string, action: string, opts?: RequestOptions): Promise<Subscription> {
    const response = await this.client.request<SubscriptionEnvelope>(
      "POST",
      `${path(id)}/${action}`,
      undefined,
      opts,
    );
    return fromApiShape(response.data);
  }
}

function path(id: string): string {
  return `/subscriptions/${encodeURIComponent(id)}`;
}

function toItemsBody(items: CreateSubscriptionParams["items"]) {
  return items?.map((i) => ({ description: i.description, unit_amount: i.unitAmount, quantity: i.quantity }));
}

function toRetryBody(policy: SubscriptionRetryPolicy | undefined) {
  if (!policy) return undefined;
  return { interval_days: policy.intervalDays, on_exhausted: policy.onExhausted };
}

function fromCycle(dto: CycleApiShape): SubscriptionCycle {
  return {
    id: dto.id,
    billingPeriod: dto.billing_period,
    dueDate: dto.due_date,
    amount: dto.amount ?? null,
    status: dto.status,
    attempts: dto.attempts ?? 0,
    lastFailureCode: dto.last_failure_code ?? null,
    nextAttemptAt: dto.next_attempt_at ?? null,
    paymentIntentId: dto.payment_intent_id ?? null,
    checkoutUrl: dto.checkout_url ?? null,
    paidAt: dto.paid_at ?? null,
  };
}

function fromApiShape(dto: SubscriptionApiShape): Subscription {
  return {
    id: dto.id,
    merchantId: dto.merchant_id,
    livemode: dto.livemode,
    customer: dto.customer,
    description: dto.description,
    billingMode: dto.billing_mode ?? "fixed",
    amount: dto.amount ?? null,
    setupUrl: dto.setup_url ?? null,
    items: (dto.items ?? []).map((i) => ({
      description: i.description ?? undefined,
      unitAmount: i.unit_amount,
      quantity: i.quantity,
      amount: i.amount,
    })),
    frequency: dto.frequency,
    interval: dto.interval,
    dayOfMonth: dto.day_of_month ?? null,
    lastDayOfMonth: dto.last_day_of_month ?? false,
    dayOfWeek: dto.day_of_week ?? null,
    startDate: dto.start_date,
    endDate: dto.end_date ?? null,
    chargeTime: dto.charge_time,
    nextChargeAt: dto.next_charge_at ?? null,
    status: dto.status,
    paymentMethod: dto.payment_method
      ? {
          id: dto.payment_method.id,
          type: dto.payment_method.type,
          phoneLast4: dto.payment_method.phone_last4 ?? null,
          status: dto.payment_method.status,
        }
      : null,
    retryPolicy: dto.retry_policy
      ? { intervalDays: dto.retry_policy.interval_days, onExhausted: dto.retry_policy.on_exhausted }
      : undefined,
    latestCycle: dto.latest_cycle ? fromCycle(dto.latest_cycle) : null,
    externalReference: dto.external_reference ?? null,
    metadata: dto.metadata,
    cancelledAt: dto.cancelled_at ?? null,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}
