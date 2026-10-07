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

Todas las excepciones de la API extienden `KutiApiError` (`status`, `code`, `requestId`, `correlationId`, `docUrl`, `details`). Hay subclases para los casos más comunes:

```ts
import { KutiValidationError, KutiNotFoundError, KutiPermissionError, KutiApiError } from "@kuti-pe/node";

try {
  await kuti.checkoutSessions.create(params);
} catch (err) {
  if (err instanceof KutiValidationError) {
    console.error(err.details); // [{ field: "amount.amount", code: "MUST_BE_POSITIVE", ... }]
  } else if (err instanceof KutiNotFoundError) {
    // ...
  } else if (err instanceof KutiPermissionError) {
    if (err.isInsufficientScope) {
      // a la API key le falta el permiso de este endpoint (edítala en el panel o usa otra)
    } else if (err.isDashboardOnly) {
      // endpoint solo del panel de KUTI (p. ej. cambiar la cuenta bancaria): ninguna key puede usarlo
    }
  } else if (err instanceof KutiApiError) {
    console.error(err.code, err.requestId); // úsalo al reportar un bug a soporte
  }
}
```

¿Qué pasó con esa llamada? Con el `requestId` del error:

```ts
const diagnosis = await kuti.diagnostics.getRequest(err.requestId!);
// diagnosis.request: método, ruta, status, errorCode, duración
// diagnosis.events: eventos que causó y el resultado de cada webhook
```

Los `GET` y los `POST` con `idempotencyKey` se reintentan automáticamente en errores de red o `429`/`503`. Un `POST` sin `idempotencyKey` nunca se reintenta, para no duplicar un cobro.

Aceptan `{ idempotencyKey }` como último argumento: `paymentIntents.create`, `paymentIntents.sendWhatsApp`, `checkoutSessions.create`, `customers.create`, `paymentLinks.create`, `webhookDeliveries.retry` y `subscriptions.create | charge | retry | pause | resume | cancel`. Con la misma llave y el mismo contenido recibes la respuesta original y nada se hace dos veces; la misma llave con otro contenido responde `409 IDEMPOTENCY_CONFLICT`.

```ts
// Un reintento no crea otro cliente ni le manda el mensaje dos veces.
const customer = await kuti.customers.create(
  { type: "INDIVIDUAL", firstName: "Ana", lastName: "Rojas" },
  { idempotencyKey: `alta-${userId}` },
);
await kuti.paymentIntents.sendWhatsApp(pi.id, {}, { idempotencyKey: `wa-${pi.id}` });
```

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

## Yape afiliado y suscripciones

> Disponible en producción próximamente. Ya puedes integrarlo y probarlo con una clave de prueba
> (`kuti_test_…`).

Con `YAPE` en `paymentMethodTypes`, tu cliente aprueba una sola vez desde su app y su Yape queda
afiliado a tu negocio. Desde ahí puedes cobrarle sin que vuelva a aprobar.

```ts
// Qué tiene guardado el cliente
const [yape] = await kuti.customers.listPaymentMethods("cus_…");

// Cobrarle ahora, sin que esté presente
const pi = await kuti.paymentIntents.create(
  {
    amount: { amount: "80.00", currency: "PEN" },
    paymentMethodTypes: ["YAPE"],
    customer: { id: "cus_…" },
    description: "Pedido #1042",
    sendVia: [],
    paymentMethod: yape.id,
    confirm: true,
  },
  { idempotencyKey: "pedido-1042" },
);
// pi.status === "SUCCEEDED", o pi.lastSavedMethodPayment.failureCode (p. ej. "insufficient_funds")
// y el cobro queda abierto: su enlace (pi.checkoutUrl) sigue sirviendo.

// Enviarle un enlace donde vea su Yape guardado y pague con un toque (vale 30 minutos)
await kuti.paymentIntents.create({
  amount: { amount: "120.00", currency: "PEN" },
  paymentMethodTypes: ["YAPE", "INTEROPERABLE_QR"],
  customer: { id: "cus_…" },
  savedPaymentMethods: "enabled",
});

// Tienda con login propio que incrusta el checkout: la llave se la pasas a KUTI.js
const { customerSessionSecret } = await kuti.paymentIntents.createCustomerSession(pi.id);
```

**Suscripción de monto fijo.** KUTI cobra solo cada periodo (máximo S/ 2,500).

```ts
const sub = await kuti.subscriptions.create(
  {
    customer: { id: "cus_…" },
    description: "Plan Pro",
    amount: "99.00",
    frequency: "MONTHLY",
    chargeTime: "09:00", // hora de Perú; nunca entre 01:00 y 03:00
    retryPolicy: { intervalDays: [1, 3, 5], onExhausted: "past_due" }, // opcional
    metadata: { workspace_id: "ws_4821" },
  },
  { idempotencyKey: `sub-plan-${customerId}` },
);

if (sub.status === "INCOMPLETE") {
  // El cliente aún no tiene su Yape afiliado: debe afiliarlo y pagar el primer periodo aquí.
  console.log(sub.latestCycle?.checkoutUrl);
}
```

**Suscripción de monto variable** (por consumo). Al crearla no se cobra nada; se cobra a periodo
vencido y tú envías el monto de cada periodo.

```ts
const sub = await kuti.subscriptions.create({
  customer: { id: "cus_…" },
  description: "LIA por consumo",
  billingMode: "variable",
  frequency: "MONTHLY",
});
// Si falta afiliar: sub.setupUrl (también se lo enviamos por correo).

// Al recibir el webhook subscription.amount_required (o al cerrar tu periodo):
await kuti.subscriptions.charge(
  sub.id,
  { amount: "184.00", description: "92 alumnos en octubre", period: "2026-10" },
  { idempotencyKey: `consumo-${sub.id}-2026-10` },
);
```

Eventos: `subscription.created`, `.activated`, `.payment_succeeded`, `.payment_failed`,
`.amount_required`, `.period_skipped`, `.updated`, `.paused`, `.resumed`, `.cancelled`,
`.completed`. El `data` es la suscripción completa; `latest_cycle` trae el motivo del fallo, el
intento y cuándo se reintenta. KUTI no corta tu servicio: tú decides qué hacer con cada aviso.

## API

- `kuti.customers.create(params)` / `retrieve(id)` / `update(id, params)` / `list(params?)` / `del(id)`
- `kuti.customers.listPaymentMethods(id)` / `detachPaymentMethod(id, paymentMethodId)` — Yape afiliado del cliente
- `kuti.checkoutSessions.create(params, opts?)` — Checkout.js
- `kuti.paymentIntents.create(params, opts?)` — cobro directo
- `kuti.paymentIntents.list(params?)` — filtros `status`, `q`, `customerId`, `source` (single | link | subscription), `paymentLinkId`
- `kuti.paymentIntents.retrieve(id)`
- `kuti.paymentIntents.cancel(id)`
- `kuti.paymentIntents.sendWhatsApp(id, params?)`
- `kuti.paymentIntents.enableSavedPaymentMethods(id)` / `createCustomerSession(id)` — mostrar el Yape guardado en el checkout
- `kuti.subscriptions.create(params, opts?)` / `retrieve(id)` / `list(params?)` / `update(id, params)` / `pause(id, opts?)` / `resume(id, opts?)` / `cancel(id, opts?)` / `retry(id, opts?)` / `charge(id, params, opts?)` / `listCycles(id)`
- `kuti.paymentLinks.create(params)` / `retrieve(id)` / `update(id, params)` / `list(params?)` / `activate(id)` / `deactivate(id)` / `checkSlug(slug, exceptId?)`
- `kuti.paymentExceptions.list(params?)` / `resolve(id, { status, note })` — pagos para revisar (pagaron dos veces, un cobro anulado, otro monto…)
- `kuti.webhookDeliveries.retrieve(id)` / `retry(id)` — cada intento con el status HTTP y lo que respondió tu servidor
- `kuti.diagnostics.getRequest(requestId)` / `listByCorrelationId(id)` / `tracePaymentIntent(id)` — permiso `diagnostics:read` (ideal con una key de Solo lectura)
- `verifyWebhookSignature(...)`
