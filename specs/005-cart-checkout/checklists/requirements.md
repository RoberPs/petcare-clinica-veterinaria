# Specification Quality Checklist: Carrito de la compra y pago

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Los 3 [NEEDS CLARIFICATION] se resolvieron el 2026-11-12 (Q1: A, Q2: A, Q3: A): envío a toda
  España, descuentos de porcentaje o importe fijo con condiciones opcionales, y Bizum fuera de
  alcance (se elimina US10).
- Las menciones a "pasarela externa", "aviso firmado" y "línea de órdenes" vienen de la
  constitución (principios VII y VIII) y no fijan tecnología.
- FR-001 sustituye a FR-019 de la feature 004; FR-030 modifica textos de contenido de la 001 y 004.
- Los CTA de compra pasan a marino aunque la maqueta use cian (principio I).

## Implementación (2026-11-13): desviaciones y notas

- **`cart_items.unit_price_cents`**: se añade dentro de la propia `0004_cart_checkout`. Sin el
  precio que vio el cliente no se puede dar el aviso "antes X, ahora Y" (FR-006). Las bases de
  desarrollo (5434) y de pruebas (5433), que ya tenían la 0004 aplicada, recibieron la columna a
  mano; una base nueva la recibe con la migración.
- **`CHECK email_outbox_source`**: no se amplía (T005 lo preveía). Los correos de pedido se guardan
  ya renderizados en `payload` y se enlazan con `email_outbox.order_id`; el check actual basta.
- **`PAYMENT_FAKE_ALLOWED=true` en los e2e**: `next start` arranca con `NODE_ENV=production`, y
  `env.ts` prohíbe `fake` en producción salvo con esa variable (D2). Solo se activa en el entorno
  de Playwright.
- **Acción `cancelOrder`**: en `src/app/pedido/actions.ts` se llama `cancelPendingOrder`, para no
  chocar con `cancelOrder` de `src/lib/orders/cancel.ts`. Pide `confirm=si`; sin él vuelve a la
  página, que muestra el paso de confirmación con `?cancelar=1`.
- **Checkout adelantado**: `CheckoutForm` ya pinta todos los métodos de envío y de pago activos, el
  `fieldset` de la dirección, el correo solo para invitados y la precarga desde el último pedido o
  la cuenta. Sus tests (US4, US6 y US7) ya pasan.
- **Leyenda del `fieldset` de la dirección**: es "Dirección de envío", y "Solo para envío a
  domicilio. Si lo recoges en la clínica, déjala en blanco." va como texto de ayuda debajo. T069
  pedía "Solo para envío a domicilio" como leyenda; así el grupo tiene un nombre que describe su
  contenido y la condición sigue a la vista.
- **"Crear cuenta" desde el checkout**: enlaza a `/crear-cuenta` sin `return_to`, porque el registro
  no lo admite (exige confirmar el correo). "Iniciar sesión" sí vuelve a `/finalizar-compra`.
- **Resumen del checkout**: antes de elegir método muestra el envío del método más barato (como el
  carrito, T039). El importe definitivo es el del método elegido y se ve en la confirmación.

### US5 a US9 y cierre (2026-11-13)

- **Cómo se identifica el pedido en las acciones**: `src/lib/orders/locate.ts` (`orderFromForm`)
  acepta la `ref` de 2 h, el `numero` con la sesión de su dueño o el `token` de invitado, y devuelve
  la página a la que volver. `retryPayment` y `cancelPendingOrder` son las mismas acciones en las
  tres páginas. El bloque de botones es un componente nuevo, `OrderActions`.
- **Enlace de invitado solo para pedidos sin cuenta**: `/pedido/[token]` da 404 si el pedido tiene
  `customer_id`; esos pedidos se ven en "Mis pedidos" y sus correos ya enlazan allí (`orderPath`).
- **Borrar la cuenta**: además de cancelar los pendientes (`account_deleted`, sin correo de
  cancelación, porque ya va el de la baja) y desvincular el resto, sube `access_version`, para que
  ningún enlace firmado anterior muestre esos pedidos.
- **Exportación v2**: `status` va con su texto ("Pagado") y `refunded` aparte, como en el contrato;
  `discount` es `null` si el pedido no lleva código.
- **"Mis pedidos"**: la paginación usa `?pagina=` con la clase `.pagination` del catálogo. "Mis
  pedidos" del menú lleva a `/mi-cuenta/pedidos` solo con la compra activa; si no, a "Próximamente".
- **CLI de pedidos**: la lógica vive en `src/lib/orders/cli.ts` (`runOrdersCli`), para probarla sin
  lanzar procesos; `scripts/orders.ts` solo la envuelve. Además de los códigos 2 y 3 del contrato,
  un uso incorrecto termina con código 1. `set-status` solo admite `preparing`, `shipped`,
  `ready_for_pickup` y `delivered`; `paid` lo pone siempre la pasarela.
- **"Comprar ahora"**: que el carrito `direct` no lleve código lo garantiza el `CHECK
  carts_direct_no_discount` de la 0004; el flujo no lo vuelve a poner a `NULL`. Si la cantidad se
  acota al stock, el checkout se abre con el aviso `carrito-ajustado`.
- **Conservación**: los correos de pedido cerrados se borran a las 24 h con la regla ya existente de
  los correos sin mensaje de contacto; no hace falta una regla propia.
- **Fechas**: se añade `formatDate` a `src/domain/time.ts` para la columna "Fecha" de los pedidos.
- **Pruebas**:
  - Los e2e de "Mis pedidos" insertan los pedidos directamente en la base (`insertOrder` en
    `tests/e2e/db.ts`) en lugar de comprarlos por la interfaz.
  - `stripe-live.test.ts` se salta si `STRIPE_SECRET_KEY` no es una clave `sk_test_…`, que es lo
    normal en local y en CI.
  - Vitest se lanza desde PowerShell. Desde Git Bash falla al arrancar con `Cannot read properties
    of undefined (reading 'config')`, incluso con tests que pasan, así que es cosa del entorno.
    Probablemente se debe a que Git Bash escribe la ruta en minúsculas (`/c/...`).
- **Gitleaks**: sin hallazgos en lo versionado salvo el `FORM_SECRET` de `tests/test-env.ts`, que ya
  estaba commiteado de antes y es un valor de prueba. Un `gitleaks dir .` también marca `.next/` y
  `cli/`, que son generados e ignorados por git.
- **Tests anteriores actualizados** (fallaban en la suite completa por cambios de esta feature):
  - `us4-summary`: "Mis pedidos" lleva ahora a `/mi-cuenta/pedidos` y aparece "Últimos pedidos".
  - `us8-legal`: los cuatro textos legales tienen fecha del 12/11/2026 (D19).
  - `us5-catalog-labels` y `us6-related`: la tarjeta es un `article.product` desde T034.
- **Lighthouse (T105)**: pasa el criterio de `lighthouserc.json`, que toma la mejor de 3 ejecuciones
  (`/` 95, `/productos` 99, ficha 98). Las medianas en local varían bastante: 94, 98 y 81 en la última
  pasada, porque la primera ejecución en frío sale más baja.
- **Pendiente para el usuario**: el recorrido manual del quickstart (pasos 1–12) y el teclado de
  principio a fin con un navegador real. La parte automática (lint, unitarias, integración, e2e en
  los tres perfiles con axe, y Lighthouse) se ha ejecutado.

### Recorrido manual (T107, 2026-11-16)

- Recorrido del quickstart hecho por el usuario en el navegador: correcto.
- Corregido en `design/styles.css` durante el recorrido:
  - el campo de cantidad (`.qty--field`) heredaba el relleno de `.field input` y no dejaba ver el
    número; ahora `.qty input[type="number"]` no lleva relleno;
  - el segundo campo de cada `.field-row` dentro de `.panel` recibía el margen superior de
    `.field + .field` y quedaba descuadrado (Apellidos, Ciudad); ahora no lo recibe.
- El código postal `35001` se acepta porque `content/petcare.yaml` deja `postal_prefixes: null`
  (toda España). El bloqueo fuera de zona se comprueba con la variante peninsular, como indica el
  paso 8 del quickstart y cubren los tests de US4.
