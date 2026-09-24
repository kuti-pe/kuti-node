import type { KutiClient } from "../client.js";
import type {
  CreateCustomerParams,
  Customer,
  CustomerList,
  DeleteCustomerResult,
  ListCustomersParams,
  UpdateCustomerParams,
} from "../types.js";
import {
  fromCustomerApiShape,
  toCustomerBody,
  type CustomerApiShape,
} from "./customerShape.js";

interface CustomerEnvelope {
  data: CustomerApiShape;
}

interface CustomerPageEnvelope {
  data: CustomerApiShape[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_more: boolean;
  };
}

export class CustomersResource {
  constructor(private readonly client: KutiClient) {}

  /** POST /customers — 409 CUSTOMER_ALREADY_EXISTS if the externalId or document already exists. */
  async create(params: CreateCustomerParams): Promise<Customer> {
    const body = { ...toCustomerBody(params), metadata: params.metadata };
    const response = await this.client.request<CustomerEnvelope>("POST", "/customers", body);
    return fromCustomerApiShape(response.data);
  }

  /** GET /customers/:id */
  async retrieve(id: string): Promise<Customer> {
    const response = await this.client.request<CustomerEnvelope>(
      "GET",
      `/customers/${encodeURIComponent(id)}`,
    );
    return fromCustomerApiShape(response.data);
  }

  /** PATCH /customers/:id — only the fields you send change. */
  async update(id: string, params: UpdateCustomerParams): Promise<Customer> {
    const body = {
      first_name: params.firstName,
      last_name: params.lastName,
      company_name: params.companyName,
      email: params.email,
      phone: params.phone,
      metadata: params.metadata,
      custom_fields: params.customFields,
    };
    const response = await this.client.request<CustomerEnvelope>(
      "PATCH",
      `/customers/${encodeURIComponent(id)}`,
      body,
    );
    return fromCustomerApiShape(response.data);
  }

  /** GET /customers */
  async list(params: ListCustomersParams = {}): Promise<CustomerList> {
    const qs = new URLSearchParams();
    if (params.q) qs.set("q", params.q);
    if (params.page != null) qs.set("page", String(params.page));
    if (params.perPage != null) qs.set("per_page", String(params.perPage));
    const query = qs.toString();
    const response = await this.client.request<CustomerPageEnvelope>(
      "GET",
      `/customers${query ? `?${query}` : ""}`,
    );
    return {
      data: (response.data ?? []).map(fromCustomerApiShape),
      pagination: {
        page: response.pagination.page,
        perPage: response.pagination.per_page,
        total: response.pagination.total,
        totalPages: response.pagination.total_pages,
        hasMore: response.pagination.has_more,
      },
    };
  }

  /** DELETE /customers/:id — archived instead of deleted if it has payment intents. */
  async del(id: string): Promise<DeleteCustomerResult> {
    const response = await this.client.request<{
      deleted: boolean;
      archived: boolean;
      payment_intents_count: number;
    }>("DELETE", `/customers/${encodeURIComponent(id)}`);
    return {
      deleted: response.deleted,
      archived: response.archived,
      paymentIntentsCount: response.payment_intents_count,
    };
  }
}
