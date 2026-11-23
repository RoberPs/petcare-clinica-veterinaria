# Tasks: Carrito de la compra y pago

**Input**: documentos de diseño de `specs/005-cart-checkout/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/) y [quickstart.md](./quickstart.md).

**Tests**: **se incluyen**. La constitución (principio III: checkout, pago y cambios de estado del
pedido son flujos críticos) y la definición de terminado de CLAUDE.md los exigen; el plan los
detalla en D20. Los de cada historia se escriben antes de implementarla y deben fallar.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado sobre la fase 2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: la historia a la que pertenece (US1–US9).

## Convenciones del proyecto

- Son las mismas de la 001 a la 004:
  - un solo proyecto Next.js;
  - estilos solo en `design/` y con tokens, sin `style=""`;
  - textos en español e identificadores en inglés;
  - ningún dato de la clínica en `src/`: todo sale de `shop_settings`, `shipping_methods`,
    `discount_codes` y `legal_pages`, cargados desde `content/petcare.yaml`.
- **Capas**:
  - `src/domain/` es puro (sin Next, React, Drizzle ni `pg`): precios, descuentos, zonas,
    transiciones, huella y esquemas Zod;
  - los efectos van en `src/lib/{cart,checkout,orders,payments}/`, como `src/lib/booking/` en la 003;
  - las lecturas van en `src/db/queries/{cart,orders,checkout-config}.ts`;
  - las vistas van en `src/app/**` y `src/components/`.
- **Importes**: siempre en céntimos enteros con IVA incluido y siempre calculados por
  `cartTotals()` de `src/domain/pricing.ts` (D5). Ninguna vista, correo ni proveedor suma importes
  por su cuenta (SC-005).
- **Estados**: toda transición de pedido pasa por `transitionOrder()` de
  `src/lib/orders/transition.ts`, que aplica la tabla de `src/domain/order-status.ts`. Nunca se
  hace un `UPDATE orders SET status` fuera de ahí.
- **Decisiones**: las referencias D1–D20 son de [research.md](./research.md). Las rutas y acciones
  están en [contracts/routes.md](./contracts/routes.md); el proveedor de pago en
  [contracts/payments.md](./contracts/payments.md); el YAML en
  [contracts/content-file.md](./contracts/content-file.md); los correos en
  [contracts/emails.md](./contracts/emails.md); el CLI en [contracts/cli.md](./contracts/cli.md);
  y la exportación en [contracts/export-format.md](./contracts/export-format.md).
- **Firmas**: `sign`/`verify` de `src/lib/signing.ts`, con claves derivadas de `FORM_SECRET`
  (`order-access`, `fake-payments`) y caducidad como en B6/B7.
- **Tests de integración**: usan `setupTestDb` y `truncateAll` de `tests/integration/helpers/db.ts`
  y `PAYMENT_PROVIDER=fake`. Los e2e usan `loadPetcare` de `tests/e2e/db.ts`, corren en los
  proyectos `mobile-360`, `desktop` y `no-js`, y pasan axe en cada página nueva. Ninguno usa la red.
- **Logs**: solo `order_id`, `payment_id`, tipo de evento y códigos de error (FR-032).

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Comprobar el entorno: `docker compose up -d`, `npm run db:migrate` hasta `0003_product_catalog` en desarrollo (5434) y en pruebas (5433), y que `npm run lint`, `npm test` y `npm run test:integration` pasan en verde antes de empezar (anotar cualquier fallo previo en `specs/005-cart-checkout/checklists/requirements.md`)
- [X] T002 [P] Añadir a `.env.example` `PAYMENT_PROVIDER=fake`, `STRIPE_SECRET_KEY=` (comentario: solo `sk_test_`/`rk_test_`), `STRIPE_WEBHOOK_SECRET=` (`whsec_…`) y `PAYMENT_FAKE_ALLOWED=false`, sin valores reales; y `PAYMENT_PROVIDER=fake` en el entorno de los tests (`vitest` de integración y `playwright.config.ts`)
- [X] T003 [P] Crear las carpetas `src/lib/cart/`, `src/lib/checkout/`, `src/lib/orders/` y `src/lib/payments/`, y el helper `tests/integration/helpers/checkout.ts` vacío (se rellena en T024)

---

## Phase 2: Foundational (requisitos que bloquean todo)

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

### Esquema y migración

- [X] T004 Añadir a `src/db/schema.ts` los enums nuevos (`cart_kind`, `shipping_kind`, `payment_method`, `order_status`, `reservation_status`, `order_actor`, `cancel_reason`, `refund_status`, `payment_status`, `discount_kind`), la ampliación de `outbox_kind` y `legal_kind`, las columnas nuevas de `shop_settings` y `email_outbox.order_id`, y las tablas `shippingMethods`, `discountCodes`, `carts`, `cartItems`, `orders`, `orderItems`, `orderStatusHistory`, `payments` y `paymentEvents`, con columnas, checks (`num_nonnulls`, `payment_method <> 'in_clinic' OR shipping_kind = 'clinic_pickup'`, `uses_count <= max_uses`, importes ≥ 0, rangos de `shop_settings`), FK (`CASCADE`/`SET NULL` según data-model.md) e índices, siguiendo los helpers `id()` y `...timestamps`
- [X] T005 Generar `drizzle/0004_cart_checkout.sql` con `npm run db:generate` y completarla a mano: `ALTER TYPE … ADD VALUE` de `outbox_kind` y `legal_kind`, `CREATE SEQUENCE order_number_seq`, índices únicos parciales `orders (cart_id) WHERE status = 'pending_payment' AND payment_method = 'card'` y `payments (order_id) WHERE status = 'succeeded'`, índice parcial `(contact_email_normalized) WHERE status = 'pending_payment'`, y la ampliación del `CHECK email_outbox_source`. Aplicarla en desarrollo y en pruebas y comprobar que `truncateAll` incluye las tablas nuevas (y reinicia la secuencia)

### Dominio puro (tests primero)

- [X] T006 [P] Escribir `tests/unit/pricing.test.ts` para `cartTotals`, `splitDiscount` y `vatIncluded` (D5): subtotal de varias líneas; porcentaje con redondeo de la mitad hacia arriba (10 % de 1995 → 200); importe fijo mayor que el subtotal → total 0; el descuento nunca toca el envío; reparto por mayor resto que suma exactamente el descuento (3 líneas, 1 céntimo de resto); IVA contenido por línea `neto − round(neto / 1,21)` con tipos 4, 10 y 21; IVA del envío con coste; líneas `unavailable` excluidas del total
- [X] T007 [P] Escribir `tests/unit/cart-rules.test.ts` para `clampQuantity` (negativo, 0 = eliminar, decimal, texto, por encima de stock y de `max_qty_per_line` → motivo `stock` o `max`) y `checkoutFingerprint` (cadena canónica estable con las líneas en cualquier orden; cambia con la cantidad, el método de envío o el código; igual sin código y con código nulo)
- [X] T008 [P] Escribir `tests/unit/order-status.test.ts`: cada transición válida de la tabla de data-model.md con su actor y condición (`in_clinic`, `home_delivery`, `clinic_pickup`, pago tardío desde `cancelled` con `expired`), una muestra exhaustiva de inválidas (p. ej. `delivered → shipped`, `paid → cancelled` por `customer`, `shipped` en recogida), el efecto sobre la reserva (`held → committed/released`, `committed → released`) y las etiquetas en español con "· Reembolsado"
- [X] T009 [P] Escribir `tests/unit/shipping.test.ts` para `isSpanishPostalCode` (`28001` sí; `00001`, `53000`, `2800`, `28 001` y `ABCDE` no) e `inZone` (prefijos nulos = toda España; `35001` fuera de una lista peninsular)
- [X] T010 [P] Implementar `src/domain/pricing.ts` (`cartTotals`, `splitDiscount`, `vatIncluded`) hasta que T006 pase
- [X] T011 [P] Implementar `src/domain/cart-rules.ts` (`clampQuantity`, `checkoutFingerprint`, que devuelve la cadena canónica; el SHA-256 se hace en `src/lib/`) hasta que T007 pase
- [X] T012 [P] Implementar `src/domain/order-status.ts` (`ORDER_TRANSITIONS`, `canTransition(order, to, actor)`, `reservationEffect`, `statusLabel`) hasta que T008 pase
- [X] T013 [P] Implementar `src/domain/shipping.ts` (`isSpanishPostalCode`, `inZone`) hasta que T009 pase
- [X] T014 Ampliar `src/domain/rate-limit.ts` con las políticas `checkout_origin` (5 pedidos cada 10 min por origen) y `discount_origin` (10 intentos cada 10 min), con su test en `tests/unit/rate-limit.test.ts`
- [X] T015a Crear `src/lib/checkout/guard.ts` con `assertShopEnabled()` (lanza o devuelve `disabled` si `sections.carrito.href` es nulo) y `isMethodEnabled(config, kind, code)`; todas las Server Actions de la feature lo llaman antes de tocar la BD (contracts/routes.md), porque el 404 del middleware no cubre las acciones enviadas desde `/productos`
- [X] T015 [P] Añadir a `src/lib/notice.ts` los códigos `carrito-anadido`, `carrito-actualizado`, `carrito-ajustado`, `descuento-aplicado`, `descuento-retirado` y `pedido-cancelado` con sus textos (D14)

### Entorno, CSP y rutas

- [X] T016 Ampliar `src/lib/env.ts`: `PAYMENT_PROVIDER` ∈ {`stripe`, `fake`}; con `stripe`, rechazar el arranque si `STRIPE_SECRET_KEY` no empieza por `sk_test_`/`rk_test_` o `STRIPE_WEBHOOK_SECRET` no empieza por `whsec_`; prohibir `fake` con `NODE_ENV=production` salvo `PAYMENT_FAKE_ALLOWED=true` (D1, D2). Test en `tests/unit/env.test.ts` con una clave `sk_live_` rechazada
- [X] T017 Cambiar `buildCsp` de `src/lib/csp.ts` para que `form-action` sea `'self'` más el `checkoutOrigin` del proveedor (`https://checkout.stripe.com` con `stripe`), y actualizar `tests/e2e/security-headers.spec.ts`
- [X] T018 [P] Añadir a `next.config.ts` las rutas `/carrito`, `/finalizar-compra`, `/pedido/:path*`, `/pago-simulado/:path*` y `/mi-cuenta/pedidos/:path*` a `NO_STORE_ROUTES`/`PRIVATE_ROUTES` (con `noindex` en `/pedido/*` y `/pago-simulado/*`)
- [X] T019 Ampliar `src/middleware.ts` para responder 404 en `/carrito`, `/finalizar-compra`, `/pedido/*` y `/pago-simulado/*` si `sections.carrito.href` es nulo (mismo patrón que `/productos/*` en la 004), y en `/pago-simulado/*` además si `PAYMENT_PROVIDER` no es `fake`

### Contenido y configuración

- [X] T020 [P] Escribir `tests/unit/content-checkout.test.ts` para el bloque `checkout:` de `src/content/schema.ts`: acepta el ejemplo de contracts/content-file.md; rechaza, con la ruta del error, cada regla de su apartado "Reglas de validación" (sin métodos de pago, `in_clinic` sin recogida, dos `clinic_pickup`, códigos duplicados, prefijo `53`, porcentaje 0 o 101, importe `"0,00"`, `ends_at ≤ starts_at`, `reservation_minutes` 29 y 121) y `checkout:` ausente con `sections.carrito.href` no nulo
- [X] T021 Ampliar `src/content/schema.ts` y `src/content/load.ts` con `loadCheckout` (en la misma transacción que el resto): columnas de `shop_settings`, upsert de `shipping_methods` y `discount_codes` por `code`, los desaparecidos a `enabled = false`, sin tocar `uses_count`; y el tipo legal `condiciones-venta`. Hasta que T020 pase
- [X] T022 [P] Escribir `tests/integration/content-checkout.test.ts`: cargar dos veces no cambia `uses_count`; un método quitado del YAML queda desactivado; la carga con un error no deja nada a medias
- [X] T023 Actualizar `content/petcare.yaml`: `sections.carrito.href: /carrito`, bloque `checkout:` de contracts/content-file.md, `shop.demo_notice_text` nuevo, página legal `condiciones-venta` (texto propio de la demo, sin razón social ni NIF inventados), y reescritura de `terminos`, `privacidad` (finalidad pedidos, base contractual, Stripe como encargado, 6 años) y `cookies` (`pc_cart`) (D19, FR-030)
- [X] T024 Implementar `src/db/queries/checkout-config.ts` (`getCheckoutConfig()`: ajustes, métodos de envío y de pago activos ordenados) y rellenar `tests/integration/helpers/checkout.ts` (`seedShop`, `seedCheckoutConfig({ postalPrefixes })`, `makeCart`, `makeOrder`) y `tests/e2e/db.ts` (`loadPetcare` con `checkout:`, variante con prefijos peninsulares para US4)
- [X] T025 [P] Crear `src/app/(legal)/condiciones-de-venta/page.tsx` con `LegalPage kind="condiciones-venta"` y enlazarla en el pie; quitar "carrito" de `tests/e2e/coming-soon.spec.ts`

**Checkpoint**: esquema, dominio, configuración y rutas listos; las historias pueden empezar.

---

## Phase 3: User Story 1 - Añadir productos al carrito (Priority: P1) 🎯 MVP

**Goal**: "Añadir" en el listado, cantidad y "Añadir al carrito" en la ficha, contador en la
cabecera y carrito persistente (cookie `pc_cart` o cuenta), con unión al iniciar sesión.

**Independent Test**: añadir un producto desde el listado y otro con cantidad 2 desde la ficha,
recargar y ver el contador en 3; repetir sin JavaScript; iniciar sesión y ver los carritos unidos.

### Tests for User Story 1 ⚠️

- [X] T026 [P] [US1] Escribir `tests/integration/cart.test.ts`: `addToCart` crea el carrito y la cookie solo al primer producto; acumula cantidades; acota a stock y a `max_qty_per_line` con motivo; rechaza productos agotados o no publicados; con `sections.carrito.href` nulo, `addToCart` enviada a mano no crea carrito ni cookie; `mergeGuestCart` suma sin superar stock ni máximo, conserva el código del cliente (o el del invitado si no tiene), borra el carrito de invitado; el token se guarda solo como hash
- [X] T027 [P] [US1] Escribir `tests/e2e/us1-add-to-cart.spec.ts`: "Añadir" en el listado conserva filtros, búsqueda y página y anuncia "Añadido al carrito" (`role="status"`); ficha con cantidad 2; contador con `aria-label="Carrito, 3 productos"` tras recargar; agotado sin acciones; cantidad > stock → "Solo quedan N unidades"; login une carritos; axe en listado y ficha; proyecto `no-js` incluido

### Implementation for User Story 1

- [X] T028 [P] [US1] Implementar `src/lib/cart/cookie.ts`: crear, leer y borrar `pc_cart` (32 bytes aleatorios, `HttpOnly`, `Secure`, `SameSite=Lax`, `cart_retention_days`) y `hashCartToken` (SHA-256 hex)
- [X] T029 [US1] Implementar `src/db/queries/cart.ts` (carrito por cliente o hash y `kind`, líneas con producto publicado, `cartUnitCount` con una sola consulta indexada) y `src/lib/cart/cart.ts` (`getOrCreateCart`, `addItem`, `setQuantity`, `removeItem`, que tocan `updated_at`) usando `clampQuantity`
- [X] T030 [US1] Implementar `src/lib/cart/merge.ts` (`mergeGuestCart(customerId, cookieToken)` en una transacción) y llamarlo en `login()` de `src/app/iniciar-sesion/actions.ts` tras `setSessionCookie`, borrando la cookie
- [X] T031 [P] [US1] Añadir a `design/styles.css`, solo con tokens, `.product__link` (enlace del título extendido con `::after` a toda la tarjeta) y el formulario de `.product__foot` por encima (D14); comprobar con `npm run check:design`
- [X] T032 [P] [US1] Crear `src/components/QuantityField.tsx` (`<label>` visible o `sr-only`, `input type=number` con `min=1`, `max=min(stock, máximo)`, `.qty`) y `src/components/AddToCartForm.tsx` (formulario POST con `product_id`, `quantity`, `return_to`; botón marino `.btn`; variante de listado "Añadir" y de ficha "Añadir al carrito")
- [X] T033 [US1] Implementar `addToCart` en `src/app/carrito/actions.ts`: `assertShopEnabled()` (T015a), Zod, `return_to` con `safeReturnTo` limitado a `/productos…`, PRG 303 con `?aviso=carrito-anadido` o `carrito-ajustado`; nunca 500 ante un producto agotado
- [X] T034 [US1] Reestructurar `src/components/ProductCard.tsx` como `article` con `.product__link` y `AddToCartForm` en `.product__foot` solo si hay stock y el carrito está activo; añadir en `src/app/productos/[slug]/page.tsx` `QuantityField` y "Añadir al carrito" (FR-001; sustituye FR-019 de la 004)
- [X] T035 [US1] Crear `src/components/CartLink.tsx` (último enlace de la cabecera, `.cart-btn` y `.cart-count`, `aria-label="Carrito, N productos"`; sin consulta si no hay cookie ni sesión) y usarlo en `src/components/SiteHeader.tsx` en lugar del enlace "Próximamente"
- [X] T036 [US1] Mostrar el aviso tras redirigir (`?aviso=`) en el listado y la ficha en `role="status"`, sin perder filtros; ejecutar T026 y T027 hasta verde

**Checkpoint**: el carrito existe, persiste y se une; MVP demostrable.

---

## Phase 4: User Story 2 - Revisar el carrito (Priority: P1)

**Goal**: página `/carrito` con líneas, cambios de cantidad, eliminar, avisos por línea,
resumen (subtotal, envío, total, IVA incluido), "Seguir comprando" y estado vacío.

**Independent Test**: con dos productos, subir la cantidad de uno, eliminar el otro y comprobar
que el resumen coincide con los precios del catálogo; cambiar el precio y el stock en la BD y ver
los avisos.

### Tests for User Story 2 ⚠️

- [X] T037 [P] [US2] Ampliar `tests/integration/cart.test.ts` con `readCart` (revalidación FR-006): precio cambiado → aviso "antes X, ahora Y" y precio actual; stock menor → cantidad ajustada y "Solo quedan N unidades"; despublicado o agotado → línea `unavailable` fuera del total; totales iguales a `cartTotals`
- [X] T038 [P] [US2] Escribir `tests/e2e/us2-cart.spec.ts`: líneas con foto, nombre, "Categoría · Mascota", cantidad con etiqueta, importe y "Eliminar"; cambiar y eliminar también sin JavaScript; resumen con "Gratis", total e "IVA incluido"; "Seguir comprando" → `/productos`; estado vacío sin "Finalizar compra"; avisos por línea; axe

### Implementation for User Story 2

- [X] T039 [US2] Implementar `readCart(cart)` en `src/lib/cart/cart.ts`: revalida precio, publicación y stock, ajusta cantidades en la BD, devuelve líneas con sus avisos y los totales de `cartTotals` (envío del método más barato activo, "Gratis" si es 0)
- [X] T040 [US2] Implementar `updateCartLine` (0 = eliminar, acotada → `carrito-ajustado`) y `removeCartLine` en `src/app/carrito/actions.ts` con PRG a `/carrito?aviso=carrito-actualizado`
- [X] T041 [P] [US2] Crear `src/components/CartSummary.tsx` (`.summary`: subtotal, descuento si lo hay, envío, total e "IVA incluido: X €", con `formatEur`; región `aria-live` para los cambios) reutilizable en el carrito, el checkout y el pedido
- [X] T042 [US2] Crear `src/app/carrito/page.tsx` según `design/carrito.html` (`.cart-layout`, `.cart-item`, `.qty` con botón "Actualizar" por línea, "Eliminar", avisos por línea, `CartSummary`, "Seguir comprando" y "Finalizar compra" en marino) y el estado vacío con `.empty-state`; metadatos y `noindex`
- [X] T043 [P] [US2] Añadir a `design/styles.css`, solo con tokens, los estilos de aviso por línea y de línea no disponible que falten (estado no solo por color: texto e icono); ejecutar T037 y T038 hasta verde

**Checkpoint**: US1 y US2 funcionan juntas y por separado.

---

## Phase 5: User Story 3 - Finalizar la compra y pagar con tarjeta (Priority: P1)

**Goal**: checkout sin JavaScript, pedido con reserva atómica, pago en Stripe Checkout (o `fake`),
aviso firmado, conciliación al volver, confirmación, correos, caducidad, pago tardío y reembolso.

**Independent Test**: con un carrito, pagar con la pasarela simulada y ver el pedido "Pagado", el
stock descontado, la confirmación y el correo; repetir con "Simular rechazo" y "Cancelar";
lanzar 10 confirmaciones sobre la última unidad y ver 0 sobreventas.

### Tests for User Story 3 ⚠️

- [X] T044 [P] [US3] Escribir `tests/unit/stripe-signature.test.ts`: firma válida; cuerpo alterado; `v1` ausente o con varias firmas; `t` fuera de 300 s → `InvalidSignature`; comparación en tiempo constante
- [X] T045 [P] [US3] Escribir `tests/unit/stripe-adapter.test.ts` con `fetch` simulado: cuerpo `x-www-form-urlencoded` de `createCheckout` (una línea "Pedido PC-…", `currency=eur`, `locale=es`, `client_reference_id`, `metadata[order_id]`, URLs), `expires_at` nunca a menos de 30 min + 60 s del momento de la llamada aunque `reservation_expires_at` sea anterior (D8), cabecera `Idempotency-Key: checkout-<id>` y `refund-<id>`, mapeo de `retrieveCheckout` y de los eventos de contracts/payments.md, errores HTTP → error tipado
- [X] T046 [P] [US3] Escribir `tests/integration/checkout-concurrency.test.ts` (SC-002): 10 `confirmOrder` en paralelo sobre la última unidad → un pedido y 9 `stock_unavailable`; `stock` nunca negativo; líneas en orden de `product_id` sin interbloqueo; reenvío con el mismo `submission_id` → el mismo pedido; FR-012: misma huella reutiliza pedido y `checkout_url`, huella distinta cancela (`replaced`, sin correo) y crea otro; límite `checkout_origin` y `max_pending_per_customer`
- [X] T047 [P] [US3] Escribir `tests/integration/payment-webhook.test.ts` (SC-003): evento válido → `paid`, reserva `committed`, carrito vaciado, un `order_confirmed` y un `clinic_order`; evento duplicado y simultáneo con la conciliación de `/pedido/confirmado` → un solo cambio, un solo correo; firma inválida → 400; error de BD → 500 sin registrar el evento; importe distinto → error registrado y reembolso; `checkout.expired` cancela si sigue pendiente
- [X] T048 [P] [US3] Escribir `tests/integration/orders-maintain.test.ts` (SC-004) con `setTestNow`: caduca los pedidos con tarjeta tras `reservation_expires_at + 2 min` (`expired`, stock y código liberados, correo `order_cancelled`); no toca los que están dentro de plazo; concilia sesiones abiertas de más de 5 min; pago tardío con stock → `paid`; sin stock → sigue cancelado (`stock_unavailable`), reembolso y correo
- [X] T049 [P] [US3] Escribir `tests/integration/refunds.test.ts`: `refundOrder` idempotente; fallo del proveedor → `pending` y reintentos con espera creciente hasta `failed` a los 8; `refund.succeeded` confirma sin enviar un segundo correo; el correo de cancelación dice "Te hemos devuelto…" con `refunded` y "Estamos tramitando la devolución…" con `pending` (contracts/emails.md)
- [X] T050 [P] [US3] Escribir `tests/e2e/us3-checkout-card.spec.ts`: pasos con `aria-current="step"`; errores junto al campo, anunciados y conservando lo escrito; aviso de demostración visible y enlace a condiciones; "Confirmar pedido" → `/pago-simulado` → "Pagar" → "Pedido PC-… confirmado" con resumen; "Simular rechazo"; "Cancelar" → "No se ha completado el pago" con "Reintentar pago" y carrito intacto; stock agotado entre el carrito y "Confirmar pedido" → vuelta a `/carrito` con la cantidad ajustada y el aviso; totales iguales en carrito, checkout, confirmación y correo (SC-005, leyendo el correo falso); axe; proyecto `no-js` hasta la pasarela

### Implementation for User Story 3 — pagos

- [X] T051 [P] [US3] Implementar `src/lib/payments/provider.ts` (interfaz `PaymentProvider`, `PaymentEvent`, `InvalidSignature` y `getPaymentProvider()` según `PAYMENT_PROVIDER`)
- [X] T052 [P] [US3] Implementar `src/lib/payments/signature.ts` (`verifyStripeSignature(rawBody, header, secret, now)` con `node:crypto` y `timingSafeEqual`) hasta que T044 pase
- [X] T053 [US3] Implementar `src/lib/payments/stripe.ts` con `fetch` (sin SDK): `createCheckout`, `retrieveCheckout`, `refund` y `verifyWebhook` según D1 y contracts/payments.md, hasta que T045 pase
- [X] T054 [US3] Implementar `src/lib/payments/fake.ts` (sesiones `fake_<uuid>` guardadas en `payments`, URL `${SITE_URL}/pago-simulado/<id>`, eventos firmados con `hmac(FORM_SECRET, 'fake-payments')`, `refund` → `fake_re_<uuid>` y evento `refund.succeeded`, helper `emitFakeEvent(event, { duplicate, delayMs })`)
- [X] T055 [US3] Implementar `src/lib/payments/webhook.ts` (`handlePaymentEvent`: registra `payment_events` por `provider_event_id`, transacción con `SELECT … FOR UPDATE` del pedido, `markOrderPaid` idempotente con comprobación de importe, pago tardío (D8), `checkout.expired`, `refund.succeeded`) y `src/app/api/pagos/webhook/route.ts` (runtime Node.js, cuerpo crudo, 200/400/500, sin `isSameOriginRequest`)

### Implementation for User Story 3 — pedidos y checkout

- [X] T056 [US3] Implementar `src/lib/orders/transition.ts` (`transitionOrder(tx, orderId, to, actor, { reason, note })`: valida con `canTransition`, escribe `order_status_history`, `last_status_at`, efecto en la reserva con `UPDATE … WHERE reservation_status = 'held'`, devolución del uso del código, encolado de correos) y `src/lib/orders/cancel.ts`
- [X] T057 [US3] Implementar `src/lib/orders/refund.ts` (`refundOrder` con `refund_status` `pending`/`refunded`/`failed`, D9) hasta que T049 pase
- [X] T058 [US3] Crear `src/domain/checkout-schemas.ts` (Zod con los mensajes de data-model.md: correo, nombre, apellidos, dirección, código postal con `isSpanishPostalCode` e `inZone`, ciudad, método de envío y de pago activos, `in_clinic` solo con recogida) con su test `tests/unit/checkout-schemas.test.ts`
- [X] T059 [US3] Implementar `src/lib/checkout/reserve.ts` (reserva ordenada por `product_id` con `UPDATE products SET stock = stock - $q WHERE id = $id AND published AND stock >= $q`, revierte todo si falta alguna) y `src/lib/checkout/confirm.ts` (`confirmOrder`: `assertShopEnabled()` y métodos activos (T015a), límites de origen y de pendientes, `submission_id`, revalidación del carrito, huella de FR-012, número con `order_number_seq` y `order_prefix`, copia de líneas con `splitDiscount`, `reservation_expires_at`, sesión del proveedor con `expiresAt = max(reservation_expires_at, ahora + 30 min + 60 s)` (D8) y URLs con `ref` firmada de 2 h; todo en una transacción salvo la llamada al proveedor, con compensación si falla) hasta que T046 pase
- [X] T060 [US3] Implementar `src/lib/orders/access.ts` (`signOrderRef`/`verifyOrderRef` con 2 h, B6) y `src/lib/orders/maintain.ts` (conciliación, caducidad de tarjeta y reintento de reembolsos, cada paso con `pg_try_advisory_lock`) y `scripts/orders-maintain.ts` con `npm run orders:maintain`, contadores en el log, hasta que T048 pase
- [X] T061 [P] [US3] Crear las plantillas `src/email/templates/order-confirmed.ts`, `order-cancelled.ts` (motivo en lenguaje claro; frase de reembolso según `refund_status`: `refunded` o `pending`) y `order-clinic.ts` según contracts/emails.md: cifras de la copia del pedido, `Europe/Madrid`, todo escapado, nota de demostración; con `tests/unit/order-emails.test.ts`
- [X] T062 [P] [US3] Crear `src/components/CheckoutSteps.tsx` (`.steps`, `aria-current="step"`) y `src/components/OrderDetail.tsx` (líneas, `CartSummary` de la copia del pedido, envío, pago, estado con texto e historial)

### Implementation for User Story 3 — páginas

- [X] T063 [US3] Crear `src/app/finalizar-compra/page.tsx` y `actions.ts` según `design/checkout.html`: 303 a `/carrito` si está vacío; formulario con `useActionState`, token firmado y honeypot `web`; `.panel`, `.field-row`, `.option` para envío y pago (tarjeta); aviso de demostración de `checkout_notice_text` y enlace a `/condiciones-de-venta`; resumen "Tu pedido"; "Confirmar pedido" en marino; redirección 303 a `checkout_url`; `cart_changed` y `stock_unavailable` → ajustar las cantidades del carrito al stock y 303 a `/carrito?aviso=carrito-ajustado` (caso límite "stock insuficiente al confirmar"), con su caso en T050
- [X] T064 [US3] Crear `src/app/pago-simulado/[session]/page.tsx` y `actions.ts`: importe, marca de simulación, "Pagar", "Simular rechazo" ("Tarjeta rechazada (simulación)") y "Cancelar" (D2)
- [X] T065 [US3] Crear `src/app/pedido/confirmado/page.tsx`: verifica `ref`, concilia con `retrieveCheckout` y `markOrderPaid`; "Pedido PC-… confirmado" con `OrderDetail` y estilo menta, o "Estamos confirmando tu pago" con "Comprobar de nuevo" (sin recarga automática)
- [X] T066 [US3] Crear `src/app/pedido/pago-no-completado/page.tsx` y `src/app/pedido/actions.ts` (`retryPayment` → `checkout_url` si la sesión sigue abierta o "El plazo de pago ha vencido"; `cancelOrder` con confirmación por `ref`); ejecutar T047 y T050 hasta verde

**Checkpoint**: compra completa con tarjeta (fake y Stripe de pruebas), idempotente y sin sobreventa.

---

## Phase 6: User Story 4 - Elegir envío a domicilio o recogida (Priority: P1)

**Goal**: métodos de envío de la configuración, zonas por código postal y recogida sin dirección.

**Independent Test**: un pedido con cada método; con la variante peninsular, `35001` da el aviso de
fuera de zona con la recogida ofrecida; la confirmación y el correo de recogida muestran la
dirección y el horario de la clínica.

### Tests for User Story 4 ⚠️

- [X] T067 [P] [US4] Escribir `tests/integration/checkout-shipping.test.ts`: fuera de zona rechazado también en el servidor al confirmar; recogida ignora y no guarda los campos de dirección; método de envío desactivado enviado a mano → `invalid`; `payment_method=card` con `card_enabled=false` (y `in_clinic` con `in_clinic_enabled=false`) enviado a mano → `invalid`; `confirmOrder` con `sections.carrito.href` nulo → rechazado sin crear pedido; copia de nombre, coste e IVA del envío en el pedido
- [X] T068 [P] [US4] Escribir `tests/e2e/us4-shipping.spec.ts`: cada opción con nombre, plazo y "Gratis"; `35001` con la variante peninsular → "No enviamos a este código postal. Puedes recogerlo en la clínica."; pedido con recogida sin dirección y con la dirección y el horario de la clínica en la confirmación y el correo; axe; `no-js`

### Implementation for User Story 4

- [X] T069 [US4] Renderizar en `src/app/finalizar-compra/page.tsx` los métodos de envío de `getCheckoutConfig()` como `.option` (radio, nombre, descripción, coste con `formatEur` o "Gratis") y agrupar dirección, código postal y ciudad en un `fieldset` "Solo para envío a domicilio" (sin JavaScript no se ocultan; el servidor los exige solo con `home_delivery` y los descarta con recogida)
- [X] T070 [US4] Mostrar en `OrderDetail` y en las plantillas de correo la dirección completa o, con recogida, la dirección y el horario de la clínica leídos de la BD; ejecutar T067 y T068 hasta verde

**Checkpoint**: las cuatro historias P1 completas.

---

## Phase 7: User Story 5 - Consultar mis pedidos (Priority: P2)

**Goal**: "Mis pedidos" (lista y detalle), "Últimos pedidos" en el resumen, cancelar pendientes y
reintentar el pago; exportación v2 y borrado de cuenta con pedidos.

**Independent Test**: un cliente con 4 pedidos en distintos estados ve lista, detalle y bloque del
resumen; otro cliente obtiene 404 con el mismo número.

### Tests for User Story 5 ⚠️

- [X] T071 [P] [US5] Escribir `tests/integration/account-orders.test.ts`: lista paginada (10) del más reciente al más antiguo; los 3 últimos para el resumen; IDOR: número ajeno → `null` (SC-006); cancelar solo `pending_payment` propio (libera stock, correo); pagado → sin opción; exportación v2 con solo los pedidos del cliente; borrado de cuenta: pendientes cancelados (`account_deleted`), resto con `customer_id` nulo y fuera de cualquier vista
- [X] T072 [P] [US5] Escribir `tests/e2e/us5-my-orders.spec.ts`: "Mis pedidos" en `.side-nav` activo; `table.orders` con número, fecha, estado con texto y total; detalle con historial; "Reintentar pago" y "Cancelar pedido" con confirmación en un pendiente; bloque "Últimos pedidos" o invitación a la tienda; 404 en un pedido ajeno; axe

### Implementation for User Story 5

- [X] T073 [US5] Implementar `src/db/queries/orders.ts` (`listCustomerOrders(customerId, page)`, `latestCustomerOrders(customerId, 3)`, `getCustomerOrder(customerId, number)` siempre filtrando por `customer_id`)
- [X] T074 [P] [US5] Crear `src/components/OrderTable.tsx` (`table.orders` con `caption`, estado con `statusLabel`) y actualizar `src/components/AccountNav.tsx` con "Mis pedidos" activo (quitar los `style=""` heredados de `cuenta.html` si se copiaron)
- [X] T075 [US5] Crear `src/app/mi-cuenta/pedidos/page.tsx` y `src/app/mi-cuenta/pedidos/[numero]/page.tsx` (404 si no es suyo; `OrderDetail`; "Reintentar pago" si `card` pendiente y en plazo; "Cancelar pedido" con paso de confirmación) y extender `cancelOrder`/`retryPayment` de `src/app/pedido/actions.ts` para el número con sesión
- [X] T076 [US5] Añadir a `src/app/mi-cuenta/page.tsx` el bloque "Últimos pedidos" (3 y enlace) o la invitación a la tienda
- [X] T077 [US5] Ampliar `src/domain/account-export.ts` y `src/lib/account/export.ts` con `orders` y `format_version: 2` según contracts/export-format.md, y `src/lib/account/delete-account.ts` con la cancelación de pendientes y la desvinculación en la misma transacción (D19); ejecutar T071 y T072 hasta verde

---

## Phase 8: User Story 6 - Comprar sin cuenta (Priority: P2)

**Goal**: compra de invitado con correo, enlace privado firmado de 90 días y sin asociar cuentas;
precarga de datos para clientes con sesión.

**Independent Test**: comprar sin sesión, abrir el enlace del correo y ver el pedido; alterar el
token → 404; caducado → aviso con el contacto de la clínica y ningún dato.

### Tests for User Story 6 ⚠️

- [X] T078 [P] [US6] Escribir `tests/integration/orders-access.test.ts`: token válido; firma alterada, otro pedido o `access_version` distinta → no encontrado; caducado a los `guest_link_days` desde `last_status_at` (con `setTestNow`); un cambio de estado amplía la validez; invitado con el correo de una cuenta → `customer_id` nulo y no aparece en esa cuenta; `max_pending_per_email`
- [X] T079 [P] [US6] Escribir `tests/e2e/us6-guest.spec.ts`: checkout sin sesión pide correo y ofrece "Iniciar sesión" o "Crear cuenta" como opción; el correo falso trae el enlace privado; la página muestra el pedido con `noindex`; token manipulado → 404; cliente con sesión ve su correo de la cuenta y la dirección de su último pedido; axe

### Implementation for User Story 6

- [X] T080 [US6] Añadir a `src/lib/orders/access.ts` `signGuestToken({ o, v })` y `verifyGuestToken` con `hmac(FORM_SECRET, 'order-access')` y caducidad por `last_status_at + guest_link_days` (D18)
- [X] T081 [US6] Crear `src/app/pedido/[token]/page.tsx` (`OrderDetail`, "Reintentar pago" y "Cancelar pedido" si procede; caducado → aviso con el contacto de la clínica de la BD; `noindex`, `no-store`) y aceptar el token en `cancelOrder`/`retryPayment`
- [X] T082 [US6] En `src/app/finalizar-compra/page.tsx`: campo de correo solo sin sesión con su finalidad (FR-007) y enlaces a iniciar sesión o crear cuenta con `return_to=/finalizar-compra`; con sesión, correo de la cuenta y precarga desde el último pedido o la cuenta; enlace privado o del área en las plantillas de correo; ejecutar T078 y T079 hasta verde

---

## Phase 9: User Story 7 - Pagar en la clínica (Priority: P2)

**Goal**: "Pago en clínica" solo con recogida, pedido pendiente con reserva y plazo de recogida,
correo `order_received`, gestión por CLI y caducidad automática.

**Independent Test**: pedido con recogida y pago en clínica → "Pendiente de pago", stock reservado,
carrito vacío y correo con el plazo; `npm run orders -- deliver PC-…` → "Entregado"; otro pedido
caducado por `orders:maintain` → cancelado y stock liberado.

### Tests for User Story 7 ⚠️

- [X] T083 [P] [US7] Escribir `tests/integration/orders-cli.test.ts`: `list`, `show`, `set-status` válido ("PC-000123: Pagado → Enviado") e inválido (código 2, "Transición no permitida: …"), número inexistente (código 3), `deliver` de `in_clinic` (fija `paid_at`, reserva `committed`, uso de código mantenido), `cancel` de pagado con reembolso; ampliar `orders-maintain.test.ts` con la caducidad por `pickup_deadline`
- [X] T084 [P] [US7] Escribir `tests/e2e/us7-pay-in-clinic.spec.ts`: "Pago en clínica" con envío a domicilio → "El pago en clínica solo está disponible con recogida en la clínica"; con recogida → confirmación con el plazo; correo `order_received` y `clinic_order`; axe; `no-js`

### Implementation for User Story 7

- [X] T085 [US7] Añadir la opción "Pago en clínica" (si `in_clinic_enabled`) al checkout y la rama `in_clinic` de `confirmOrder`: `pickup_deadline` al final del día `Europe/Madrid` de hoy + `pickup_days`, sin sesión de pago, carrito vaciado, correos `order_received` y `clinic_order`, 303 a `/pedido/confirmado?ref=`
- [X] T086 [P] [US7] Crear `src/email/templates/order-received.ts` (plazo de recogida, dirección y horario, "Pago en la clínica (pendiente)")
- [X] T087 [US7] Añadir a `src/lib/orders/maintain.ts` la caducidad de `in_clinic` por `pickup_deadline` (`expired`, stock liberado, correo)
- [X] T088 [US7] Crear `scripts/orders.ts` (`list`, `show`, `set-status`, `deliver`, `cancel [--note]`) sobre `transitionOrder` y `refundOrder`, con los códigos de salida de contracts/cli.md; `npm run orders`; añadir `orders` y `orders-maintain` a `scripts/build-cli.mjs` (→ `cli/orders.mjs`, `cli/orders-maintain.mjs`)
- [X] T089 [P] [US7] Crear `deploy/systemd/petcare-orders-maintain.service` y `.timer` (cada minuto, como `petcare-email-dispatch`); ejecutar T083 y T084 hasta verde

---

## Phase 10: User Story 8 - "Comprar ahora" desde la ficha (Priority: P2)

**Goal**: compra directa con un carrito `direct` que no toca el carrito principal y sin código de
descuento.

**Independent Test**: con el carrito lleno, "Comprar ahora" con 2 unidades → checkout solo con ese
producto; al completar o abandonar, el carrito principal sigue igual.

### Tests for User Story 8 ⚠️

- [X] T090 [P] [US8] Ampliar `tests/integration/cart.test.ts` con `buyNow`: sustituye el carrito `direct` en cada uso, nunca toca el `main`, `discount_code_id` siempre nulo; pagar el pedido directo vacía solo el `direct`
- [X] T091 [P] [US8] Escribir `tests/e2e/us8-buy-now.spec.ts`: "Comprar ahora" con 2 → `/finalizar-compra?directa=1` solo con ese producto y sin campo de código; carrito principal intacto tras completar y tras abandonar; `no-js`

### Implementation for User Story 8

- [X] T092 [US8] Implementar `buyNow` en `src/app/carrito/actions.ts` (carrito `direct` del mismo dueño, cookie si hace falta, 303 a `/finalizar-compra?directa=1`) y el botón "Comprar ahora" en la ficha (mismo formulario, `formAction`)
- [X] T093 [US8] Hacer que `/finalizar-compra` y `confirmOrder` usen el carrito `direct` con `?directa=1`/`cart=direct` (303 a la ficha o a `/carrito` si está vacío) y que el pago vacíe el carrito del pedido (`orders.cart_id`); ejecutar T090 y T091 hasta verde

---

## Phase 11: User Story 9 - Aplicar un código de descuento (Priority: P3)

**Goal**: código en el carrito con porcentaje o importe fijo, vigencia, mínimo y límite de usos;
mensajes por motivo y límite por origen.

**Independent Test**: aplicar `BIENVENIDA10`, uno caducado y uno inexistente; completar una compra
con código y comprobar que el pedido lo registra y el uso se cuenta.

### Tests for User Story 9 ⚠️

- [X] T094 [P] [US9] Escribir `tests/unit/discount.test.ts` para `normalizeCode` (espacios, minúsculas) y `validateDiscount` (`not_found` incluido inactivo, `not_started`, `expired`, `exhausted`, `min_subtotal` con el importe en el mensaje, válido) y sus mensajes sin revelar códigos
- [X] T095 [P] [US9] Escribir `tests/integration/discounts.test.ts`: aplicar y quitar; retirada automática al dejar de cumplir el mínimo o al caducar, con aviso antes de confirmar; uso apartado al confirmar con `UPDATE … uses_count < max_uses` (dos pedidos sobre el último uso → uno sin código y `cart_changed`), devuelto al cancelar; `discount_origin` → `rate_limited`
- [X] T096 [P] [US9] Escribir `tests/e2e/us9-discount.spec.ts`: "Descuento (BIENVENIDA10)" con importe y total rebajado; "Quitar"; `NOEXISTE` → error junto al campo y total igual; mínimo no alcanzado → "Este código requiere un pedido mínimo de 30,00 €"; total igual en checkout y correo; axe; `no-js`

### Implementation for User Story 9

- [X] T097 [US9] Implementar `src/domain/discount.ts` (`normalizeCode`, `validateDiscount`, mensajes) hasta que T094 pase
- [X] T098 [US9] Implementar `applyDiscount` (con `discount_origin`, `fieldErrors.code`) y `removeDiscount` en `src/app/carrito/actions.ts`, y el formulario del código con etiqueta en `src/app/carrito/page.tsx`
- [X] T099 [US9] Integrar el descuento en `readCart` (revalida y retira con aviso `descuento-retirado`), en `CartSummary` ("Descuento (<código>)") y en `confirmOrder` (apartar uso, copia `discount_code` y `discount_cents`, reparto con `splitDiscount`; devolución en `transitionOrder`); ejecutar T095 y T096 hasta verde

---

## Phase 12: Polish & Cross-Cutting Concerns

- [X] T100 [P] Ampliar `src/db/retention.ts` (`purgeExpired`) con D16: carritos de invitado sin cambios en `cart_retention_days`, `payment_events` de más de 90 días, correos de pedido enviados o fallidos a las 24 h y anonimización de pedidos de más de 6 años (`anonymized_at`, contacto y dirección a `NULL`), con su test en `tests/integration/retention.test.ts`
- [X] T101 [P] Añadir todas las rutas nuevas (carrito lleno y vacío, checkout, confirmación, pago no completado, pedido de invitado válido y caducado, "Mis pedidos" y detalle, condiciones de venta, pago simulado) a `tests/e2e/a11y-all-routes.spec.ts` en los tres proyectos
- [X] T102 [P] Escribir `tests/integration/no-pii-logs.test.ts` para el flujo de pedido: capturar los logs de checkout, webhook, maintain, CLI y reembolso y comprobar que no contienen correo, nombre ni dirección (FR-032)
- [X] T103 [P] Escribir `tests/integration/stripe-live.test.ts`, que se salta si no hay `STRIPE_SECRET_KEY` de pruebas: crea una sesión real, la recupera y comprueba el importe (fuera de la puerta de CI)
- [X] T104 Revisar textos que decían que la clínica no vende productos (FAQ "recoger-pedido", aviso del catálogo) en `content/petcare.yaml` y comprobar con grep que `src/` no contiene datos de la clínica ni textos de las maquetas
- [X] T105 Ejecutar `npm run test:lighthouse` y confirmar ≥ 90 en `/`, `/productos` y una ficha (SC-008)
- [X] T106 [P] Documentar en `deploy/README.md` el webhook de Stripe en modo de pruebas (URL, eventos), las variables nuevas, el temporizador `petcare-orders-maintain` y el uso de `cli/orders.mjs`
- [X] T107 Recorrer [quickstart.md](./quickstart.md) completo (manual 1–12 y automático), revisión de teclado de todo el recorrido, `npm run lint` sin estilos a mano y diff sin secretos (Gitleaks)
- [X] T108 Anotar desviaciones en `specs/005-cart-checkout/checklists/requirements.md` y actualizar el estado de la feature 005 en `CLAUDE.md` a **implementada**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)**: la fase 2 bloquea todas las historias.
- **US1 (3)** → **US2 (4)**: la página del carrito necesita carritos con líneas.
- **US3 (5)** depende de US1 y US2 (carrito y `readCart`).
- **US4 (6)**, **US5 (7)**, **US6 (8)**, **US7 (9)** y **US8 (10)** dependen de US3 (checkout,
  pedido, transiciones y `OrderDetail`); entre sí son independientes salvo que US5 y US6 comparten
  `src/app/pedido/actions.ts` (hacerlas en orden o coordinar).
- **US9 (11)** depende de US2 (carrito) y de US3 (`confirmOrder`).
- **Polish (12)**: al terminar las historias que se quieran entregar.

### Within Each User Story

- Tests primero y fallando → dominio → `src/lib/` → acciones → páginas → tests en verde.
- `transitionOrder` (T056) antes de cualquier cancelación, caducidad, CLI o webhook que cambie
  estados.

### Parallel Opportunities

- Fase 2: T006–T009 (tests de dominio) a la vez; luego T010–T013; T015, T018, T020 y T025 en
  paralelo con el resto.
- US1: T026, T027, T028, T031 y T032 a la vez.
- US3: los siete tests T044–T050 a la vez; T051, T052, T061 y T062 en paralelo.
- Tras US3: US4, US7 y US8 pueden ir en paralelo (archivos distintos salvo el checkout, donde
  conviene secuenciar T069, T085 y T093).

---

## Parallel Example: User Story 3

```bash
# Tests de US3 a la vez:
Task: "tests/unit/stripe-signature.test.ts"
Task: "tests/unit/stripe-adapter.test.ts"
Task: "tests/integration/checkout-concurrency.test.ts"
Task: "tests/integration/payment-webhook.test.ts"
Task: "tests/integration/orders-maintain.test.ts"
Task: "tests/integration/refunds.test.ts"
Task: "tests/e2e/us3-checkout-card.spec.ts"

# Piezas independientes de US3:
Task: "src/lib/payments/provider.ts"
Task: "src/lib/payments/signature.ts"
Task: "src/email/templates/order-{confirmed,cancelled,clinic}.ts"
Task: "src/components/CheckoutSteps.tsx y OrderDetail.tsx"
```

---

## Implementation Strategy

### MVP First

1. Fases 1 y 2.
2. US1 (añadir y contador) → validar por separado.
3. US2 y US3 (carrito y pago con tarjeta) → primera tienda que vende de punta a punta.
4. US4 → las cuatro P1 completas: **entregable mínimo de la feature**.

### Incremental Delivery

1. P1 (US1–US4) → demo de compra con tarjeta y recogida.
2. P2 (US5–US8) → seguimiento, invitados, pago en clínica y compra directa.
3. P3 (US9) → códigos de descuento.
4. Polish → retención, accesibilidad de todas las rutas, Lighthouse, despliegue y quickstart.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Los commits solo cuando el usuario lo pida.
- Si una tarea choca con la constitución, gana la constitución: se anota en
  `checklists/requirements.md`.
