import { errorForStatus, KutiConnectionError, type ErrorDetail } from "./errors.js";
import { CheckoutSessionsResource } from "./resources/checkoutSessions.js";
import { PaymentIntentsResource } from "./resources/paymentIntents.js";
import type { RequestOptions } from "./types.js";

const DEFAULT_BASE_URL = "https://api.kuti.pe/v1";
const SECRET_KEY_PREFIXES = ["kuti_live_", "kuti_test_"];
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 503]);

export interface KutiClientOptions {
  /** Secret key (`kuti_live_...` / `kuti_test_...`). Nunca la publishable key — este cliente es solo server-side. */
  secretKey: string;
  /** Solo para apuntar a un entorno distinto al de producción. */
  baseUrl?: string;
}

interface ApiErrorEnvelope {
  success: false;
  message?: string;
  error?: {
    code?: string;
    message?: string;
    request_id?: string;
    doc_url?: string;
    details?: ErrorDetail[];
  };
}

/**
 * Cliente HTTP central de KUTI. Cuelgan de aquí los recursos (`checkoutSessions`, `paymentIntents`);
 * este archivo solo resuelve auth, reintentos y mapeo de errores — cada recurso solo arma su propio
 * path/body.
 */
export class KutiClient {
  private readonly secretKey: string;
  private readonly baseUrl: string;

  readonly checkoutSessions: CheckoutSessionsResource;
  readonly paymentIntents: PaymentIntentsResource;

  constructor(options: KutiClientOptions) {
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      throw new Error(
        "KutiClient uses your secret key and must run only on the server. " +
          "Never import @kuti-pe/node in browser code.",
      );
    }
    if (!SECRET_KEY_PREFIXES.some((prefix) => options.secretKey.startsWith(prefix))) {
      throw new Error(
        "KutiClient expects a secret key (kuti_live_... / kuti_test_...), not a publishable key.",
      );
    }
    this.secretKey = options.secretKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

    this.checkoutSessions = new CheckoutSessionsResource(this);
    this.paymentIntents = new PaymentIntentsResource(this);
  }

  /** @internal usado por los recursos — no lo llames directo. */
  async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (opts?.idempotencyKey) {
      headers["Idempotency-Key"] = opts.idempotencyKey;
    }

    // Solo se reintenta si el request es idempotente por diseño (GET) o el caller ya
    // proveyó una Idempotency-Key — nunca se reintenta un POST "a ciegas", eso duplicaría cobros.
    const canRetry = method === "GET" || Boolean(opts?.idempotencyKey);

    let lastError: unknown;
    for (let attempt = 0; attempt <= (canRetry ? MAX_RETRIES : 0); attempt++) {
      if (attempt > 0) {
        await sleep(2 ** attempt * 200);
      }
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        if (response.ok) {
          if (response.status === 204) {
            return undefined as T;
          }
          const text = await response.text();
          return (text ? JSON.parse(text) : {}) as T;
        }

        const envelope = await safeParseJson<ApiErrorEnvelope>(response);
        const apiError = errorForStatus(response.status, {
          status: response.status,
          code: envelope?.error?.code ?? "UNKNOWN_ERROR",
          message: envelope?.error?.message ?? envelope?.message ?? response.statusText,
          requestId: envelope?.error?.request_id,
          docUrl: envelope?.error?.doc_url,
          details: envelope?.error?.details,
        });

        if (canRetry && RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
          lastError = apiError;
          continue;
        }
        throw apiError;
      } catch (err) {
        if (err instanceof Error && err.name.startsWith("Kuti")) {
          throw err;
        }
        lastError = new KutiConnectionError("Could not reach the KUTI API.", err);
        if (!canRetry) {
          throw lastError;
        }
      }
    }
    throw lastError;
  }
}

async function safeParseJson<T>(response: Response): Promise<T | undefined> {
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
