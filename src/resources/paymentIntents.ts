import type { KutiClient } from "../client.js";
import type { PaymentIntent, PaymentMethodType } from "../types.js";

interface PaymentIntentEnvelope {
  data: PaymentIntentApiShape;
}

interface PaymentIntentApiShape {
  id: string;
  merchant_id: string;
  livemode?: boolean;
  /** Legacy / flat — la API actual usa `customer.id`. */
  customer_id?: string;
  customer?: { id?: string };
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
  created_at: string;
}

export class PaymentIntentsResource {
  constructor(private readonly client: KutiClient) {}

  /**
   * Consulta el estado real de un cobro. Es la fuente de verdad — nunca confíes en un callback del
   * frontend (`onSuccess` de KUTI.js) para confirmar un pago; el navegador del comprador se puede
   * falsificar. Verifica `status === "SUCCEEDED"` aquí antes de entregar un producto o servicio.
   */
  async retrieve(id: string): Promise<PaymentIntent> {
    const response = await this.client.request<PaymentIntentEnvelope>(
      "GET",
      `/payment-intents/${encodeURIComponent(id)}`,
    );
    return fromApiShape(response.data);
  }
}

function fromApiShape(dto: PaymentIntentApiShape): PaymentIntent {
  const customerId = dto.customer?.id ?? dto.customer_id;
  return {
    id: dto.id,
    merchantId: dto.merchant_id,
    livemode: dto.livemode,
    customerId,
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
    createdAt: dto.created_at,
  };
}
