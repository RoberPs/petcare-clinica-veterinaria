# Data Model: Carrito de la compra y pago (migración `0004_cart_checkout`)

Importes en céntimos enteros con IVA incluido (C2). Tipos de IVA: `smallint` ∈ {0, 4, 10, 21}.
Las marcas de tiempo son `timestamptz`. `id()` es un UUID, como en las features anteriores.

## Enumeraciones nuevas

| Enum | Valores |
|---|---|
| `cart_kind` | `main`, `direct` |
| `shipping_kind` | `home_delivery`, `clinic_pickup` |
| `payment_method` | `card`, `in_clinic` |
| `order_status` | `pending_payment`, `paid`, `preparing`, `shipped`, `ready_for_pickup`, `delivered`, `cancelled` |
| `reservation_status` | `held`, `committed`, `released` |
| `order_actor` | `customer`, `system`, `clinic`, `gateway` |
| `cancel_reason` | `customer`, `expired`, `replaced`, `stock_unavailable`, `clinic`, `account_deleted` |
| `refund_status` | `none`, `pending`, `refunded`, `failed` |
| `payment_status` | `open`, `succeeded`, `expired`, `refunded` |
| `discount_kind` | `percent`, `fixed` |

Enumeraciones que se amplían:
- `outbox_kind`: + `order_confirmed`, `order_received`, `order_cancelled`, `clinic_order`;
- `legal_kind`: + `condiciones-venta`.

## Configuración (se carga desde el bloque `checkout:` del YAML)

### `shop_settings` (columnas nuevas)

| Columna | Tipo | Regla |
|---|---|---|
| `card_enabled` | boolean | `true` en la demo |
| `in_clinic_enabled` | boolean | `true` en la demo |
| `reservation_minutes` | smallint | 30–120 (mínimo de Stripe, D8), por defecto 30 |
| `pickup_days` | smallint | 1–30, por defecto 7 |
| `cart_retention_days` | smallint | 1–90, por defecto 30 |
| `max_qty_per_line` | smallint | 1–99, por defecto 10 |
| `max_pending_per_email` | smallint | 1–10, por defecto 3 (pedidos pendientes de invitado) |
| `max_pending_per_customer` | smallint | 1–10, por defecto 3 |
| `order_prefix` | text | de 1 a 6 caracteres `[A-Z0-9-]`, "PC-" en la demo |
| `guest_link_days` | smallint | 7–365, por defecto 90 |
| `checkout_notice_text` | text | aviso de demostración del checkout; si es nulo, no hay aviso |

### `shipping_methods`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | slug, p. ej. `domicilio` o `recogida` |
| `kind` | `shipping_kind` | como mucho un `clinic_pickup` activo |
| `name` | text | "Envío a domicilio" |
| `description` | text | "Entrega en 24-48 h" |
| `cost_cents` | integer | ≥ 0 |
| `vat_rate` | smallint | IVA del envío si tiene coste |
| `postal_prefixes` | text[] NULL | prefijos de 2 dígitos (01–52); nulo = toda España; solo para `home_delivery` |
| `enabled`, `position` | | |

### `discount_codes`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `code` | text UNIQUE | mayúsculas `[A-Z0-9]{3,20}`; se normaliza al aplicarlo |
| `kind` | `discount_kind` | |
| `value` | integer | `percent`: 1–100; `fixed`: céntimos > 0 |
| `min_subtotal_cents` | integer NULL | ≥ 0 |
| `starts_at`, `ends_at` | timestamptz NULL | `ends_at > starts_at` |
| `max_uses` | integer NULL | > 0 |
| `uses_count` | integer | ≥ 0, `CHECK (max_uses IS NULL OR uses_count <= max_uses)` |
| `enabled` | boolean | |

Al recargar el contenido no se restablece `uses_count` de los códigos existentes (upsert por
`code`).

## Carrito

### `carts`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `kind` | `cart_kind` | |
| `customer_id` | uuid NULL FK → customers ON DELETE CASCADE | |
| `token_hash` | text NULL | SHA-256 en hexadecimal del valor de `pc_cart` |
| `discount_code_id` | uuid NULL FK → discount_codes ON DELETE SET NULL | siempre nulo si `kind = direct` |
| `created_at`, `updated_at` | | `updated_at` gobierna la purga de los carritos de invitado |

`CHECK (num_nonnulls(customer_id, token_hash) = 1)`. Índices únicos `(customer_id, kind)` y
`(token_hash, kind)`.

### `cart_items`

| Columna | Tipo | Regla |
|---|---|---|
| `cart_id` | uuid FK → carts ON DELETE CASCADE | PK compuesta |
| `product_id` | uuid FK → products ON DELETE CASCADE | PK compuesta |
| `quantity` | smallint | 1–99 (el máximo efectivo es `max_qty_per_line`) |
| `added_at` | timestamptz | orden de las líneas |

## Pedidos

### `orders`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `number` | text UNIQUE | `order_prefix` + `lpad(nextval('order_number_seq'), 6)` |
| `submission_id` | uuid UNIQUE | token firmado de la 001 |
| `customer_id` | uuid NULL FK → customers ON DELETE SET NULL | nulo en invitados |
| `cart_id` | uuid NULL FK → carts ON DELETE SET NULL | |
| `checkout_fingerprint` | text | D10 |
| `contact_email`, `contact_email_normalized` | text NULL | nulos tras anonimizar |
| `first_name`, `last_name` | text NULL | 1–60 caracteres; nulos tras anonimizar |
| `address_line`, `postal_code`, `city` | text NULL | obligatorios si `shipping_kind = home_delivery` y no está anonimizado |
| `shipping_method_code`, `shipping_name` | text | copia |
| `shipping_kind` | `shipping_kind` | copia |
| `shipping_cost_cents`, `shipping_vat_rate` | | copia |
| `payment_method` | `payment_method` | `CHECK (payment_method <> 'in_clinic' OR shipping_kind = 'clinic_pickup')` |
| `discount_code` | text NULL | copia del código |
| `discount_code_id` | uuid NULL FK SET NULL | para devolver el uso |
| `subtotal_cents`, `discount_cents`, `total_cents`, `vat_cents` | integer | ≥ 0; `total = subtotal − descuento + envío` |
| `status` | `order_status` | |
| `reservation_status` | `reservation_status` | |
| `reservation_expires_at` | timestamptz NULL | solo `card` |
| `pickup_deadline` | timestamptz NULL | solo `in_clinic` |
| `access_version` | integer | enlace de invitado (D18) |
| `last_status_at` | timestamptz | caducidad del enlace de invitado |
| `paid_at`, `cancelled_at` | timestamptz NULL | |
| `cancelled_by` | `order_actor` NULL | |
| `cancel_reason` | `cancel_reason` NULL | |
| `refund_status` | `refund_status` | por defecto `none` |
| `refunded_at`, `anonymized_at` | timestamptz NULL | |
| `created_at`, `updated_at` | | |

Índices:
- único parcial `(cart_id) WHERE status = 'pending_payment' AND payment_method = 'card'` (D10);
- `(customer_id, created_at DESC)`;
- `(status, reservation_expires_at)` y `(status, pickup_deadline)` para la tarea de
  mantenimiento;
- `(contact_email_normalized) WHERE status = 'pending_payment'` para el límite de pedidos
  pendientes.

### `order_items`

`id`, `order_id` (FK CASCADE), `product_id` (FK → products ON DELETE SET NULL), `product_name`,
`product_slug`, `unit_price_cents` (> 0), `vat_rate`, `quantity` (1–99), `discount_share_cents`
(≥ 0), `line_total_cents` (= unitario × cantidad − parte del descuento) y `vat_cents`. El orden es
el del carrito.

### `order_status_history`

`id`, `order_id` (FK CASCADE), `from_status` (NULL en la creación), `to_status`, `actor`
(`order_actor`), `note` (text NULL: motivo técnico, sin datos personales) y `created_at`.

### `payments`

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `order_id` | uuid FK CASCADE | un solo `succeeded` por pedido (índice único parcial) |
| `provider` | text | `stripe` o `fake` |
| `provider_session_id` | text UNIQUE | |
| `provider_payment_id` | text NULL | `payment_intent` |
| `checkout_url` | text | para reintentar (D8) |
| `amount_cents` | integer | = `orders.total_cents` |
| `status` | `payment_status` | |
| `refund_id` | text NULL | |
| `expires_at`, `created_at`, `updated_at` | | |

### `payment_events`

`provider_event_id` (text PK), `provider`, `type`, `received_at`, `processed_at` y `result`
(`ok`, `ignored` o `error`). Se purga a los 90 días.

### `email_outbox` (cambio)

Columna nueva `order_id` (FK → orders ON DELETE SET NULL). El `CHECK email_outbox_source` se
amplía para admitir el origen de pedido.

## Transiciones de estado (`src/domain/order-status.ts`)

| Desde | Hacia | Quién | Condición |
|---|---|---|---|
| — | `pending_payment` | customer | al crear el pedido (`held`) |
| `pending_payment` | `paid` | gateway | `card`; pasa la reserva a `committed` |
| `pending_payment` | `delivered` | clinic | `in_clinic`; fija `paid_at` y pasa la reserva a `committed` |
| `pending_payment` | `cancelled` | customer, system, clinic | libera el stock y el código |
| `cancelled` (`expired`) | `paid` | gateway | pago tardío con stock (D8): vuelve a reservar y pasa a `committed` |
| `paid` | `preparing` | clinic | |
| `paid`, `preparing` | `shipped` | clinic | `home_delivery` |
| `paid`, `preparing` | `ready_for_pickup` | clinic | `clinic_pickup` |
| `shipped`, `ready_for_pickup` | `delivered` | clinic | |
| `paid`, `preparing`, `ready_for_pickup` | `cancelled` | clinic | reembolso obligatorio; el stock se devuelve (`committed → released`) |

Cualquier otra transición se rechaza. Cada transición escribe en `order_status_history` y
actualiza `last_status_at`.

Etiquetas visibles en español:
- Pendiente de pago, Pagado, En preparación, Enviado, Listo para recoger, Entregado y Cancelado;
- con la marca "· Reembolsado" si `refund_status = refunded`.

## Validaciones (Zod, `src/domain/checkout-schemas.ts`)

| Campo | Regla y mensaje |
|---|---|
| `email` (invitado) | correo válido de hasta 254 caracteres: "Escribe un correo válido" |
| `first_name`, `last_name` | 1–60 caracteres sin espacios sobrantes: "Escribe tu nombre" o "Escribe tus apellidos" |
| `address_line` | 5–120 caracteres, solo con envío a domicilio |
| `postal_code` | código postal español de 5 dígitos: "Código postal no válido"; fuera de zona: "No enviamos a este código postal. Puedes recogerlo en la clínica." |
| `city` | 2–60 caracteres |
| `shipping_method` | código activo |
| `payment_method` | método activo; `in_clinic` solo con recogida: "El pago en clínica solo está disponible con recogida en la clínica" |
| `quantity` | entero de 1 a `min(stock, max_qty_per_line)` (0 = eliminar) |
| `discount_code` | 3–20 caracteres alfanuméricos tras normalizar |

## Retención

| Qué | Cuándo |
|---|---|
| Carritos de invitado | `updated_at` con más de `cart_retention_days` |
| `payment_events` | 90 días |
| Correos de pedido enviados o fallidos | 24 h (como los de cuenta) |
| Pedidos | a los 6 años, anonimizados: contacto y dirección a `NULL`, `anonymized_at`; se conservan los importes |
