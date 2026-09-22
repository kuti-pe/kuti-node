# @kuti-pe/node

SDK oficial de KUTI para Node.js. Crea sesiones de checkout, consulta el estado de un pago y verifica webhooks — sin reimplementar auth, manejo de errores ni firma HMAC a mano.

> **Solo servidor.** Este paquete usa tu secret key (`kuti_live_...` / `kuti_test_...`) y lanza un error si detecta que corre en el navegador. Nunca lo importes en código de frontend.

## Instalación

```bash
npm install @kuti-pe/node
```

## Quickstart

```ts
import { KutiClient } from "@kuti-pe/node";

const kuti = new KutiClient({ secretKey: process.env.KUTI_SECRET_KEY! });

// El monto SIEMPRE se resuelve en tu backend — nunca confíes en un monto
// que te mande el navegador del comprador.
const session = await kuti.checkoutSessions.create(
  {
    amount: { amount: "249.90", currency: "PEN" },
    paymentMethodTypes: ["INTEROPERABLE_QR"],
    description: "Zapatillas running talla 42",
    customer: { id: "cus_01ABC" }, // existente — si viene id, se ignora el resto
    // customer: { name: "María López", email: "maria@example.com" },
  },
  { idempotencyKey: `order-${orderId}` }, // evita duplicar el cobro si reintentas el request
);

// Envía session.checkoutUrl al frontend y ábrelo con KUTI.js:
//   window.Kuti.open({ checkoutUrl: session.checkoutUrl, onSuccess, onFailure });
```

## Confirmar un pago (sin necesitar webhooks)

`onSuccess` de KUTI.js corre en el navegador del comprador — no es confiable por sí solo. Vuelve a preguntarle a la API:

```ts
const intent = await kuti.paymentIntents.retrieve(paymentIntentId);
if (intent.status === "SUCCEEDED") {
  // entrega el producto / activa el servicio
}
```

## Verificar un webhook

```ts
import { verifyWebhookSignature, KutiSignatureVerificationError } from "@kuti-pe/node";
import express from "express";

const app = express();

app.post("/webhooks/kuti", express.text({ type: "*/*" }), (req, res) => {
  try {
    verifyWebhookSignature(
      req.body, // el string CRUDO del body, sin parsear a JSON antes de verificar
      req.header("X-Kuti-Signature")!,
      req.header("X-Kuti-Timestamp")!,
      process.env.KUTI_WEBHOOK_SECRET!,
    );
  } catch (err) {
    if (err instanceof KutiSignatureVerificationError) {
      return res.status(400).send("Invalid signature");
    }
    throw err;
  }

  const event = JSON.parse(req.body);
  // procesa event.type (payment.succeeded, checkout.session.completed, ...)
  res.sendStatus(200);
});
```

## Manejo de errores

Todas las excepciones de la API extienden `KutiApiError` (`status`, `code`, `requestId`, `docUrl`, `details`). Hay subclases para los casos más comunes:

```ts
import { KutiValidationError, KutiNotFoundError, KutiApiError } from "@kuti-pe/node";

try {
  await kuti.checkoutSessions.create(params);
} catch (err) {
  if (err instanceof KutiValidationError) {
    console.error(err.details); // [{ field: "amount.amount", code: "MUST_BE_POSITIVE", ... }]
  } else if (err instanceof KutiNotFoundError) {
    // ...
  } else if (err instanceof KutiApiError) {
    console.error(err.code, err.requestId); // úsalo al reportar un bug a soporte
  }
}
```

Los `GET` y los `POST` con `idempotencyKey` se reintentan automáticamente en errores de red o `429`/`503`. Un `POST` sin `idempotencyKey` nunca se reintenta, para no duplicar un cobro.

## API

- `new KutiClient({ secretKey, baseUrl? })`
- `kuti.checkoutSessions.create(params, opts?)`
- `kuti.paymentIntents.retrieve(id)`
- `verifyWebhookSignature(payload, signatureHeader, timestampHeader, secret, toleranceSeconds?)`
