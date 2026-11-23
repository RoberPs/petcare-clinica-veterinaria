# Implementation Plan: Carrito de la compra y pago

**Branch**: `005-cart-checkout` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-cart-checkout/spec.md`

## Summary

Completar la tienda con:
- carrito en el servidor (cookie `pc_cart` para invitados y unión de carritos al iniciar sesión);
- checkout sin JavaScript;
- pago con tarjeta en **Stripe Checkout en modo de pruebas** (página alojada, llamadas HTTP sin
  SDK, aviso firmado y conciliación al volver), con un proveedor `fake` para local y tests;
- pago en clínica con recogida;
- pedidos con ciclo de vida, reserva de stock atómica, caducidad y reembolsos;
- correos por la bandeja de salida;
- "Mis pedidos";
- enlace privado para invitados;
- códigos de descuento.

La clínica gestiona los pedidos con un CLI mientras no haya panel. Las decisiones están en
[research.md](research.md) (D1–D20), y el modelo en [data-model.md](data-model.md) (migración
`0004_cart_checkout`).

## Technical Context

**Language/Version**: TypeScript strict sobre Node.js 22 LTS.

**Primary Dependencies**: Next.js 15 (App Router, RSC, Server Actions), React 19, Drizzle ORM y
`pg`, Zod 4, pino y `@js-temporal/polyfill`. **Sin dependencias nuevas**: Stripe se usa por HTTP
con `fetch` y `node:crypto` (D1).

**Storage**: PostgreSQL 16, con la migración `0004_cart_checkout`:
- 9 tablas nuevas;
- columnas nuevas en `shop_settings` y `email_outbox`;
- enums ampliados;
- la secuencia `order_number_seq`.

**Testing**: Vitest (unitarias e integración contra PostgreSQL), Playwright con
`@axe-core/playwright` (móvil, escritorio y sin JavaScript) con el proveedor `fake`, y Lighthouse
CI.

**Target Platform**: Docker Compose en el VPS compartido, detrás de Caddy y Cloudflare, con un
temporizador de systemd nuevo (`orders:maintain`).

**Project Type**: Aplicación web monolítica (Next.js).

**Performance Goals**:
- Lighthouse móvil ≥ 90 en `/`, `/productos` y una ficha;
- el contador de la cabecera añade una consulta indexada, y solo si hay cookie o sesión;
- la confirmación del pedido se hace en una sola transacción.

**Constraints**:
- PCI: ningún dato de tarjeta en la web propia;
- solo claves `sk_test_`;
- sin JavaScript obligatorio hasta la pasarela;
- WCAG 2.2 AA;
- solo tokens y componentes de `design/`;
- ningún dato de la clínica en `src/`;
- `Europe/Madrid` y `1.234,56 €`.

**Scale/Scope**:
- demo con 24 productos, decenas de pedidos y pocos compradores a la vez;
- el diseño resiste la concurrencia sobre la última unidad;
- 11 páginas nuevas o modificadas, 1 webhook, 1 CLI y 1 tarea programada.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | Componentes existentes: `.cart-btn`, `.cart-count`, `.cart-layout`, `.cart-item`, `.qty`, `.summary`, `.steps`, `.option`, `.panel`, `.field-row`, `table.orders`, `.side-nav`, `.btn` y `.empty-state`. Se añaden solo con tokens `.product__link` (tarjeta con enlace extendido, D14) y estilos de aviso por línea si faltan. Los CTA de compra van en marino y no en el cian de la maqueta (reservado para pedir cita); la confirmación va en menta. Se quitan los `style=""` de `cuenta.html`. | ✅ |
| **II. Marca propia** | No se publican productos, importes ni textos de las maquetas. Los avisos de demostración del catálogo, del checkout, de los correos y de la pasarela simulada evitan que parezca una tienda real. Las condiciones de venta son contenido de la clínica. | ✅ |
| **III. Tests de flujos críticos** | Checkout y pago (aceptado, rechazado, cancelado, duplicado y tardío) y cambios de estado del pedido tienen tests unitarios, de integración y e2e, con IDOR y axe incluidos (D20). Ninguno depende de la red. | ✅ |
| **IV. Privacidad y seguridad** | Solo se piden los campos imprescindibles, con su finalidad (FR-007). `pc_cart` es técnica (`HttpOnly`, `Secure`, `SameSite=Lax`) y se guarda solo su hash. El aviso se acepta solo con firma HMAC verificada y la confirmación al volver se consulta en el servidor. Hay límites por origen (`checkout_origin` y `discount_origin`) y por correo o cliente. El IDOR se comprueba en cada consulta. El enlace de invitado está firmado y caduca. Exportación v2 con pedidos; al borrar la cuenta, los pedidos se desvinculan y se conservan por obligación legal. Logs sin datos personales. Los secretos solo van en `.env`. | ✅ |
| **V. WCAG 2.2 AA** | Etiquetas en cantidad, código y campos; errores junto al campo y anunciados; contador con `aria-label`; avisos en `role="status"`; pasos con `aria-current="step"`; estados con texto. Sin recargas automáticas (D7). axe en todas las rutas nuevas, en los tres proyectos. | ✅ |
| **VI. Rendimiento** | No se añade JavaScript propio ni de terceros. Lighthouse sigue ejecutándose en `/productos` y en una ficha. | ✅ |
| **VII. Pagos de prueba** | Pago en la página de Stripe, sin datos de tarjeta en la web propia. Las claves que no son de prueba se rechazan al arrancar (D1). Avisos firmados, rechazos, cancelaciones, reembolsos e idempotencia completos (D7–D9). La interfaz indica que es una demo. | ✅ |
| **VIII. Producto real y adaptable** | Stock, IVA, ciclo de vida del pedido, caducidades, reembolsos y correos son reales. Envío, pago, zonas, plazos, códigos y textos son datos de la clínica (`checkout:`). **Excepción heredada**: sin panel; la clínica gestiona los pedidos con el CLI y la configuración con el YAML (ver Complexity Tracking). Las devoluciones de productos quedan fuera de alcance por decisión de la spec, pero los reembolsos de pedidos cancelados sí se implementan. | ⚠️ justificado |
| **Flujo y puertas** | La spec referencia `design/carrito.html`, `checkout.html`, `producto.html` y `cuenta.html`. La CI ya ejecuta lint, tests y Gitleaks. La migración se prueba en la base de datos de pruebas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción heredada.

**Re-check tras la Fase 1**: PASA. Las comprobaciones de diseño que lo confirman son:
- la CSP solo amplía `form-action` (D14);
- la tabla de transiciones es única y la comparten el webhook, la tarea programada, el CLI y el
  panel futuro;
- las cifras salen de una sola función pura (D5), lo que asegura SC-005;
- `payment_events` y el `FOR UPDATE` cubren SC-003.

## Project Structure

### Documentation (this feature)

```text
specs/005-cart-checkout/
├── plan.md              # este archivo
├── research.md          # decisiones D1–D20
├── data-model.md        # 0004_cart_checkout y transiciones
├── quickstart.md        # validación manual y automática
├── contracts/
│   ├── routes.md        # páginas, Server Actions y CSP
│   ├── payments.md      # PaymentProvider, Stripe, webhook y fake
│   ├── content-file.md  # bloque checkout: del YAML
│   ├── emails.md        # correos de pedido
│   ├── cli.md           # orders y orders:maintain
│   └── export-format.md # exportación v2
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
drizzle/0004_cart_checkout.sql            # generada + SQL a mano (índices parciales, ALTER TYPE, secuencia)
src/
├── domain/
│   ├── pricing.ts                        # cartTotals, reparto del descuento, IVA contenido
│   ├── discount.ts                       # validateDiscount, normalizeCode
│   ├── shipping.ts                       # isSpanishPostalCode, inZone
│   ├── order-status.ts                   # tabla de transiciones y etiquetas
│   ├── cart-rules.ts                     # clampQuantity, checkoutFingerprint (cadena canónica)
│   ├── checkout-schemas.ts               # Zod con mensajes en español
│   ├── rate-limit.ts                     # + checkout_origin, discount_origin
│   └── account-export.ts                 # + orders (v2)
├── db/
│   ├── schema.ts                         # + tablas y enums de data-model.md
│   ├── queries/{cart,orders,checkout-config}.ts
│   └── retention.ts                      # + purgas de D16
├── lib/
│   ├── cart/{cookie,cart,merge}.ts       # pc_cart, lectura con revalidación y unión
│   ├── checkout/{confirm,reserve}.ts     # confirmOrder (D4, D10, D11, D12)
│   ├── orders/{transition,cancel,refund,access,maintain}.ts
│   ├── payments/{provider,stripe,fake,webhook,signature}.ts
│   ├── csp.ts                            # form-action con el origen del proveedor
│   ├── env.ts                            # PAYMENT_PROVIDER, STRIPE_* y guardia sk_test_
│   └── notice.ts                         # + códigos de D14
├── email/templates/order-{confirmed,received,cancelled,clinic}.ts
├── content/{schema,load}.ts              # + checkout: y legal condiciones-venta
├── components/
│   ├── CartLink.tsx                      # cabecera con contador
│   ├── AddToCartForm.tsx, QuantityField.tsx, CartSummary.tsx, CheckoutSteps.tsx, OrderTable.tsx, OrderDetail.tsx
│   ├── ProductCard.tsx                   # article + .product__link + AddToCartForm
│   └── SiteHeader.tsx, AccountNav.tsx    # enlaces activos
├── app/
│   ├── carrito/{page,actions}.tsx
│   ├── finalizar-compra/{page,actions}.tsx
│   ├── pedido/{confirmado,pago-no-completado,[token]}/page.tsx + actions.ts
│   ├── pago-simulado/[session]/{page,actions}.tsx
│   ├── mi-cuenta/page.tsx                # + Últimos pedidos
│   ├── mi-cuenta/pedidos/{page.tsx,[numero]/page.tsx}
│   ├── (legal)/condiciones-de-venta/page.tsx
│   ├── iniciar-sesion/actions.ts         # + mergeGuestCart
│   ├── productos/…                       # + controles de compra
│   └── api/pagos/webhook/route.ts
├── lib/account/{export,delete-account}.ts # + pedidos
└── middleware.ts                         # 404 de rutas de tienda si carrito está apagado
scripts/{orders,orders-maintain}.ts       # + build-cli.mjs → cli/orders*.mjs
deploy/systemd/petcare-orders-maintain.{service,timer}
design/styles.css                         # + .product__link y lo que falte (solo tokens)
content/petcare.yaml                      # checkout:, sections.carrito.href, textos legales
next.config.ts                            # rutas no-store
.env.example                              # PAYMENT_PROVIDER, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, PAYMENT_FAKE_ALLOWED
tests/
├── unit/{pricing,discount,shipping,order-status,cart-rules,stripe-signature,stripe-adapter,content-checkout}.test.ts
├── integration/{cart,checkout-concurrency,payment-webhook,orders-maintain,refunds,orders-cli,orders-access,account-orders,content-checkout}.test.ts
│   + stripe-live.test.ts (solo con claves de prueba en el entorno)
└── e2e/{us1-add-to-cart,us2-cart,us3-checkout-card,us4-shipping,us5-my-orders,us6-guest,us7-pay-in-clinic,us8-buy-now,us9-discount}.spec.ts
    # + rutas en a11y-all-routes.spec.ts; coming-soon.spec.ts sin "carrito"
```

**Structure Decision**: es la misma estructura monolítica de las features 001–004.
- La lógica pura (precios, descuentos, zonas, transiciones y huella) va en `src/domain/`.
- Los efectos (BD, pasarela y correos) van en `src/lib/{cart,checkout,orders,payments}/`, como
  `src/lib/booking/` en la 003.
- Las vistas van en `src/app/` y `src/components/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principio VIII: pedidos, envíos, códigos y stock sin panel de administración. Los estados se cambian con un CLI y la configuración con el YAML (excepción heredada de 001–004) | El panel es una feature propia, todavía sin especificar. La tienda necesita gestionar pedidos ya. | Un panel solo para pedidos duplicaría la autenticación de administración y el diseño del panel completo. El CLI usa las mismas funciones (`src/lib/orders/`) que llamará el panel, así que la excepción se cierra sin rehacer la lógica. |
| Proveedor de pago `fake` con una ruta propia (`/pago-simulado`) | Los tests de flujos críticos (principio III) deben ejecutarse en CI sin red ni credenciales. | Usar solo Stripe en los tests requiere credenciales y túnel en CI, y es frágil. La ruta da 404 fuera de `fake`, y `fake` está prohibido en producción salvo autorización explícita. |
