import type { KutiClient } from "../client.js";
import type {
  CheckoutSession,
  CreateCheckoutSessionParams,
  PaymentMethodType,
  RequestOptions,
} from "../types.js";
import { toCustomerBody } from "./customerShape.js";

interface CheckoutSessionEnvelope {
  data: CheckoutSessionApiShape;
}

interface CheckoutSessionApiShape {
  id: string;
  merchant_id: string;
  customer_id?: string;
  payment_intent_id: string;
  amount: CheckoutSession["amount"];
  status: CheckoutSession["status"];
  description?: string;
  success_url?: string;
  client_secret?: string;
  checkout_url?: string;
  payment_method?: {
    qr?: { type?: string; payload?: string; image_url?: string; expires_at?: string };
    payment_code?: { type?: string; code?: string; expires_at?: string };
  };
  expires_at?: string;
  created_at: string;
}

export class CheckoutSessionsResource {
  constructor(private readonly client: KutiClient) {}

  /**
   * POST /checkout-sessions. Use idempotencyKey to safely retry.
   */
  async create(params: CreateCheckoutSessionParams, opts?: RequestOptions): Promise<CheckoutSession> {
    const body = {
      amount: params.amount,
      payment_method_types: params.paymentMethodTypes,
      customer: toCustomerBody(params.customer),
      description: params.description,
      external_reference: params.externalReference,
      success_url: params.successUrl,
      expires_at: params.expiresAt,
      metadata: params.metadata,
    };

    const response = await this.client.request<CheckoutSessionEnvelope>(
      "POST",
      "/checkout-sessions",
      body,
      opts,
    );
    return fromApiShape(response.data);
  }
}

function fromApiShape(dto: CheckoutSessionApiShape): CheckoutSession {
  return {
    id: dto.id,
    merchantId: dto.merchant_id,
    customerId: dto.customer_id,
    paymentIntentId: dto.payment_intent_id,
    amount: dto.amount,
    status: dto.status,
    description: dto.description,
    successUrl: dto.success_url,
    clientSecret: dto.client_secret,
    checkoutUrl: dto.checkout_url,
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
    expiresAt: dto.expires_at,
    createdAt: dto.created_at,
  };
}
