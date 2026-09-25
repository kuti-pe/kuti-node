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

const session = await kuti.checkoutSessions.create(
  {
    amount: { amount: "249.90", currency: "PEN" },
    paymentMethodTypes: ["INTEROPERABLE_QR"],
    description: "Zapatillas running talla 42",
    customer: { id: "cus_01ABC" },
    // customer: { firstName: "María", lastName: "López", email: "maria@example.com" },
  },
  { idempotencyKey: `order-${orderId}` },
);

// window.Kuti.open({ checkoutUrl: session.checkoutUrl, onSuccess, onFailure })
```

## Confirmar un pago

```ts
const intent = await kuti.paymentIntents.retrieve(paymentIntentId);
if (intent.status === "SUCCEEDED") {
  // fulfill order
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

## Clientes y campos personalizados

El cliente tiene la **misma forma** en `customers.create`, en el `customer` de un cobro y en el de
una checkout session. `customFields` son los campos que el negocio definió en
**Ajustes → Clientes → Campos** (la key de cada campo):

```ts
const customer = await kuti.customers.create({
  type: "INDIVIDUAL",
  firstName: "María",
  lastName: "López",
  document: { type: "DNI", number: "45678912" }, // type opcional: se deduce del número
  email: "maria@example.com",
  customFields: { grade: "quinto", student_code: "2026-00781" },
});

// En un cobro: se reutiliza el cliente por id → externalId → documento, o se crea.
await kuti.paymentIntents.create(
  {
    amount: { amount: "250.00", currency: "PEN" },
    paymentMethodTypes: ["INTEROPERABLE_QR"],
    description: "Pensión marzo",
    customer: { document: { number: "45678912" }, customFields: { grade: "sexto" } },
  },
  { idempotencyKey: "pension-2026-03-45678912" },
);

// Editar: solo cambian las keys enviadas; null borra el valor.
await kuti.customers.update(customer.id, { customFields: { birth_date: null } });
```

## Links de pago

Un enlace permanente que pagan muchas personas (curso, entrada, donación). Cada pago es un cobro
normal con `paymentLinkId`.

```ts
const link = await kuti.paymentLinks.create({
  title: "Taller de Excel — sábado 10am",
  template: "COURSE",
  pricing: "FIXED",
  amount: "120.00",
  paymentMethodTypes: ["INTEROPERABLE_QR", "BANK_TRANSFER"],
  customerFieldIds: ["cfd_…"], // preguntas a quien paga ([] = solo nombre, apellido y correo)
  buttonLabel: "Inscribirme",
  successMessage: "¡Listo! Te esperamos el sábado.",
  successButtonLabel: "Unirme al grupo",
  successButtonUrl: "https://chat.whatsapp.com/…",
});
console.log(link.url); // https://pay.kuti.pe/l/taller-de-excel

// Donación: monto libre
await kuti.paymentLinks.create({
  title: "Donación para la biblioteca",
  template: "DONATION",
  pricing: "CUSTOMER_CHOOSES",
  minAmount: "5.00",
  suggestedAmounts: ["20.00", "50.00", "100.00"],
  paymentMethodTypes: ["INTEROPERABLE_QR", "BANK_TRANSFER"],
});

// Quienes pagaron un link
const paid = await kuti.paymentIntents.list({ paymentLinkId: link.id, status: "SUCCEEDED", perPage: "all" });
```

## Enviar el cobro al crearlo

```ts
await kuti.paymentIntents.create({
  amount: { amount: "250.00", currency: "PEN" },
  paymentMethodTypes: ["INTEROPERABLE_QR"],
  customer: { id: "cus_…" },
  sendVia: ["EMAIL", "WHATSAPP"], // sin enviar = ["EMAIL"]; [] = no enviar
});
```

## API

- `kuti.customers.create(params)` / `retrieve(id)` / `update(id, params)` / `list(params?)` / `del(id)`
- `kuti.checkoutSessions.create(params, opts?)` — Checkout.js
- `kuti.paymentIntents.create(params, opts?)` — cobro directo
- `kuti.paymentIntents.list(params?)` — filtros `status`, `q`, `customerId`, `source` (single | link | recurring), `paymentLinkId`
- `kuti.paymentIntents.retrieve(id)`
- `kuti.paymentIntents.cancel(id)`
- `kuti.paymentIntents.sendWhatsApp(id, params?)`
- `kuti.paymentLinks.create(params)` / `retrieve(id)` / `update(id, params)` / `list(params?)` / `activate(id)` / `deactivate(id)` / `checkSlug(slug, exceptId?)`
- `verifyWebhookSignature(...)`
