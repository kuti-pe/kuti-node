export interface Money {
  /** Decimal string (never float). Currency: PEN only for now. */
  amount: string;
  currency: "PEN" | string;
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
  /** Existing customer (cus_…). If set, other fields are ignored. */
  id?: string;
  externalId?: string;
  name?: string;
  email?: string;
  /** E.164 */
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

export interface PaymentIntentCustomer {
  /** Existing customer (cus_…). If set, other fields are ignored. */
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
  receivableId?: string;
  categoryId?: string;
  requiresCustomerInfo?: boolean;
  description?: string;
  externalReference?: string;
  expiresAt?: string;
  merchantId?: string;
  metadata?: Record<string, string>;
}

export interface ListPaymentIntentsParams {
  status?: PaymentIntentStatus;
  q?: string;
  customerId?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  /** 1–100 or "all" */
  perPage?: number | "all";
}

export interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

export interface PaymentIntentList {
  data: PaymentIntent[];
  pagination: Pagination;
}

export interface SendWhatsAppParams {
  phone?: string;
  customerName?: string;
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
  clientSecret?: string;
  checkoutUrl?: string;
  paymentMethod?: PaymentMethod;
  expiresAt?: string;
  createdAt: string;
}

export interface PaymentIntent {
  id: string;
  merchantId: string;
  livemode?: boolean;
  customerId?: string;
  amount: Money;
  status: PaymentIntentStatus;
  paymentMethodTypes?: PaymentMethodType[];
  paymentMethod?: PaymentMethod;
  /** Only when status === SUCCEEDED. */
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
  idempotencyKey?: string;
}
