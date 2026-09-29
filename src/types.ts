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
  /**
   * Por dónde se le envía el cobro al cliente al crearlo. Sin enviar = ["EMAIL"];
   * [] = no enviar nada. WHATSAPP necesita teléfono del cliente (usa 1 moneda).
   */
  sendVia?: SendChannel[];
}

export type SendChannel = "EMAIL" | "WHATSAPP";

/** Origen del cobro: a una persona, de un link de pago o de un cobro recurrente. */
export type PaymentIntentSource = "single" | "link" | "recurring";

export interface ListPaymentIntentsParams {
  status?: PaymentIntentStatus;
  q?: string;
  customerId?: string;
  source?: PaymentIntentSource;
  /** Solo los cobros de este link de pago (plink_…). */
  paymentLinkId?: string;
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
  /** Link de pago del que salió este cobro (plink_…), si aplica. */
  paymentLinkId?: string | null;
  /** Canales por los que se envió el cobro al crearlo. */
  sendVia?: SendChannel[];
  createdAt: string;
}

export interface RequestOptions {
  idempotencyKey?: string;
}

export interface Customer {
  id: string;
  merchantId: string;
  /** Código de pago del cliente (prefijo del negocio + número, ej. ZIZE00001). Lo asigna KUTI. */
  code?: string;
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

// ---- Payment links ----

export type PaymentLinkTemplate = "COURSE" | "EVENT" | "DONATION" | "GENERIC";
export type PaymentLinkPricing = "FIXED" | "CUSTOMER_CHOOSES";
export type PaymentLinkStatus = "ACTIVE" | "INACTIVE";

/** Pregunta que el link le hace a quien paga (copia del campo personalizado). */
export interface PaymentLinkCustomerField {
  id: string;
  key: string;
  label: string;
  type: string;
  options: { key: string; label: string }[];
  required: boolean;
  helpText?: string | null;
}

export interface PaymentLink {
  id: string;
  merchantId: string;
  livemode: boolean;
  slug: string;
  /** URL pública para compartir (pay.kuti.pe/l/{slug}). */
  url: string;
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  template: PaymentLinkTemplate;
  pricing: PaymentLinkPricing;
  currency: string;
  amount?: string | null;
  minAmount?: string | null;
  maxAmount?: string | null;
  suggestedAmounts: string[];
  paymentMethodTypes: PaymentMethodType[];
  categoryId?: string | null;
  status: PaymentLinkStatus;
  expiresAt?: string | null;
  customerFields: PaymentLinkCustomerField[];
  buttonLabel?: string | null;
  successMessage?: string | null;
  successButtonLabel?: string | null;
  successButtonUrl?: string | null;
  /** Pagos confirmados. */
  paymentsCount?: number;
  /** Personas que llenaron sus datos (cobros creados desde el link). */
  checkoutsCount?: number;
  /** Visitas a la página pública. */
  viewsCount?: number;
  amountCollected?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentLinkParams {
  title: string;
  pricing: PaymentLinkPricing;
  paymentMethodTypes: PaymentMethodType[];
  /** Solo FIXED. */
  amount?: string;
  /** Solo CUSTOMER_CHOOSES (obligatorio). */
  minAmount?: string;
  maxAmount?: string;
  /** Hasta 4. */
  suggestedAmounts?: string[];
  /** Sin enviar = se genera del título. */
  slug?: string;
  template?: PaymentLinkTemplate;
  description?: string | null;
  imageUrl?: string | null;
  currency?: string;
  categoryId?: string | null;
  expiresAt?: string | null;
  /**
   * Campos personalizados (cfd_…) a preguntar, en orden. El link guarda una copia.
   * Al crear sin enviar = los "pedir también al pagar"; [] = ninguno.
   */
  customerFieldIds?: string[];
  buttonLabel?: string | null;
  successMessage?: string | null;
  successButtonLabel?: string | null;
  successButtonUrl?: string | null;
}

export interface ListPaymentLinksParams {
  status?: PaymentLinkStatus;
  q?: string;
  page?: number;
  perPage?: number | "all";
}

export interface PaymentLinkList {
  data: PaymentLink[];
  pagination: Pagination;
}

export interface SlugAvailability {
  slug: string;
  available: boolean;
  suggestion: string;
}

// ---------- Pagos para revisar ----------

/**
 * DUPLICATE = ya estaba pagado por otro método; ON_CANCELLED / ON_FAILED = se pagó un cobro anulado
 * o fallido; RECEIVABLE_ALREADY_PAID = la cuota ya estaba pagada; AMOUNT_MISMATCH = entró otro monto.
 */
export type PaymentExceptionReason =
  | "DUPLICATE"
  | "ON_CANCELLED"
  | "ON_FAILED"
  | "RECEIVABLE_ALREADY_PAID"
  | "AMOUNT_MISMATCH";

export type PaymentExceptionStatus = "OPEN" | "REFUNDED" | "APPLIED" | "DISMISSED";

/** Un pago que entró pero no correspondía. El dinero ya está en tu saldo. */
export interface PaymentException {
  id: string;
  merchantId: string;
  livemode: boolean;
  paymentIntentId: string;
  paymentMethodType?: PaymentMethodType;
  /** Lo que realmente entró. */
  amount: Money;
  reason: PaymentExceptionReason;
  status: PaymentExceptionStatus;
  balanceTransactionId?: string;
  resolutionNote?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface ListPaymentExceptionsParams {
  status?: PaymentExceptionStatus;
  paymentIntentId?: string;
  page?: number;
  perPage?: number;
}

export interface PaymentExceptionList {
  data: PaymentException[];
  pagination: Pagination;
}

export interface ResolvePaymentExceptionParams {
  /** REFUNDED = lo devolviste; APPLIED = lo aplicaste a otra deuda; DISMISSED = no requiere acción. */
  status: Exclude<PaymentExceptionStatus, "OPEN">;
  note?: string;
}

// ---------- Webhooks ----------

export type WebhookDeliveryStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "DEAD";

export interface WebhookDeliveryAttempt {
  id: string;
  attemptNumber: number;
  attemptedAt: string;
  ok: boolean;
  httpStatus?: number;
  error?: string;
  /** El JSON firmado que KUTI envió. */
  requestBody?: string;
  /** Lo que respondió tu servidor (truncado a 2 KB). */
  responseBody?: string;
}

export interface WebhookDelivery {
  id: string;
  eventId: string;
  webhookEndpointId?: string;
  endpointUrl?: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastHttpStatus?: number;
  lastError?: string;
  nextAttemptAt?: string;
  deliveredAt?: string;
  /** Del más reciente al más antiguo. */
  attemptHistory: WebhookDeliveryAttempt[];
}

// ---------- Diagnóstico ----------

export interface DiagnosticRequest {
  id: string;
  correlationId?: string;
  livemode: boolean;
  /** API = con API key; DASHBOARD = desde el panel. */
  source: "API" | "DASHBOARD";
  apiKeyId?: string;
  method: string;
  path: string;
  route?: string;
  resourceId?: string;
  status: number;
  errorCode?: string;
  durationMs: number;
  idempotencyKey?: string;
  createdAt: string;
}

export interface DiagnosticWebhookDelivery {
  id: string;
  status: WebhookDeliveryStatus;
  attempts: number;
  lastHttpStatus?: number;
  lastError?: string;
  endpointUrl?: string;
  lastAttemptAt?: string;
}

export interface DiagnosticEvent {
  id: string;
  type: string;
  createdAt: string;
  webhookDeliveries: DiagnosticWebhookDelivery[];
}

/** Qué pasó con una petición y qué causó. */
export interface DiagnosticRequestDetail {
  request: DiagnosticRequest;
  events: DiagnosticEvent[];
}

export interface PaymentTraceEntry {
  at?: string;
  kind: "REQUEST" | "EVENT" | "WEBHOOK_DELIVERY" | "PAYMENT_REVIEW";
  /** Frase corta, sin nombre de proveedor (ej. "POST /payment-intents → 201"). */
  title: string;
  requestId?: string;
  eventId?: string;
  deliveryId?: string;
  httpStatus?: number;
  errorCode?: string;
}

/** Historia de un cobro. Los métodos se muestran por tipo, nunca por proveedor. */
export interface PaymentTrace {
  paymentIntentId: string;
  status: PaymentIntentStatus;
  amount: Money;
  cancellationReason?: string;
  createdAt: string;
  methods: { method: PaymentMethodType; status: string }[];
  timeline: PaymentTraceEntry[];
}
