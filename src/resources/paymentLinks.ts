import type { KutiClient } from "../client.js";
import type {
  ListPaymentLinksParams,
  PaymentLink,
  PaymentLinkList,
  PaymentLinkParams,
  SlugAvailability,
} from "../types.js";

interface PaymentLinkApiShape {
  id: string;
  merchant_id: string;
  livemode: boolean;
  slug: string;
  url: string;
  title: string;
  description?: string | null;
  image_url?: string | null;
  template: PaymentLink["template"];
  pricing: PaymentLink["pricing"];
  currency: string;
  amount?: string | null;
  min_amount?: string | null;
  max_amount?: string | null;
  suggested_amounts?: string[];
  payment_method_types: PaymentLink["paymentMethodTypes"];
  category_id?: string | null;
  status: PaymentLink["status"];
  expires_at?: string | null;
  customer_fields?: {
    id: string;
    key: string;
    label: string;
    type: string;
    options?: { key: string; label: string }[];
    required: boolean;
    help_text?: string | null;
  }[];
  button_label?: string | null;
  success_message?: string | null;
  success_button_label?: string | null;
  success_button_url?: string | null;
  payments_count?: number;
  checkouts_count?: number;
  views_count?: number;
  amount_collected?: string;
  created_at: string;
  updated_at: string;
}

interface PaymentLinkEnvelope {
  data: PaymentLinkApiShape;
}

interface PaymentLinkPageEnvelope {
  data: PaymentLinkApiShape[];
  pagination: { page: number; per_page: number; total: number; total_pages: number; has_more: boolean };
}

/**
 * Links de pago: un enlace permanente que pagan muchas personas (cursos, entradas, donaciones).
 * Cada pago es un cobro normal con `paymentLinkId`.
 */
export class PaymentLinksResource {
  constructor(private readonly client: KutiClient) {}

  /** POST /payment-links */
  async create(params: PaymentLinkParams): Promise<PaymentLink> {
    const response = await this.client.request<PaymentLinkEnvelope>("POST", "/payment-links", toBody(params));
    return fromApiShape(response.data);
  }

  /** GET /payment-links/:id */
  async retrieve(id: string): Promise<PaymentLink> {
    const response = await this.client.request<PaymentLinkEnvelope>(
      "GET",
      `/payment-links/${encodeURIComponent(id)}`,
    );
    return fromApiShape(response.data);
  }

  /**
   * PUT /payment-links/:id — reemplaza el link completo (los cobros ya creados no cambian).
   * `customerFieldIds` sin enviar = las preguntas no cambian.
   */
  async update(id: string, params: PaymentLinkParams): Promise<PaymentLink> {
    const response = await this.client.request<PaymentLinkEnvelope>(
      "PUT",
      `/payment-links/${encodeURIComponent(id)}`,
      toBody(params),
    );
    return fromApiShape(response.data);
  }

  /** GET /payment-links */
  async list(params: ListPaymentLinksParams = {}): Promise<PaymentLinkList> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    if (params.page != null) qs.set("page", String(params.page));
    if (params.perPage != null) qs.set("per_page", String(params.perPage));
    const query = qs.toString();
    const response = await this.client.request<PaymentLinkPageEnvelope>(
      "GET",
      `/payment-links${query ? `?${query}` : ""}`,
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

  /** POST /payment-links/:id/activate */
  async activate(id: string): Promise<PaymentLink> {
    const response = await this.client.request<PaymentLinkEnvelope>(
      "POST",
      `/payment-links/${encodeURIComponent(id)}/activate`,
    );
    return fromApiShape(response.data);
  }

  /** POST /payment-links/:id/deactivate — deja de aceptar pagos. */
  async deactivate(id: string): Promise<PaymentLink> {
    const response = await this.client.request<PaymentLinkEnvelope>(
      "POST",
      `/payment-links/${encodeURIComponent(id)}/deactivate`,
    );
    return fromApiShape(response.data);
  }

  /** GET /payment-links/slug-availability — si está ocupado, `suggestion` trae uno libre. */
  async checkSlug(slug: string, exceptId?: string): Promise<SlugAvailability> {
    const qs = new URLSearchParams({ slug });
    if (exceptId) qs.set("except_id", exceptId);
    const response = await this.client.request<{ data: SlugAvailability }>(
      "GET",
      `/payment-links/slug-availability?${qs.toString()}`,
    );
    return response.data;
  }
}

function toBody(p: PaymentLinkParams) {
  return {
    slug: p.slug,
    title: p.title,
    description: p.description,
    image_url: p.imageUrl,
    template: p.template,
    pricing: p.pricing,
    amount: p.amount,
    min_amount: p.minAmount,
    max_amount: p.maxAmount,
    suggested_amounts: p.suggestedAmounts,
    currency: p.currency,
    payment_method_types: p.paymentMethodTypes,
    category_id: p.categoryId,
    expires_at: p.expiresAt,
    customer_field_ids: p.customerFieldIds,
    button_label: p.buttonLabel,
    success_message: p.successMessage,
    success_button_label: p.successButtonLabel,
    success_button_url: p.successButtonUrl,
  };
}

function fromApiShape(d: PaymentLinkApiShape): PaymentLink {
  return {
    id: d.id,
    merchantId: d.merchant_id,
    livemode: d.livemode,
    slug: d.slug,
    url: d.url,
    title: d.title,
    description: d.description,
    imageUrl: d.image_url,
    template: d.template,
    pricing: d.pricing,
    currency: d.currency,
    amount: d.amount,
    minAmount: d.min_amount,
    maxAmount: d.max_amount,
    suggestedAmounts: d.suggested_amounts ?? [],
    paymentMethodTypes: d.payment_method_types,
    categoryId: d.category_id,
    status: d.status,
    expiresAt: d.expires_at,
    customerFields: (d.customer_fields ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type,
      options: f.options ?? [],
      required: f.required,
      helpText: f.help_text,
    })),
    buttonLabel: d.button_label,
    successMessage: d.success_message,
    successButtonLabel: d.success_button_label,
    successButtonUrl: d.success_button_url,
    paymentsCount: d.payments_count,
    checkoutsCount: d.checkouts_count,
    viewsCount: d.views_count,
    amountCollected: d.amount_collected,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}
