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

export type CustomerType = "INDIVIDUAL" | "COMPANY";

export type DocumentType = "DNI" | "RUC" | "CE" | "PASSPORT" | "DIPLOMATIC_ID" | "OTHER";

/**
 * Custom fields defined by the merchant (Settings → Customers → Fields), keyed by field key.
 * Values: string (TEXT, NUMBER as "12.5", DATE "YYYY-MM-DD", HOUR "HH:mm", SELECT option key…),
 * boolean (BOOLEAN) or string[] (MULTISELECT). On update, `null` removes a value.
 */
export type CustomFieldValues = Record<string, unknown>;

export interface CustomerDocument {
  /** Optional: inferred from the number (8 digits = DNI, 11 digits 10/15/17/20… = RUC). */
  type?: DocumentType | string;
  number: string;
  /** ISO 3166-1 alpha-2. Defaults to PE. */
  country?: string;
}

/**
 * Customer data sent inline (payment intent, checkout session). Same shape as `customers.create`.
 * An existing customer is reused by id → externalId → document; otherwise a new one is created.
 */
export interface CustomerInput {
  /** Existing customer (cus_…). If set, other fields are ignored (except customFields). */
  id?: string;
  type?: CustomerType;
  firstName?: string;
  lastName?: string;
  /** Legal name, only for type COMPANY. */
  companyName?: string;
  email?: string;
  /** E.164 */
  phone?: string;
  externalId?: string;
  document?: CustomerDocument;
  customFields?: CustomFieldValues;
}

/** Customer of a checkout session: every field is optional (a one-off charge can be anonymous). */
export type CheckoutSessionCustomer = CustomerInput;

/** Customer of a payment intent. */
export type PaymentIntentCustomer = CustomerInput;

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

/** Customer data frozen on the payment intent when it was created. */
export interface PaymentIntentCustomerSnapshot {
  id?: string;
  type?: CustomerType;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  /** Display name ("First Last" or legal name). */
  name?: string;
  document?: CustomerDocument;
  email?: string;
  customFields?: CustomFieldValues;
}

export interface PaymentIntent {
  id: string;
  merchantId: string;
  livemode?: boolean;
  customerId?: string;
  customer?: PaymentIntentCustomerSnapshot;
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

export interface Customer {
  id: string;
  merchantId: string;
  externalId?: string;
  type: CustomerType;
  firstName?: string;
  lastName?: string;
  companyName?: string;
  document?: CustomerDocument;
  email?: string;
  phone?: string;
  metadata?: Record<string, string>;
  customFields: CustomFieldValues;
  /** Only in `customers.retrieve`. */
  paymentIntentsCount?: number;
  createdAt: string;
}

export interface CreateCustomerParams extends Omit<CustomerInput, "id"> {
  type: CustomerType;
  metadata?: Record<string, string>;
}

/** Only the fields you send change. Type, document and externalId cannot be edited. */
export interface UpdateCustomerParams {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  /** Replaces the whole metadata object. */
  metadata?: Record<string, string>;
  /** Only the keys you send change; `null` removes a value. */
  customFields?: CustomFieldValues;
}

export interface ListCustomersParams {
  /** Searches name, legal name, email, document and externalId. */
  q?: string;
  page?: number;
  /** 1–100 or "all" */
  perPage?: number | "all";
}

export interface CustomerList {
  data: Customer[];
  pagination: Pagination;
}

export interface DeleteCustomerResult {
  deleted: boolean;
  /** true = archived because it has payment intents; false = permanently deleted. */
  archived: boolean;
  paymentIntentsCount: number;
}
