import { afterEach, describe, expect, it, vi } from "vitest";

import { KutiClient } from "../src/client.js";
import {
  KutiAuthenticationError,
  KutiNotFoundError,
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
});
