export interface ErrorDetail {
  field?: string;
  code?: string;
  message?: string;
}

export interface KutiApiErrorOptions {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  docUrl?: string;
  details?: ErrorDetail[];
}

/** Error base de la API — cualquier respuesta HTTP != 2xx de payments-core lanza esto o una subclase. */
export class KutiApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly docUrl?: string;
  readonly details: ErrorDetail[];

  constructor(options: KutiApiErrorOptions) {
    super(options.message);
    this.name = "KutiApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.docUrl = options.docUrl;
    this.details = options.details ?? [];
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 401 — la secret key es inválida, está revocada, o falta. */
export class KutiAuthenticationError extends KutiApiError {
  constructor(options: KutiApiErrorOptions) {
    super(options);
    this.name = "KutiAuthenticationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 403 — la key es válida pero no tiene permiso para esta operación. */
export class KutiPermissionError extends KutiApiError {
  constructor(options: KutiApiErrorOptions) {
    super(options);
    this.name = "KutiPermissionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 404 — el recurso no existe (o no pertenece a este merchant). */
export class KutiNotFoundError extends KutiApiError {
  constructor(options: KutiApiErrorOptions) {
    super(options);
    this.name = "KutiNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 400 / 422 — el request no pasó validación. Revisa `.details` para el campo exacto. */
export class KutiValidationError extends KutiApiError {
  constructor(options: KutiApiErrorOptions) {
    super(options);
    this.name = "KutiValidationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 409 — conflicto de estado (ej. una sesión ya usada). */
export class KutiConflictError extends KutiApiError {
  constructor(options: KutiApiErrorOptions) {
    super(options);
    this.name = "KutiConflictError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** 429 — demasiadas requests. El SDK ya reintenta automáticamente antes de lanzar esto. */
export class KutiRateLimitError extends KutiApiError {
  constructor(options: KutiApiErrorOptions) {
    super(options);
    this.name = "KutiRateLimitError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Fallo de red o timeout — nunca llegó a haber una respuesta HTTP de KUTI. */
export class KutiConnectionError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "KutiConnectionError";
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** La firma de un webhook no coincide, o el timestamp está fuera de tolerancia. */
export class KutiSignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KutiSignatureVerificationError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function errorForStatus(status: number, options: KutiApiErrorOptions): KutiApiError {
  switch (status) {
    case 401:
      return new KutiAuthenticationError(options);
    case 403:
      return new KutiPermissionError(options);
    case 404:
      return new KutiNotFoundError(options);
    case 400:
    case 422:
      return new KutiValidationError(options);
    case 409:
      return new KutiConflictError(options);
    case 429:
      return new KutiRateLimitError(options);
    default:
      return new KutiApiError(options);
  }
}
