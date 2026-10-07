import { afterEach, describe, expect, it, vi } from "vitest";

import { KutiClient } from "../src/client.js";
import {
  KutiAuthenticationError,
  KutiNotFoundError,
  KutiPermissionError,
  KutiValidationError,
  KutiRateLimitError,
} from "../src/errors.js";

const SECRET_KEY = "kuti_test_abc123";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorEnvelope(code: string, message: string) {
  return {
    success: false,
    message,
    error: { code, message, request_id: "req_test_1" },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("KutiClient", () => {
  it("rejects a publishable key at construction time", () => {
    expect(() => new KutiClient({ secretKey: "kuti_pub_test_abc" })).toThrow(/secret key/i);
  });

  it("sends the secret key as a Bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          id: "pi_1",
          merchant_id: "mer_1",
          amount: { amount: "10.00", currency: "PEN" },
          status: "PENDING",
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });
    await client.paymentIntents.retrieve("pi_1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/payment-intents/pi_1");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET_KEY}`);
  });

  it("maps nested customer.id from payment intent responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: {
            id: "pi_1",
            merchant_id: "mer_1",
            customer: { id: "cus_01ABC", type: "INDIVIDUAL", name: "María López" },
            amount: { amount: "50.00", currency: "PEN" },
            status: "SUCCEEDED",
            paid_with: { method_type: "INTEROPERABLE_QR", paid_at: "2026-01-01T00:01:00Z" },
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      ),
    );
    const client = new KutiClient({ secretKey: SECRET_KEY });
    const intent = await client.paymentIntents.retrieve("pi_1");

    expect(intent.customerId).toBe("cus_01ABC");
    expect(intent.paidWith?.methodType).toBe("INTEROPERABLE_QR");
  });

  it("maps a 401 response to KutiAuthenticationError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(401, errorEnvelope("INVALID_API_KEY", "Invalid API key"))),
    );
    const client = new KutiClient({ secretKey: SECRET_KEY });

    await expect(client.paymentIntents.retrieve("pi_1")).rejects.toBeInstanceOf(
      KutiAuthenticationError,
    );
  });

  it("maps a 404 response to KutiNotFoundError with the original code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(404, errorEnvelope("PAYMENT_INTENT_NOT_FOUND", "Not found")),
      ),
    );
    const client = new KutiClient({ secretKey: SECRET_KEY });

    const error = await client.paymentIntents.retrieve("pi_missing").catch((e) => e);
    expect(error).toBeInstanceOf(KutiNotFoundError);
    expect(error.code).toBe("PAYMENT_INTENT_NOT_FOUND");
    expect(error.requestId).toBe("req_test_1");
  });

  it("maps a 422 response to KutiValidationError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, errorEnvelope("VALIDATION_ERROR", "amount is required"))),
    );
    const client = new KutiClient({ secretKey: SECRET_KEY });

    await expect(
      client.checkoutSessions.create({ amount: { amount: "", currency: "PEN" }, paymentMethodTypes: [] }),
    ).rejects.toBeInstanceOf(KutiValidationError);
  });

  it("retries a GET on 429 and succeeds if a later attempt works", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, errorEnvelope("RATE_LIMITED", "Too many requests")))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            id: "pi_1",
            merchant_id: "mer_1",
            amount: { amount: "10.00", currency: "PEN" },
            status: "PENDING",
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY });
    const intent = await client.paymentIntents.retrieve("pi_1");

    expect(intent.id).toBe("pi_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a POST without an idempotency key, and throws KutiRateLimitError", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, errorEnvelope("RATE_LIMITED", "Too many requests")));
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY });
    await expect(
      client.checkoutSessions.create({
        amount: { amount: "10.00", currency: "PEN" },
        paymentMethodTypes: ["INTEROPERABLE_QR"],
      }),
    ).rejects.toBeInstanceOf(KutiRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates a payment intent with nested customer and idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: {
          id: "pi_created",
          merchant_id: "mer_1",
          customer: { id: "cus_1" },
          amount: { amount: "50.00", currency: "PEN" },
          status: "PENDING",
          payment_method_types: ["INTEROPERABLE_QR", "BANK_TRANSFER"],
          checkout_url: "https://pay.kuti.pe/c/ABC",
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });
    const intent = await client.paymentIntents.create(
      {
        amount: { amount: "50.00", currency: "PEN" },
        paymentMethodTypes: ["INTEROPERABLE_QR", "BANK_TRANSFER"],
        customer: {
          type: "INDIVIDUAL",
          firstName: "María",
          lastName: "López",
          email: "maria@example.com",
          document: { type: "DNI", number: "45678912" },
        },
        description: "Pedido #1042",
      },
      { idempotencyKey: "order-1042" },
    );

    expect(intent.id).toBe("pi_created");
    expect(intent.customerId).toBe("cus_1");
    expect(intent.checkoutUrl).toBe("https://pay.kuti.pe/c/ABC");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/payment-intents");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("order-1042");
    const body = JSON.parse(String(init.body));
    expect(body.customer.first_name).toBe("María");
    expect(body.customer.document).toEqual({ type: "DNI", number: "45678912" });
  });

  it("does retry a POST when the caller provides an idempotency key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, errorEnvelope("RATE_LIMITED", "Too many requests")))
      .mockResolvedValueOnce(
        jsonResponse(201, {
          data: {
            id: "cs_1",
            merchant_id: "mer_1",
            payment_intent_id: "pi_1",
            amount: { amount: "10.00", currency: "PEN" },
            status: "OPEN",
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY });
    const session = await client.checkoutSessions.create(
      { amount: { amount: "10.00", currency: "PEN" }, paymentMethodTypes: ["INTEROPERABLE_QR"] },
      { idempotencyKey: "order-42" },
    );

    expect(session.id).toBe("cs_1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("order-42");
  });

  it("creates a customer with document and custom fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: {
          id: "cus_new",
          merchant_id: "mer_1",
          type: "INDIVIDUAL",
          first_name: "María",
          last_name: "López",
          document: { type: "DNI", number: "45678912", country: "PE" },
          custom_fields: { grade: "quinto", interests: ["math"] },
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });
    const customer = await client.customers.create({
      type: "INDIVIDUAL",
      firstName: "María",
      lastName: "López",
      document: { number: "45678912" },
      customFields: { grade: "5to grado", interests: ["math"] },
    });

    expect(customer.id).toBe("cus_new");
    expect(customer.document).toEqual({ type: "DNI", number: "45678912", country: "PE" });
    expect(customer.customFields).toEqual({ grade: "quinto", interests: ["math"] });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/customers");
    const body = JSON.parse(String(init.body));
    expect(body.first_name).toBe("María");
    expect(body.document).toEqual({ number: "45678912" });
    expect(body.custom_fields).toEqual({ grade: "5to grado", interests: ["math"] });
  });

  it("updates custom fields with PATCH and null removes a value", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          id: "cus_1",
          merchant_id: "mer_1",
          type: "INDIVIDUAL",
          custom_fields: { grade: "sexto" },
          created_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });
    const customer = await client.customers.update("cus_1", {
      customFields: { grade: "sexto", birth_date: null },
    });

    expect(customer.customFields).toEqual({ grade: "sexto" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/customers/cus_1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body)).custom_fields).toEqual({ grade: "sexto", birth_date: null });
  });

  it("creates a payment link and maps it to camelCase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: {
          id: "plink_1",
          merchant_id: "mer_1",
          livemode: false,
          slug: "taller-excel",
          url: "https://pay.kuti.pe/l/taller-excel",
          title: "Taller de Excel",
          template: "COURSE",
          pricing: "FIXED",
          currency: "PEN",
          amount: "120.00",
          suggested_amounts: [],
          payment_method_types: ["INTEROPERABLE_QR"],
          status: "ACTIVE",
          customer_fields: [{ id: "cfd_1", key: "codigo", label: "Código", type: "TEXT", required: true }],
          button_label: "Inscribirme",
          payments_count: 0,
          views_count: 0,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });
    const link = await client.paymentLinks.create({
      title: "Taller de Excel",
      pricing: "FIXED",
      amount: "120.00",
      paymentMethodTypes: ["INTEROPERABLE_QR"],
      customerFieldIds: ["cfd_1"],
      buttonLabel: "Inscribirme",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/payment-links");
    const body = JSON.parse(init.body as string);
    expect(body.customer_field_ids).toEqual(["cfd_1"]);
    expect(body.button_label).toBe("Inscribirme");
    expect(link.url).toBe("https://pay.kuti.pe/l/taller-excel");
    expect(link.customerFields[0]?.key).toBe("codigo");
  });

  it("filters payment intents by source and payment link, and sends send_via", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [],
          pagination: { page: 1, per_page: 25, total: 0, total_pages: 0, has_more: false },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          data: {
            id: "pi_1",
            merchant_id: "mer_1",
            amount: { amount: "10.00", currency: "PEN" },
            status: "PENDING",
            send_via: ["EMAIL", "WHATSAPP"],
            created_at: "2026-01-01T00:00:00Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });
    await client.paymentIntents.list({ source: "link", paymentLinkId: "plink_1" });
    const [listUrl] = fetchMock.mock.calls[0] as [string];
    expect(listUrl).toContain("source=link");
    expect(listUrl).toContain("payment_link_id=plink_1");

    const intent = await client.paymentIntents.create({
      amount: { amount: "10.00", currency: "PEN" },
      paymentMethodTypes: ["INTEROPERABLE_QR"],
      sendVia: ["EMAIL", "WHATSAPP"],
    });
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string).send_via).toEqual(["EMAIL", "WHATSAPP"]);
    expect(intent.sendVia).toEqual(["EMAIL", "WHATSAPP"]);
  });

  it("exposes requestId, correlationId and the kind of 403", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(403, {
          success: false,
          message: "Sin permiso",
          error: {
            code: "INSUFFICIENT_SCOPE",
            message: "Esta API key no tiene el permiso payment_intents:write.",
            request_id: "req_1",
            correlation_id: "pedido-1042",
          },
        }),
      ),
    );
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const err = await client.paymentIntents.retrieve("pi_1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(KutiPermissionError);
    const perm = err as KutiPermissionError;
    expect(perm.isInsufficientScope).toBe(true);
    expect(perm.isDashboardOnly).toBe(false);
    expect(perm.requestId).toBe("req_1");
    expect(perm.correlationId).toBe("pedido-1042");
  });

  it("lists and resolves payment exceptions", async () => {
    const exception = {
      id: "pexc_1",
      merchant_id: "mer_1",
      livemode: false,
      payment_intent_id: "pi_1",
      payment_method_type: "BANK_TRANSFER",
      amount: { amount: "250.00", currency: "PEN" },
      reason: "DUPLICATE",
      status: "OPEN",
      balance_transaction_id: "btxn_1",
      resolution_note: null,
      created_at: "2026-09-29T15:20:00Z",
      resolved_at: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [exception],
          pagination: { page: 1, per_page: 25, total: 1, total_pages: 1, has_more: false },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { ...exception, status: "REFUNDED", resolution_note: "Devuelto" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const list = await client.paymentExceptions.list({ status: "OPEN", paymentIntentId: "pi_1" });
    const resolved = await client.paymentExceptions.resolve("pexc_1", { status: "REFUNDED", note: "Devuelto" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://example.test/v1/payment-exceptions?status=OPEN&payment_intent_id=pi_1",
    );
    expect(list.data[0]).toMatchObject({ reason: "DUPLICATE", paymentIntentId: "pi_1", resolutionNote: undefined });
    expect(list.pagination.total).toBe(1);
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ status: "REFUNDED", note: "Devuelto" });
    expect(resolved.status).toBe("REFUNDED");
  });

  it("reads a request diagnosis and a payment trace", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            request: {
              id: "req_1", livemode: false, source: "API", method: "POST", path: "/payment-intents",
              status: 201, duration_ms: 84, created_at: "2026-09-29T15:10:02Z",
            },
            events: [{
              id: "evt_1", type: "payment.created", created_at: "2026-09-29T15:10:02Z",
              webhook_deliveries: [{ id: "whd_1", status: "DEAD", attempts: 6, last_http_status: 502 }],
            }],
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            payment_intent_id: "pi_1", status: "SUCCEEDED", amount: { amount: "60.00", currency: "PEN" },
            created_at: "2026-09-29T15:10:02Z",
            methods: [{ method: "INTEROPERABLE_QR", status: "SUCCEEDED" }],
            timeline: [{ at: "2026-09-29T15:10:02Z", kind: "REQUEST", title: "POST /payment-intents → 201", request_id: "req_1" }],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const diagnosis = await client.diagnostics.getRequest("req_1");
    const trace = await client.diagnostics.tracePaymentIntent("pi_1");

    expect(diagnosis.request.durationMs).toBe(84);
    expect(diagnosis.events[0].webhookDeliveries[0]).toMatchObject({ status: "DEAD", lastHttpStatus: 502 });
    expect(fetchMock.mock.calls[1][0]).toBe("https://example.test/v1/diagnostics/payment-intents/pi_1/trace");
    expect(trace.timeline[0]).toMatchObject({ kind: "REQUEST", requestId: "req_1" });
  });

  it("maps the customer payment code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: { id: "cus_1", merchant_id: "mer_1", code: "ZIZE00001", type: "INDIVIDUAL", created_at: "2026-01-01T00:00:00Z" },
        }),
      ),
    );
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const customer = await client.customers.retrieve("cus_1");

    expect(customer.code).toBe("ZIZE00001");
  });

  it("creates a subscription and maps its latest cycle", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: {
          id: "sub_1",
          merchant_id: "mer_1",
          customer: { id: "cus_1", name: "María López" },
          description: "Plan Pro",
          billing_mode: "fixed",
          amount: { amount: "99.00", currency: "PEN" },
          items: [{ description: "Plan Pro", unit_amount: "99.00", quantity: 1, amount: "99.00" }],
          frequency: "MONTHLY",
          interval: 1,
          start_date: "2026-10-05",
          charge_time: "09:00",
          status: "INCOMPLETE",
          retry_policy: { interval_days: [1, 3, 5], on_exhausted: "past_due" },
          latest_cycle: {
            id: "subc_1",
            billing_period: "2026-10",
            due_date: "2026-10-05",
            amount: { amount: "99.00", currency: "PEN" },
            status: "OPEN",
            attempts: 0,
            last_failure_code: "payment_method_required",
            payment_intent_id: "pi_1",
            checkout_url: "https://pay.kuti.pe/c/ABC",
          },
          created_at: "2026-10-05T14:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const sub = await client.subscriptions.create(
      {
        customer: { id: "cus_1" },
        description: "Plan Pro",
        amount: "99.00",
        frequency: "MONTHLY",
        chargeTime: "09:00",
        retryPolicy: { intervalDays: [1, 3, 5], onExhausted: "past_due" },
      },
      { idempotencyKey: "alta-1" },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/subscriptions");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("alta-1");
    expect(JSON.parse(init.body as string)).toMatchObject({
      customer: { id: "cus_1" },
      charge_time: "09:00",
      retry_policy: { interval_days: [1, 3, 5], on_exhausted: "past_due" },
    });
    expect(sub.status).toBe("INCOMPLETE");
    expect(sub.billingMode).toBe("fixed");
    expect(sub.retryPolicy?.intervalDays).toEqual([1, 3, 5]);
    expect(sub.latestCycle).toMatchObject({
      billingPeriod: "2026-10",
      lastFailureCode: "payment_method_required",
      checkoutUrl: "https://pay.kuti.pe/c/ABC",
    });
  });

  it("sends the amount of a variable subscription period", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          id: "sub_1",
          merchant_id: "mer_1",
          description: "LIA por consumo",
          billing_mode: "variable",
          frequency: "MONTHLY",
          interval: 1,
          start_date: "2026-09-05",
          status: "ACTIVE",
          created_at: "2026-09-05T14:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const sub = await client.subscriptions.charge("sub_1", { amount: "184.00", period: "2026-10" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/subscriptions/sub_1/charges");
    expect(JSON.parse(init.body as string)).toEqual({ amount: "184.00", period: "2026-10" });
    expect(sub.billingMode).toBe("variable");
    expect(sub.amount).toBeNull();
  });

  it("sends Idempotency-Key on subscription retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          id: "sub_1",
          merchant_id: "mer_1",
          description: "Plan Pro",
          frequency: "MONTHLY",
          interval: 1,
          start_date: "2026-10-05",
          status: "ACTIVE",
          created_at: "2026-10-05T14:00:00Z",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    await client.subscriptions.retry("sub_1", { idempotencyKey: "retry-1" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://example.test/v1/subscriptions/sub_1/retry");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("retry-1");
  });

  it("charges a saved payment method directly and lists the customer's saved methods", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ id: "pm_1", type: "YAPE", status: "ACTIVE", display: { phone_last4: "2011" } }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          data: {
            id: "pi_1",
            merchant_id: "mer_1",
            amount: { amount: "80.00", currency: "PEN" },
            status: "PENDING",
            saved_payment_methods: { status: "disabled" },
            last_saved_method_payment: { status: "FAILED", failure_code: "insufficient_funds" },
            created_at: "2026-10-05T14:00:00Z",
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    const methods = await client.customers.listPaymentMethods("cus_1");
    const pi = await client.paymentIntents.create({
      amount: { amount: "80.00", currency: "PEN" },
      paymentMethodTypes: ["YAPE"],
      customer: { id: "cus_1" },
      paymentMethod: methods[0]!.id,
      confirm: true,
    });

    expect(fetchMock.mock.calls[0]![0]).toBe("https://example.test/v1/customers/cus_1/payment-methods");
    expect(methods[0]).toMatchObject({ id: "pm_1", phoneLast4: "2011", status: "ACTIVE" });
    const body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body).toMatchObject({ payment_method: "pm_1", confirm: true });
    expect(pi.lastSavedMethodPayment).toEqual({ status: "FAILED", failureCode: "insufficient_funds" });
  });

  it("sends Idempotency-Key when creating customers and payment links, sending WhatsApp and retrying deliveries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(201, {
          data: { id: "cus_1", merchant_id: "mer_1", type: "INDIVIDUAL", first_name: "Ana", created_at: "2026-01-01T00:00:00Z" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          data: {
            id: "plink_1",
            merchant_id: "mer_1",
            livemode: false,
            slug: "taller-excel",
            url: "https://pay.kuti.pe/l/taller-excel",
            title: "Taller de Excel",
            template: "COURSE",
            pricing: "FIXED",
            currency: "PEN",
            amount: "120.00",
            suggested_amounts: [],
            payment_method_types: ["INTEROPERABLE_QR"],
            status: "ACTIVE",
            customer_fields: [],
            payments_count: 0,
            views_count: 0,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { id: "whd_1", event_id: "evt_1", status: "PENDING", attempts: 1 } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    await client.customers.create({ type: "INDIVIDUAL", firstName: "Ana" }, { idempotencyKey: "alta-ana" });
    await client.paymentLinks.create(
      { title: "Taller de Excel", pricing: "FIXED", amount: "120.00", paymentMethodTypes: ["INTEROPERABLE_QR"] },
      { idempotencyKey: "link-taller" },
    );
    await client.paymentIntents.sendWhatsApp("pi_1", { phone: "+51987654321" }, { idempotencyKey: "wa-pi_1" });
    await client.webhookDeliveries.retry("whd_1", { idempotencyKey: "retry-whd_1" });

    const sent = fetchMock.mock.calls.map(([url, init]) => [
      url as string,
      ((init as RequestInit).headers as Record<string, string>)["Idempotency-Key"],
    ]);
    expect(sent).toEqual([
      ["https://example.test/v1/customers", "alta-ana"],
      ["https://example.test/v1/payment-links", "link-taller"],
      ["https://example.test/v1/payment-intents/pi_1/send-whatsapp", "wa-pi_1"],
      ["https://example.test/v1/webhook-deliveries/whd_1/retry", "retry-whd_1"],
    ]);
  });

  it("sends no Idempotency-Key when the caller does not give one", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, {
        data: { id: "cus_1", merchant_id: "mer_1", type: "INDIVIDUAL", first_name: "Ana", created_at: "2026-01-01T00:00:00Z" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new KutiClient({ secretKey: SECRET_KEY, baseUrl: "https://example.test/v1" });

    await client.customers.create({ type: "INDIVIDUAL", firstName: "Ana" });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBeUndefined();
  });
});
