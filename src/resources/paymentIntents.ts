import type { KutiClient } from "../client.js";
import type {
  CreatePaymentIntentParams,
  ListPaymentIntentsParams,
  PaymentIntent,
  PaymentIntentList,
  PaymentMethodType,
  RequestOptions,
  SendWhatsAppParams,
} from "../types.js";
import {
  fromPaymentIntentCustomer,
  toCustomerBody,
  type PaymentIntentCustomerApiShape,
} from "./customerShape.js";

interface PaymentIntentEnvelope {
  data: PaymentIntentApiShape;
}

interface PaymentIntentPageEnvelope {
  data: PaymentIntentApiShape[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_more: boolean;
  };
}

interface PaymentIntentApiShape {
  id: string;
  merchant_id: string;
  livemode?: boolean;
  customer_id?: string;
  customer?: PaymentIntentCustomerApiShape;
  amount: PaymentIntent["amount"];
  status: PaymentIntent["status"];
  payment_method_types?: PaymentIntent["paymentMethodTypes"];
  payment_method?: {
    qr?: { type?: string; payload?: string; image_url?: string; expires_at?: string };
    payment_code?: { type?: string; code?: string; expires_at?: string };
  };
  paid_with?: { method_type?: string; paid_at?: string };
  checkout_url?: string;
  expires_at?: string;
  external_reference?: string;
  description?: string;
  category_id?: string;
  metadata?: Record<string, string>;
  requires_customer_info?: boolean;
  payment_link_id?: string | null;
  send_via?: PaymentIntent["sendVia"];
  created_at: string;
}

export class PaymentIntentsResource {
  constructor(private readonly client: KutiClient) {}

  /** POST /payment-intents — QR, bank code, checkoutUrl. */
  async create(params: CreatePaymentIntentParams, opts?: RequestOptions): Promise<PaymentIntent> {
    const body = {
      amount: params.amount,
      payment_method_types: params.paymentMethodTypes,
      customer: toCustomerBody(params.customer),
      receivable_id: params.receivableId,
      category_id: params.categoryId,
      requires_customer_info: params.requiresCustomerInfo,
      description: params.description,
      external_reference: params.externalReference,
      expires_at: params.expiresAt,
      merchant_id: params.merchantId,
      metadata: params.metadata,
      send_via: params.sendVia,
    };

    const response = await this.client.request<PaymentIntentEnvelope>(
      "POST",
      "/payment-intents",
      body,
      opts,
    );
    return fromApiShape(response.data);
  }

  /** GET /payment-intents */
  async list(params: ListPaymentIntentsParams = {}): Promise<PaymentIntentList> {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.q) qs.set("q", params.q);
    if (params.customerId) qs.set("customer_id", params.customerId);
    if (params.source) qs.set("source", params.source);
    if (params.paymentLinkId) qs.set("payment_link_id", params.paymentLinkId);
    if (params.createdFrom) qs.set("created_from", params.createdFrom);
    if (params.createdTo) qs.set("created_to", params.createdTo);
    if (params.page != null) qs.set("page", String(params.page));
    if (params.perPage != null) qs.set("per_page", String(params.perPage));
    const query = qs.toString();
    const response = await this.client.request<PaymentIntentPageEnvelope>(
      "GET",
      `/payment-intents${query ? `?${query}` : ""}`,
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

  /** GET /payment-intents/:id */
  async retrieve(id: string): Promise<PaymentIntent> {
    const response = await this.client.request<PaymentIntentEnvelope>(
      "GET",
      `/payment-intents/${encodeURIComponent(id)}`,
    );
    return fromApiShape(response.data);
  }

  /** POST /payment-intents/:id/cancel */
  async cancel(id: string): Promise<PaymentIntent> {
    const response = await this.client.request<PaymentIntentEnvelope>(
      "POST",
      `/payment-intents/${encodeURIComponent(id)}/cancel`,
    );
    return fromApiShape(response.data);
  }

  /** POST /payment-intents/:id/send-whatsapp — 204 on success. */
  async sendWhatsApp(id: string, params: SendWhatsAppParams = {}): Promise<void> {
    const body: Record<string, string> = {};
    if (params.phone) body.phone = params.phone;
    if (params.customerName) body.customer_name = params.customerName;
    await this.client.request(
      "POST",
      `/payment-intents/${encodeURIComponent(id)}/send-whatsapp`,
      Object.keys(body).length ? body : {},
    );
  }
}

function fromApiShape(dto: PaymentIntentApiShape): PaymentIntent {
  const customerId = dto.customer?.id ?? dto.customer_id;
  return {
    id: dto.id,
    merchantId: dto.merchant_id,
    livemode: dto.livemode,
    customerId,
    customer: fromPaymentIntentCustomer(dto.customer),
    amount: dto.amount,
    status: dto.status,
    paymentMethodTypes: dto.payment_method_types,
    paymentMethod: dto.payment_method
      ? {
          qr: dto.payment_method.qr
            ? {
                type: dto.payment_method.qr.type as PaymentMethodType | undefined,
                payload: dto.payment_method.qr.payload,
                imageUrl: dto.payment_method.qr.image_url,
                expiresAt: dto.payment_method.qr.expires_at,
              }
            : undefined,
          paymentCode: dto.payment_method.payment_code
            ? {
                type: dto.payment_method.payment_code.type as PaymentMethodType | undefined,
                code: dto.payment_method.payment_code.code,
                expiresAt: dto.payment_method.payment_code.expires_at,
              }
            : undefined,
        }
      : undefined,
    paidWith: dto.paid_with
      ? {
          methodType: dto.paid_with.method_type as PaymentMethodType | undefined,
          paidAt: dto.paid_with.paid_at,
        }
      : undefined,
    checkoutUrl: dto.checkout_url,
    expiresAt: dto.expires_at,
    externalReference: dto.external_reference,
    description: dto.description,
    categoryId: dto.category_id,
    metadata: dto.metadata,
    requiresCustomerInfo: dto.requires_customer_info,
    paymentLinkId: dto.payment_link_id,
    sendVia: dto.send_via,
    createdAt: dto.created_at,
  };
}
