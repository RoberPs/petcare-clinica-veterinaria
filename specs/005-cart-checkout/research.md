# Research: Carrito de la compra y pago (feature 005)

Decisiones **D1–D20** de la feature 005. Siguen vigentes las R1–R17 (001), A1–A14 (002), B1–B17
(003) y C1–C16 (004).

## D1. Pasarela: Stripe Checkout por API HTTP, sin SDK

- **Decision**: Stripe Checkout (página de pago alojada por Stripe) en **modo de pruebas**, con
  llamadas `fetch` a la API REST (`application/x-www-form-urlencoded`), sin SDK, como Brevo (R7).
  Se usan:
  - `POST /v1/checkout/sessions` (`mode=payment`, `payment_method_types[]=card`, `locale=es`,
    `currency=eur`, una sola línea "Pedido PC-…" por el total, `client_reference_id` y
    `metadata[order_id]`, `customer_email` precargado, `expires_at`, `success_url` y `cancel_url`)
    con la cabecera `Idempotency-Key: checkout-<order_id>`;
  - `GET /v1/checkout/sessions/{id}` para conciliar al volver y en la tarea de mantenimiento;
  - `POST /v1/refunds` con `Idempotency-Key: refund-<order_id>`.
- **Guardia del principio VII**: `src/lib/env.ts` rechaza el arranque si `STRIPE_SECRET_KEY` no
  empieza por `sk_test_` o `rk_test_`, o si `STRIPE_WEBHOOK_SECRET` no empieza por `whsec_`. No hay
  forma de configurar una clave real sin cambiar el código (y la constitución).
- **Rationale**: la tarjeta nunca toca la web propia ni carga scripts de terceros en sus páginas,
  así que no hace falta consentimiento ni JavaScript. La redirección funciona sin JavaScript.
  Stripe ofrece modo de pruebas completo (tarjetas de prueba, rechazos, 3-D Secure), avisos
  firmados, reembolsos e idempotencia. Una sola línea por el total garantiza que el importe
  cobrado es exactamente el del pedido (SC-005), incluidos los descuentos.
- **Alternatives considered**:
  - Redsys: es la pasarela de los bancos españoles y ofrece Bizum, pero Bizum quedó fuera de
    alcance, y su firma 3DES y su entorno de pruebas son más costosos de integrar y de probar.
  - Stripe Elements o Payment Element: meten un script y un iframe de Stripe en la página propia,
    necesitan JavaScript y obligan a ampliar la CSP.
  - El SDK `stripe`: una dependencia más para tres llamadas.
  - Varias líneas en Stripe: obligaría a modelar los descuentos como cupones de Stripe.

## D2. Proveedor de pago intercambiable y pasarela simulada

- **Decision**: interfaz `PaymentProvider` en `src/lib/payments/provider.ts` con
  `createCheckout`, `retrieveCheckout`, `refund` y `verifyWebhook`, y dos implementaciones
  elegidas por `PAYMENT_PROVIDER`:
  - `stripe` (D1);
  - `fake`, para local, integración y e2e. `createCheckout` devuelve
    `${SITE_URL}/pago-simulado/<session>`, una página propia con "Pagar", "Simular rechazo" y
    "Cancelar". Sus acciones generan un evento firmado con una clave derivada de `FORM_SECRET` y
    lo procesan con el mismo `handlePaymentEvent` que el aviso real (D7). La ruta da 404 si el
    proveedor no es `fake`, y `env.ts` prohíbe `fake` con `NODE_ENV=production` salvo que
    `PAYMENT_FAKE_ALLOWED=true` (solo en la demo sin claves).
- **Rationale**: los tests de flujos críticos (principio III) no pueden depender de la red ni de
  una cuenta de Stripe. Es el mismo patrón que `EMAIL_PROVIDER=fake`.
- **Alternatives considered**: el CLI de Stripe (`stripe listen`) en CI necesita credenciales y
  red; simular `fetch` solo en unitarias no prueba el recorrido completo.

## D3. Carrito en el servidor con cookie propia

- **Decision**: tablas `carts` y `cart_items`. Un carrito pertenece a un cliente (`customer_id`) o
  a un navegador (hash SHA-256 de un token aleatorio de 32 bytes guardado en la cookie `pc_cart`,
  `HttpOnly`, `Secure`, `SameSite=Lax`, 30 días). La cookie solo se crea al añadir el primer
  producto.
  - Es una cookie técnica, necesaria para el servicio que se pide, así que no requiere
    consentimiento. Se añade a la política de cookies.
  - `carts.kind` ∈ {`main`, `direct`}: "Comprar ahora" usa un carrito `direct` del mismo dueño,
    que se sustituye en cada uso y nunca toca el `main` (FR-014).
  - Unicidad: (`customer_id`, `kind`) y (`token_hash`, `kind`).
- **Fusión al iniciar sesión**: `login()` en `src/app/iniciar-sesion/actions.ts`, tras
  `setSessionCookie`, llama a `mergeGuestCart(customerId, cookieToken)`. Esa función suma
  cantidades limitadas por stock y por el máximo por línea, conserva el código del carrito del
  cliente o, si no tiene, el del invitado, borra el carrito de invitado y borra la cookie. Al cerrar
  sesión, el carrito queda en la cuenta.
- **Rationale**: FR-003 (se conserva al recargar y entre dispositivos con cuenta) sin JavaScript
  ni `localStorage`, y la revalidación de precio y stock (FR-006) siempre en el servidor.
- **Alternatives considered**: carrito en la cookie (no permite revalidar ni unir, y tiene límite
  de tamaño); `localStorage` (requiere JavaScript).

## D4. Reserva de stock: descontar al confirmar el pedido

- **Decision**: al confirmar el pedido, en la misma transacción, por cada línea ordenada por
  `product_id` (evita interbloqueos):
  `UPDATE products SET stock = stock - $q WHERE id = $id AND published AND stock >= $q`. Si alguna
  no afecta a una fila, se revierte todo y se vuelve al carrito con las cantidades ajustadas
  (`stock_unavailable`). El pedido guarda `reservation_status` ∈ {`held`, `committed`,
  `released`}:
  - `held → committed` al pagarse (tarjeta) o entregarse (pago en clínica);
  - `held → released` al cancelarse o caducar, devolviendo las unidades con un `UPDATE` guardado
    por `WHERE reservation_status = 'held'`, que hace la devolución idempotente.
- **Rationale**: así `products.stock` es siempre el disponible, el catálogo de la 004 ("Agotado")
  sigue funcionando sin cambios y dos compradores no pueden quedarse con la última unidad
  (SC-002): el `UPDATE` condicionado es atómico y el `CHECK stock >= 0` es la red de seguridad.
- **Alternatives considered**: una tabla de reservas con stock disponible calculado (cada lectura
  del catálogo tendría que restar reservas); bloqueos `FOR UPDATE` explícitos (más código para el
  mismo resultado).

## D5. Importes, IVA y descuentos en `src/domain/pricing.ts`

- **Decision**: todo en céntimos enteros con IVA incluido (C2). Funciones puras:
  - `cartTotals(lines, discount, shipping)` devuelve subtotal, descuento, envío, total e IVA
    contenido;
  - el descuento de porcentaje es `round(subtotal × p / 100)`, redondeando la mitad hacia arriba;
    el de importe fijo es `min(importe, subtotal)`; solo se aplica a los productos, nunca al
    envío;
  - el descuento se reparte entre las líneas proporcionalmente con el método del mayor resto, para
    que la suma cuadre al céntimo;
  - el IVA contenido de cada línea es `neto − round(neto / (1 + tipo))`, y el del pedido es la
    suma de líneas más el del envío. Se muestra el total de IVA contenido, no un desglose por tipo.
- **Rationale**: SC-005 exige que carrito, checkout, pedido, correo y pasarela coincidan al
  céntimo. Una sola función pura usada en todos los puntos lo garantiza y se prueba de forma
  exhaustiva en unitarias.
- **Alternatives considered**: decimales o `numeric` en JavaScript (errores de coma flotante);
  calcular el total en SQL (lógica duplicada).

## D6. Número de pedido

- **Decision**: secuencia `order_number_seq` de PostgreSQL. El número es `order_prefix` (de
  `shop_settings`, "PC-" en la demo) más el valor con 6 dígitos ("PC-000123"), guardado en
  `orders.number UNIQUE`. Los huecos (transacciones revertidas) se aceptan.
- **Rationale**: legible, único y sin carreras. Los huecos no importan porque no es una factura
  (fuera de alcance).

## D7. Confirmación del pago: aviso firmado y conciliación al volver

- **Decision**: `POST /api/pagos/webhook` (Route Handler, runtime Node.js):
  1. lee el cuerpo crudo y verifica `Stripe-Signature` (HMAC-SHA256 de `t.cuerpo` con
     `timingSafeEqual` y una tolerancia de 300 s);
  2. registra `event.id` en `payment_events` (`PRIMARY KEY`): si ya existía, responde 200 sin hacer
     nada;
  3. procesa el evento con `handlePaymentEvent` dentro de una transacción con
     `SELECT … FOR UPDATE` sobre el pedido. Los eventos son `checkout.session.completed` con
     `payment_status = paid` (D8), `checkout.session.expired` (cancela si sigue pendiente) y
     `charge.refunded` (confirma el reembolso).

  Responde 400 si la firma no es válida y 500 ante un error transitorio, para que Stripe reintente.
  La ruta no pasa por `isSameOriginRequest`: la autenticidad la da la firma.
- **Al volver** (`/pedido/confirmado?ref=…&session_id=…`), el servidor consulta la sesión a Stripe
  con la clave secreta y, si está pagada, aplica el mismo `markOrderPaid` idempotente. Así el
  comprador ve la confirmación aunque el aviso aún no haya llegado, sin recargas automáticas
  (WCAG 2.2.1). Si no está pagada, la página dice "Estamos confirmando tu pago" con un botón
  "Comprobar de nuevo".
- **Rationale**: el principio VII exige confirmación verificada en el servidor. La consulta con
  la clave secreta también lo es. Solo el regreso del navegador sin consulta no lo sería (FR-016).
  `payment_events` y el `FOR UPDATE` garantizan un solo cobro, un solo descuento de stock y un solo
  correo (SC-003).

## D8. Pago tardío, reintentos y caducidad

- **Decision**:
  - **Una sesión de Stripe por pedido**, con
    `expires_at = max(reservation_expires_at, ahora + 30 min + 60 s)`. Stripe exige que
    `expires_at` esté al menos 30 minutos después de crear la sesión; sin el margen, una reserva
    de 30 minutos daría una sesión rechazada. `reservation_minutes` admite valores de 30 a 120, y
    la caducidad del pedido (más abajo) usa `reservation_expires_at`. "Reintentar
    pago" redirige a la misma `checkout_url` mientras la sesión siga abierta: no crea pedidos ni
    reservas nuevos. Un rechazo de tarjeta ocurre dentro de la página de Stripe, que permite
    reintentar. "Cancelar" vuelve a `/pedido/pago-no-completado`.
  - **Caducidad**: la tarea `orders:maintain` (D16) cancela con `cancelled_by = system` y
    `reason = expired` los pedidos con tarjeta pendientes cuando
    `reservation_expires_at + 2 min` ha pasado (margen para pagos en curso), y los de pago en
    clínica cuando vence `pickup_deadline`. En ambos casos libera el stock y el código de
    descuento, y envía el correo de cancelación.
  - **Pago confirmado de un pedido ya cancelado**: si el stock alcanza, se vuelve a reservar y el
    pedido pasa a "Pagado". Si no alcanza, el pedido sigue cancelado (`reason =
    stock_unavailable`), se reembolsa (D9) y se avisa por correo.
- **Rationale**: cubre los casos límite de cierre del navegador y de stock agotado tras el pago
  con un único camino idempotente. SC-004 (caducidad en el plazo más 5 minutos) se cumple con la
  tarea cada minuto y el margen de 2 minutos.

## D9. Reembolsos

- **Decision**: `refundOrder(orderId)` llama a `provider.refund` con su clave de idempotencia y
  pone `refund_status = refunded` (o `pending` si falla la llamada; `orders:maintain` reintenta los
  `pending` hasta 8 veces con espera creciente y después pasa a `failed`, con un error registrado
  para la clínica). Se usa en el pago tardío sin stock (D8) y en la cancelación de un pedido pagado
  por la clínica (D15). "Reembolsado" es una marca de pago, no un estado (FR-020).
- **Rationale**: principio VII (reembolsos completos). Las devoluciones de productos siguen fuera
  de alcance.

## D10. Un solo pedido pendiente por carrito (FR-012)

- **Decision**:
  - `orders.cart_id` (FK `SET NULL`) con un índice único parcial
    `(cart_id) WHERE status = 'pending_payment' AND payment_method = 'card'`.
  - `orders.checkout_fingerprint` es el SHA-256 de una cadena canónica que construye
    `checkoutFingerprint()` en `src/domain/` a partir de productos, cantidades, método de envío y
    código de descuento.
  - Al confirmar:
    - si hay un pendiente con la misma huella, se actualizan los datos de envío y se redirige a su
      `checkout_url`;
    - si la huella es distinta, se cancela (`reason = replaced`) y se crea otro.
  - Además, `submission_id UNIQUE` (token firmado de la 001) hace que el reenvío del mismo
    formulario devuelva el mismo pedido.
- **Rationale**: evita reservas duplicadas (Clarifications) sin tablas nuevas.

## D11. Pago en clínica

- **Decision**: solo se admite con un método de envío de tipo `clinic_pickup`. Se valida en Zod y
  otra vez en la transacción. El pedido nace `pending_payment` con stock `held`, y
  `pickup_deadline` es el final del día (`Europe/Madrid`) de hoy más `pickup_days` (7). La clínica
  lo marca como "Entregado" (con `paid_at`) con el CLI (D15), lo que pasa la reserva a
  `committed`.
- **Rationale**: Clarifications y US7.

## D12. Códigos de descuento

- **Decision**: tabla `discount_codes`:
  - campos: `code` en mayúsculas y único, `kind` ∈ {`percent`, `fixed`}, `value`,
    `min_subtotal_cents`, `starts_at`, `ends_at`, `max_uses` y `uses_count`, más
    `CHECK (max_uses IS NULL OR uses_count <= max_uses)`;
  - `validateDiscount()` (puro) devuelve el motivo exacto del rechazo: `not_found`,
    `not_started`, `expired`, `exhausted`, `min_subtotal` o `disabled`; el motivo `not_found`
    también cubre los códigos inactivos;
  - el carrito guarda `discount_code_id`;
  - la compra directa no admite códigos (Clarifications).
- **Uso**: el uso se **aparta** al confirmar el pedido con
  `UPDATE … SET uses_count = uses_count + 1 WHERE … AND (max_uses IS NULL OR uses_count <
  max_uses)` y se devuelve si el pedido se cancela. Es más estricto que contar al pagar (FR-027):
  el límite nunca se supera, aunque un pedido pendiente ocupe un uso durante su reserva. En la
  práctica, coincide con FR-027.
- **Anti-adivinanza**: política `discount_origin` (10 intentos cada 10 minutos por origen). Los
  mensajes nunca sugieren códigos válidos.

## D13. Envío y zonas

- **Decision**:
  - tabla `shipping_methods` con `code`, `kind` ∈ {`home_delivery`, `clinic_pickup`}, nombre,
    descripción, plazo, `cost_cents`, `vat_rate`, `postal_prefixes text[]` (nulo = toda España),
    `enabled` y `position`;
  - código postal español: `/^(0[1-9]|[1-4]\d|5[0-2])\d{3}$/`; está en la zona si su prefijo de
    2 dígitos (provincia) figura en la lista;
  - en la demo, envío a domicilio a toda España (nulo) y recogida, ambos a 0 €; el modelo admite
    coste con su IVA;
  - los tests de "fuera de zona" cargan una variante con prefijos restringidos.
- **Rationale**: los prefijos de provincia bastan para zonas reales (península, islas o
  provincia) sin un catálogo de códigos postales.

## D14. Rutas, formularios y avisos

- **Decision**:
  - **Server Actions** con PRG para añadir, cambiar cantidad, eliminar, aplicar o quitar el
    código, "Comprar ahora", confirmar, reintentar y cancelar.
  - **Errores de campo**: en el estado de la acción (`useActionState`), como la 003.
  - **Avisos tras redirigir**: `?aviso=` (A14), con los códigos nuevos `carrito-anadido`,
    `carrito-actualizado`, `carrito-ajustado`, `descuento-aplicado`, `descuento-retirado` y
    `pedido-cancelado`.
  - **"Añadir" desde el listado**: lleva un `return_to` validado con `safeReturnTo`, limitado a
    `/productos`, que conserva filtros y página.
  - **Redirección a la pasarela**: `redirect()` a una URL absoluta (303). La CSP pasa a
    `form-action 'self' <origen del proveedor>`, porque Chrome aplica `form-action` a la
    redirección tras un POST. El origen sale del proveedor (`https://checkout.stripe.com` o el
    propio sitio en `fake`).
  - **Tarjeta del listado**: `design/productos.html` mete un botón dentro de un enlace (HTML no
    válido). La tarjeta pasa a ser un `article` con el enlace en el título que se extiende a toda la
    tarjeta (`.product__link::after`) y un formulario en `.product__foot` por encima. Se añade a
    `design/styles.css` solo con tokens.
  - Las rutas y su contrato están en [contracts/routes.md](contracts/routes.md).

## D15. Gestión de pedidos sin panel: CLI `orders`

- **Decision**: `scripts/orders.ts` (compilado a `cli/orders.mjs`) con las órdenes `list`,
  `show <número>`, `set-status <número> <estado>`, `deliver <número>` (pago en clínica: marca
  pagado y entregado) y `cancel <número> [--refund]`. Todas usan `transitionOrder()` de
  `src/lib/orders/`, que aplica la tabla de transiciones de `src/domain/order-status.ts`, el
  historial, la reserva, el reembolso y los correos. En producción:
  `docker compose exec petcare-app node cli/orders.mjs …`. El contrato está en
  [contracts/cli.md](contracts/cli.md).
- **Rationale**: es la excepción temporal al principio VIII (Complexity Tracking). El panel futuro
  llamará a las mismas funciones.

## D16. Tarea de mantenimiento `orders:maintain`

- **Decision**: `scripts/orders-maintain.ts`, cada minuto con un temporizador de systemd nuevo
  (`petcare-orders-maintain`):
  1. concilia las sesiones abiertas con más de 5 minutos consultando al proveedor (rescata
     avisos perdidos);
  2. caduca los pedidos vencidos (D8);
  3. reintenta los reembolsos `pending` (D9).
  Cada paso se protege con `pg_try_advisory_lock`, para no solaparse.
- **Purgas** (en `retention:purge`): carritos de invitado sin cambios en 30 días;
  `payment_events` con más de 90 días; correos de pedido enviados a las 24 h; y pedidos de más de
  6 años, que se anonimizan (datos de contacto y dirección a `NULL`, `anonymized_at`).

## D17. Correos de pedido

- **Decision**:
  - **Tipos nuevos de `outbox_kind`**: `order_confirmed` (pago con tarjeta),
    `order_received` (pago en clínica, con plazo de recogida), `order_cancelled` (con o sin
    reembolso, y motivo) y `clinic_order` (a `clinic.inbox_email`, en cada pedido nuevo y pagado).
  - **Columna nueva**: `email_outbox.order_id` (FK `SET NULL`), con su `CHECK` de origen ampliado.
  - **Encolado**: con `enqueueEmail` en la misma transacción, y después `sendEmailsNow`.
  - **Plantillas**: en `src/email/templates/order-*.ts`. Llevan líneas, totales con IVA, envío o
    recogida (con la dirección y el horario de la clínica), pago, estado, el enlace (al área o el
    privado de invitado) y la nota de demostración.
  - **Contrato**: [contracts/emails.md](contracts/emails.md).

## D18. Acceso a pedidos: cliente, invitado y confirmación

- **Decision**:
  - **Cliente**: `/mi-cuenta/pedidos/[numero]` consulta por `customer_id` y número. Si no
    coincide, 404 (A9).
  - **Invitado**: `/pedido/[token]`, con un token sin estado
    `sign({ o: orderId, v: access_version })` con la clave `hmac(FORM_SECRET, 'order-access')`
    (patrón B7). Es válido si la versión coincide y `last_status_at + guest_link_days` (90) no ha
    pasado. Si ha caducado, muestra el aviso con el contacto de la clínica y ningún dato. Lleva
    `noindex` y `no-store`.
  - **Confirmación**: `/pedido/confirmado?ref=` firmado con 2 h de caducidad (B6). La lleva
    `success_url`, y `cancel_url` lleva la misma `ref`.
  - **Asociación**: un pedido de invitado nunca se asocia a una cuenta, aunque el correo coincida.
- **Rationale**: FR-023, FR-024 y SC-006.

## D19. Privacidad, cuenta y textos legales

- **Decision**:
  - **Datos del pedido**: copia de nombre, apellidos, correo y dirección (FR-007, minimización).
    El cliente con sesión ve precargados los de su último pedido o, si no tiene, los de su cuenta.
  - **Exportación**: la de la cuenta añade `orders` con `format_version` 2.
  - **Borrar la cuenta**: en la misma transacción se cancelan sus pedidos pendientes
    (`account_deleted`, libera stock) y los demás se desvinculan (`customer_id` a `NULL`). Los
    datos se conservan por obligación legal (6 años, D16).
  - **Textos legales**: tipo legal nuevo `condiciones-venta` en `/condiciones-de-venta`, enlazado
    en el pie y en el checkout. Se reescriben `terminos` ("no se venden productos"), la privacidad
    (finalidad de pedidos, base contractual, Stripe como encargado y plazo de 6 años), la política
    de cookies (`pc_cart`) y los avisos del catálogo y el checkout.
  - **Logs**: registran `order_id`, `payment_id`, el tipo de evento y códigos de error. Nunca
    correo, nombre ni dirección (prueba `no-pii-logs`).

## D20. Pruebas

- **Unitarias**: `pricing` (redondeos, reparto, IVA y topes), `discount`, `shipping` (códigos
  postales y zonas), `order-status` (todas las transiciones válidas e inválidas), `cart-rules`
  (límites de cantidad), `fingerprint`, firma del aviso de Stripe (válida, alterada y caducada),
  adaptador de Stripe con `fetch` simulado y esquema del contenido `checkout:`.
- **Integración** (PostgreSQL real):
  - concurrencia sobre la última unidad con 10 transacciones en paralelo (SC-002);
  - aviso duplicado y simultáneo con la conciliación (SC-003);
  - caducidad y pago tardío con y sin stock;
  - reembolso y reintentos;
  - unión de carritos;
  - FR-012 (misma huella y huella distinta);
  - límites de uso de códigos;
  - IDOR de pedidos;
  - borrado de cuenta con pedidos y exportación.
- **E2E** (proveedor `fake`, proyectos móvil, escritorio y sin JavaScript, con axe): un spec por
  historia; precios cruzados carrito → checkout → correo (SC-005); el CLI se prueba en
  integración.
- **Lighthouse**: `/productos` y una ficha siguen en 90 o más (SC-008).
- **Stripe real (prueba de humo)**: `tests/integration/stripe-live.test.ts` solo se ejecuta si
  hay `STRIPE_SECRET_KEY` de pruebas en el entorno. No forma parte de la puerta de CI y no
  sustituye a ninguna prueba obligatoria.
