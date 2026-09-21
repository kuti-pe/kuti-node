import { createHmac, timingSafeEqual } from "node:crypto";

import { KutiSignatureVerificationError } from "./errors.js";

const SIGNATURE_PREFIX = "v1=";
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Verifica la firma de un webhook de KUTI. Recomputa
 * `HMAC_SHA256(secret, "<timestamp>.<body>")` con el `payload` crudo (el string exacto del body,
 * SIN parsear a JSON primero — un solo espacio de diferencia invalida la firma) y lo compara en
 * tiempo constante contra el header `X-Kuti-Signature`. También rechaza timestamps viejos para
 * evitar ataques de replay.
 *
 * @param payload Body crudo del request tal como llegó (string, no el objeto parseado).
 * @param signatureHeader Valor del header `X-Kuti-Signature` (formato `v1=<hex>`).
 * @param timestampHeader Valor del header `X-Kuti-Timestamp` (segundos Unix, como string).
 * @param secret El `signing_secret` de tu webhook endpoint (dashboard de KUTI).
 * @param toleranceSeconds Ventana de tiempo aceptada entre el timestamp firmado y ahora. Default 300s (5 min).
 * @throws {KutiSignatureVerificationError} Si la firma no coincide o el timestamp está fuera de tolerancia.
 */
export function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  timestampHeader: string,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): void {
  if (!signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    throw new KutiSignatureVerificationError("Unexpected signature format (expected v1=<hex>).");
  }

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isFinite(timestampSeconds)) {
    throw new KutiSignatureVerificationError("Invalid timestamp header.");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
    throw new KutiSignatureVerificationError(
      "Timestamp outside of tolerance — possible replay attack, or your clock is out of sync.",
    );
  }

  const expected = computeSignature(secret, timestampSeconds, payload);
  const received = signatureHeader.slice(SIGNATURE_PREFIX.length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const receivedBuffer = Buffer.from(received, "hex");
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new KutiSignatureVerificationError("Signature mismatch.");
  }
}

function computeSignature(secret: string, timestampSeconds: number, body: string): string {
  const signedPayload = `${timestampSeconds}.${body}`;
  return createHmac("sha256", secret).update(signedPayload).digest("hex");
}
