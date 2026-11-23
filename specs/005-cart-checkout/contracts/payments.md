# Contrato: proveedor de pago y aviso de la pasarela

## Interfaz `PaymentProvider` (`src/lib/payments/provider.ts`)

```ts
interface PaymentProvider {
  name: 'stripe' | 'fake';
  checkoutOrigin: string; // para form-action de la CSP
  createCheckout(input: {
    orderId: string; orderNumber: string; amountCents: number; email: string;
    expiresAt: Date; successUrl: string; cancelUrl: string;
  }): Promise<{ sessionId: string; url: string }>;
  retrieveCheckout(sessionId: string): Promise<{
    status: 'open' | 'complete' | 'expired'; paid: boolean; paymentId: string | null;
    amountCents: number; orderId: string | null;
  }>;
  refund(input: { paymentId: string; orderId: string; amountCents: number }):
    Promise<{ refundId: string }>;
  verifyWebhook(rawBody: string, headers: Headers, now: Date): PaymentEvent; // lanza InvalidSignature
}

type PaymentEvent =
  | { id: string; type: 'checkout.completed'; sessionId: string; paid: boolean; paymentId: string | null; amountCents: number; orderId: string | null }
  | { id: string; type: 'checkout.expired'; sessionId: string; orderId: string | null }
  | { id: string; type: 'refund.succeeded'; paymentId: string; refundId: string }
  | { id: string; type: 'ignored'; rawType: string };
```

## Stripe (modo de pruebas)

- **Variables de entorno**:
  - `PAYMENT_PROVIDER=stripe`;
  - `STRIPE_SECRET_KEY`, que debe empezar por `sk_test_` o `rk_test_`; si no, la aplicación no
    arranca;
  - `STRIPE_WEBHOOK_SECRET` (`whsec_…`).
- **Eventos que se suscriben**: `checkout.session.completed`, `checkout.session.expired` y
  `charge.refunded`.
- **Correspondencia**:
  - `checkout.session.completed` con `payment_status=paid` pasa a `checkout.completed` con
    `paid=true`;
  - el importe (`amount_total`) MUST coincidir con `orders.total_cents` (si no coincide, se
    registra un error y se reembolsa);
  - `client_reference_id` es el `orderId`.
- **Firma**: la cabecera `Stripe-Signature: t=<unix>,v1=<hex>` se verifica con
  `HMAC_SHA256(secret, t + "." + rawBody)` y comparación en tiempo constante. Se rechaza si
  `|now − t| > 300 s`.

## `POST /api/pagos/webhook`

| Caso | Respuesta | Efecto |
|---|---|---|
| Firma no válida o caducada | 400 | log `payment_webhook_invalid_signature` |
| `event.id` ya registrado | 200 | ninguno |
| Evento procesado | 200 | `payment_events.result = ok` o `ignored` |
| Error transitorio (BD) | 500 | Stripe reintenta; el evento no queda registrado |

El procesamiento (`handlePaymentEvent`) se hace en una transacción con `SELECT … FOR UPDATE` sobre
el pedido y aplica [data-model.md](../data-model.md#transiciones-de-estado-srcdomainorder-statusts).

## Proveedor `fake`

- `createCheckout` crea la sesión `fake_<uuid>` y devuelve `${SITE_URL}/pago-simulado/<id>`.
- La página `/pago-simulado/<id>` tiene tres acciones:
  - "Pagar": crea `checkout.completed` con `paid=true` y `paymentId=fake_pi_<uuid>`;
  - "Simular rechazo": se queda en la página con "Tarjeta rechazada (simulación)", sin evento;
  - "Cancelar": 303 a `cancelUrl`.
  Los eventos se firman con `hmac(FORM_SECRET, 'fake-payments')` y pasan por `handlePaymentEvent`.
  Después, 303 a `successUrl`.
- `refund` devuelve `fake_re_<uuid>` y registra el evento `refund.succeeded`.
- Helpers de test: `emitFakeEvent(event, { duplicate, delayMs })` para probar duplicados y
  carreras.
