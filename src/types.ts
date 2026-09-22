export interface Money {
  /** Decimal como string. Nunca float. */
  amount: string;
  currency: string;
}

export type PaymentMethodType = "INTEROPERABLE_QR" | "BANK_TRANSFER";

export type CheckoutSessionStatus = "OPEN" | "COMPLETED" | "EXPIRED" | "CANCELLED";

export type PaymentIntentStatus =
  | "REQUIRES_PAYMENT_METHOD"
  | "PENDING"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

export interface CheckoutSessionCustomer {
  /** Id de un Customer ya existente (cus_…). Si viene, se ignora el resto. */
  id?: string;
  externalId?: string;
  name?: string;
  email?: string;
  /** Formato E.164 (+<código país><número>). */
  phone?: string;
}

export interface CreateCheckoutSessionParams {
  amount: Money;
  paymentMethodTypes: PaymentMethodType[];
  customer?: CheckoutSessionCustomer;
  description?: string;
  externalReference?: string;
  successUrl?: string;
  expiresAt?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentCustomerDocument {
  type: string;
  number: string;
}

/** Cliente del cobro. Si viene `id`, se ignora el resto. */
export interface PaymentIntentCustomer {
  id?: string;
  type?: "INDIVIDUAL" | "COMPANY";
  givenName?: string;
  familyName?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  document?: PaymentIntentCustomerDocument;
}

export interface CreatePaymentIntentParams {
  amount: Money;
  paymentMethodTypes: PaymentMethodType[];
  customer?: PaymentIntentCustomer;
  /** Atajo equivalente a `customer.id`. Preferimos el objeto `customer`. */
  customerId?: string;
  receivableId?: string;
  categoryId?: string;
  requiresCustomerInfo?: boolean;
  description?: string;
  externalReference?: string;
  expiresAt?: string;
  merchantId?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentCustomerDocument {
  type: string;
  number: string;
}

/** Cliente del cobro. Si viene `id`, se ignora el resto. */
export interface PaymentIntentCustomer {
  id?: string;
  type?: "INDIVIDUAL" | "COMPANY";
  givenName?: string;
  familyName?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  externalId?: string;
  document?: PaymentIntentCustomerDocument;
}

export interface CreatePaymentIntentParams {
  amount: Money;
  paymentMethodTypes: PaymentMethodType[];
  customer?: PaymentIntentCustomer;
  /** Atajo equivalente a `customer.id`. Preferimos el objeto `customer`. */
  customerId?: string;
  receivableId?: string;
  categoryId?: string;
  requiresCustomerInfo?: boolean;
  description?: string;
  externalReference?: string;
  expiresAt?: string;
  merchantId?: string;
  metadata?: Record<string, string>;
}

export interface PaymentMethodQr {
  type?: PaymentMethodType;
  payload?: string;
  imageUrl?: string;
  expiresAt?: string;
}

export interface PaymentMethodPaymentCode {
  type?: PaymentMethodType;
  code?: string;
  expiresAt?: string;
}

export interface PaymentMethod {
  qr?: PaymentMethodQr;
  paymentCode?: PaymentMethodPaymentCode;
}

export interface CheckoutSession {
  id: string;
  merchantId: string;
  customerId?: string;
  paymentIntentId: string;
  amount: Money;
  status: CheckoutSessionStatus;
  description?: string;
  successUrl?: string;
  /** Token de un solo recurso — vive corto, no expone credenciales. */
  clientSecret?: string;
  /** Pásala directo a KutiCheckout.open({ checkoutUrl }) en el frontend. */
  checkoutUrl?: string;
  paymentMethod?: PaymentMethod;
  expiresAt?: string;
  createdAt: string;
}

export interface PaymentIntent {
  id: string;
  merchantId: string;
  livemode?: boolean;
  /** Id del customer asociado (`customer.id` en la respuesta de la API). */
  customerId?: string;
  amount: Money;
  status: PaymentIntentStatus;
  paymentMethodTypes?: PaymentMethodType[];
  paymentMethod?: PaymentMethod;
  /** Presente solo si status === SUCCEEDED. */
  paidWith?: { methodType?: PaymentMethodType; paidAt?: string };
  checkoutUrl?: string;
  expiresAt?: string;
  externalReference?: string;
  description?: string;
  categoryId?: string;
  metadata?: Record<string, string>;
  requiresCustomerInfo?: boolean;
  createdAt: string;
}

export interface RequestOptions {
  /** Evita duplicar la operación si el request se reintenta (obligatorio para crear cobros con seguridad). */
  idempotencyKey?: string;
}
