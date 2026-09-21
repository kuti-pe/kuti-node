import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { KutiSignatureVerificationError } from "../src/errors.js";
import { verifyWebhookSignature } from "../src/webhooks.js";

const SECRET = "whsec_test_1234567890";

function sign(secret: string, timestampSeconds: number, body: string): string {
  const digest = createHmac("sha256", secret).update(`${timestampSeconds}.${body}`).digest("hex");
  return `v1=${digest}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a signature computed with the same algorithm as the server", () => {
    const body = JSON.stringify({ type: "payment.succeeded", id: "evt_1" });
    const now = Math.floor(Date.now() / 1000);
    const signature = sign(SECRET, now, body);

    expect(() =>
      verifyWebhookSignature(body, signature, String(now), SECRET),
    ).not.toThrow();
  });

  it("rejects a signature computed with the wrong secret", () => {
    const body = "{}";
    const now = Math.floor(Date.now() / 1000);
    const signature = sign("wrong-secret", now, body);

    expect(() => verifyWebhookSignature(body, signature, String(now), SECRET)).toThrow(
      KutiSignatureVerificationError,
    );
  });

  it("rejects if the body was tampered with after signing", () => {
    const now = Math.floor(Date.now() / 1000);
    const signature = sign(SECRET, now, JSON.stringify({ amount: "10.00" }));

    expect(() =>
      verifyWebhookSignature(JSON.stringify({ amount: "999.00" }), signature, String(now), SECRET),
    ).toThrow(KutiSignatureVerificationError);
  });

  it("rejects a timestamp outside the tolerance window (replay protection)", () => {
    const body = "{}";
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1h ago
    const signature = sign(SECRET, staleTimestamp, body);

    expect(() =>
      verifyWebhookSignature(body, signature, String(staleTimestamp), SECRET),
    ).toThrow(KutiSignatureVerificationError);
  });

  it("accepts a stale timestamp when tolerance is widened explicitly", () => {
    const body = "{}";
    const staleTimestamp = Math.floor(Date.now() / 1000) - 3600;
    const signature = sign(SECRET, staleTimestamp, body);

    expect(() =>
      verifyWebhookSignature(body, signature, String(staleTimestamp), SECRET, 7200),
    ).not.toThrow();
  });

  it("rejects a malformed signature header", () => {
    expect(() =>
      verifyWebhookSignature("{}", "not-a-valid-signature", String(Math.floor(Date.now() / 1000)), SECRET),
    ).toThrow(KutiSignatureVerificationError);
  });
});
