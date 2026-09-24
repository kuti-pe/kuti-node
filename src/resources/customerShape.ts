import type {
  Customer,
  CustomerDocument,
  CustomerInput,
  PaymentIntentCustomerSnapshot,
} from "../types.js";

/** API shape of a customer document (same everywhere). */
export interface CustomerDocumentApiShape {
  type?: string;
  number: string;
  country?: string;
}

export interface CustomerApiShape {
  id: string;
  merchant_id: string;
  external_id?: string;
  type: Customer["type"];
  first_name?: string;
  last_name?: string;
  company_name?: string;
  document?: CustomerDocumentApiShape;
  email?: string;
  phone?: string;
  metadata?: Record<string, string>;
  custom_fields?: Record<string, unknown>;
  payment_intents_count?: number;
  created_at: string;
}

export interface PaymentIntentCustomerApiShape {
  id?: string;
  type?: Customer["type"];
  first_name?: string;
  last_name?: string;
  company_name?: string;
  name?: string;
  document?: CustomerDocumentApiShape;
  email?: string;
  custom_fields?: Record<string, unknown>;
}

export function toDocumentBody(doc?: CustomerDocument): CustomerDocumentApiShape | undefined {
  return doc ? { type: doc.type, number: doc.number, country: doc.country } : undefined;
}

/** CustomerInput (camelCase) → request body (snake_case), same shape as POST /customers. */
export function toCustomerBody(c?: CustomerInput): Record<string, unknown> | undefined {
  if (!c) return undefined;
  return {
    id: c.id,
    type: c.type,
    first_name: c.firstName,
    last_name: c.lastName,
    company_name: c.companyName,
    email: c.email,
    phone: c.phone,
    external_id: c.externalId,
    document: toDocumentBody(c.document),
    custom_fields: c.customFields,
  };
}

export function fromCustomerApiShape(dto: CustomerApiShape): Customer {
  return {
    id: dto.id,
    merchantId: dto.merchant_id,
    externalId: dto.external_id,
    type: dto.type,
    firstName: dto.first_name,
    lastName: dto.last_name,
    companyName: dto.company_name,
    document: dto.document,
    email: dto.email,
    phone: dto.phone,
    metadata: dto.metadata,
    customFields: dto.custom_fields ?? {},
    paymentIntentsCount: dto.payment_intents_count,
    createdAt: dto.created_at,
  };
}

export function fromPaymentIntentCustomer(
  dto?: PaymentIntentCustomerApiShape,
): PaymentIntentCustomerSnapshot | undefined {
  if (!dto) return undefined;
  return {
    id: dto.id,
    type: dto.type,
    firstName: dto.first_name,
    lastName: dto.last_name,
    companyName: dto.company_name,
    name: dto.name,
    document: dto.document,
    email: dto.email,
    customFields: dto.custom_fields,
  };
}
