import type { KutiClient } from "../client.js";
import type {
  ListPaymentExceptionsParams,
  PaymentException,
  PaymentExceptionList,
  ResolvePaymentExceptionParams,
} from "../types.js";

interface PaymentExceptionApiShape {
  id: string;
  merchant_id: string;
  livemode: boolean;
  payment_intent_id: string;
  payment_method_type?: PaymentException["paymentMethodType"] | null;
  amount: PaymentException["amount"];
  reason: PaymentException["reason"];
  status: PaymentException["status"];
  balance_transaction_id?: string | null;
  resolution_note?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

interface PageEnvelope {
  data: PaymentExceptionApiShape[];
  pagination: { page: number; per_page: number; total: number; total_pages: number; has_more: boolean };
}

/**
 * Pagos para revisar: dinero que entró pero no correspondía (pagaron dos veces, un cobro anulado, una
 * cuota ya pagada, otro monto). Te llega el webhook `payment.exception_created`.
 */
export class PaymentExceptionsResource {
  constructor(private readonly client: KutiClient) {}

  /** GET /payment-exceptions */
  async list(params: ListPaymentExceptionsParams = {}): Promise<PaymentExceptionList> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.paymentIntentId) qs.set("payment_intent_id", params.paymentIntentId);
    if (params.page) qs.set("page", String(params.page));
    if (params.perPage) qs.set("per_page", String(params.perPage));
    const query = qs.toString();
    const response = await this.client.request<PageEnvelope>("GET", `/payment-exceptions${query ? `?${query}` : ""}`);
    return {
      data: response.data.map(fromApiShape),
      pagination: {
        page: response.pagination.page,
        perPage: response.pagination.per_page,
        total: response.pagination.total,
        totalPages: response.pagination.total_pages,
        hasMore: response.pagination.has_more,
      },
    };
  }

  /** POST /payment-exceptions/:id/resolve — deja constancia de qué hiciste (no mueve dinero). */
  async resolve(id: string, params: ResolvePaymentExceptionParams): Promise<PaymentException> {
    const response = await this.client.request<{ data: PaymentExceptionApiShape }>(
      "POST",
      `/payment-exceptions/${encodeURIComponent(id)}/resolve`,
      { status: params.status, note: params.note },
    );
    return fromApiShape(response.data);
  }
}

function fromApiShape(dto: PaymentExceptionApiShape): PaymentException {
  return {
    id: dto.id,
    merchantId: dto.merchant_id,
    livemode: dto.livemode,
    paymentIntentId: dto.payment_intent_id,
    paymentMethodType: dto.payment_method_type ?? undefined,
    amount: dto.amount,
    reason: dto.reason,
    status: dto.status,
    balanceTransactionId: dto.balance_transaction_id ?? undefined,
    resolutionNote: dto.resolution_note ?? undefined,
    createdAt: dto.created_at,
    resolvedAt: dto.resolved_at ?? undefined,
  };
}
