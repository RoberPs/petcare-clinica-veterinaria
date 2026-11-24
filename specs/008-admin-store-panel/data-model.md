# Data Model: Panel de administración de la tienda (feature 008)

Migración **`0007_admin_store`**. Amplía las tablas de la 004 (catálogo), la 005 (pedidos) y la
007 (panel); no renombra ni borra nada.

## Cambios de esquema

### `products` (ya existe)

| Columna | Tipo | Regla |
|---|---|---|
| `image_width` | `integer NULL` | Ancho de la variante mayor de una foto subida; `NULL` en las SVG de la demo |
| `image_height` | `integer NULL` | Alto correspondiente. CHECK: ambos nulos o ambos > 0 |

Lo demás se reutiliza tal cual: `slug` (inmutable desde el panel, G2), `published` (activo o
desactivado), `compare_at_cents` ("Oferta", G3), `is_new`, `position`, `stock` (disponible, G5),
`image_path` (`media/…` estática o `subidas/productos/<uuid>`, G4) e `image_alt`.

### `stock_movements` (nueva)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `product_id` | uuid → `products` `ON DELETE RESTRICT` | Índice `(product_id, created_at DESC)` |
| `delta` | `integer NOT NULL` | `<> 0`, salvo en `initial`, que puede ser 0 |
| `reason` | enum `stock_movement_reason` | `initial`, `restock`, `count`, `damage`, `other`, `order_reserved`, `order_released`, `content_load` |
| `stock_after` | `integer NOT NULL` | `>= 0`: el disponible tras el movimiento |
| `order_id` | uuid → `orders` `ON DELETE SET NULL`, nulo | Solo en `order_*` |
| `admin_id` | uuid → `customers` `ON DELETE SET NULL`, nulo | Solo en los ajustes del panel |
| `note` | `varchar(200) NULL` | Texto interno opcional del ajuste |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

**Backfill**: una fila `initial` por producto con `delta = 0`, `stock_after = stock` y
`note = 'Saldo al activar el panel'`.

### `order_status_history` (ya existe)

| Columna | Tipo | Regla |
|---|---|---|
| `admin_id` | uuid → `customers` `ON DELETE SET NULL`, nulo | Solo con `actor = 'clinic'` desde el panel; nulo desde la CLI (G9) |

### `orders` (ya existe)

- Índice nuevo `orders_created_at_idx (created_at DESC)` para la lista del panel (G6).

### Enum `outbox_kind` (ya existe)

- Valor nuevo `order_status` (G11). Su carga útil es `{ orderId, status, combined?: true }`.

### Sin cambios de esquema

`discount_codes` (G12: la autoría y la fecha quedan en `admin_audit_log`), `admin_audit_log`
(sus listas cerradas están en TypeScript, G14) y `payments`.

## Transiciones de pedido (`ORDER_TRANSITIONS`)

Las de la feature 005 más una fila nueva (**en negrita**). Lo que ofrece el panel es
`allowedTransitions(order, 'clinic', now)`.

| De | A | Actor | Condición |
|---|---|---|---|
| `pending_payment` | `paid` | gateway | tarjeta |
| **`pending_payment`** | **`paid`** | **clinic** | **`in_clinic` y `pickup_deadline > now`** |
| `pending_payment` | `delivered` | clinic | `in_clinic`: el panel lo hace en dos pasos, `paid` y luego `delivered` (G7) |
| `pending_payment` | `cancelled` | customer, system, clinic | |
| `cancelled` | `paid` | gateway | pago tardío |
| `paid` | `preparing` | clinic | |
| `paid`, `preparing` | `shipped` | clinic | envío a domicilio |
| `paid`, `preparing` | `ready_for_pickup` | clinic | recogida |
| `shipped`, `ready_for_pickup` | `delivered` | clinic | |
| `paid`, `preparing`, `ready_for_pickup` | `cancelled` | clinic | con reembolso |

Sin cambios: **no hay** `shipped → cancelled` ni `delivered → cancelled` (aclaración Q1).

**Efecto sobre la reserva** (`reservationEffect`, sin cambios): al pasar a `paid` o `delivered`, la
reserva pasa a `committed` (aclaración Q4); al cancelar, a `released` y se devuelven las unidades
con un movimiento `order_released`.

**Concurrencia**: el formulario envía `from`, y dentro de `lockOrder` se exige
`status = from` (G8).

## Estado calculado de un código de descuento (`discountState`)

Se evalúa en este orden:

1. `!enabled` → `disabled` ("Desactivado").
2. `starts_at > now` → `scheduled` ("Programado").
3. `ends_at < now` → `expired` ("Caducado").
4. `max_uses != null && uses_count >= max_uses` → `exhausted` ("Agotado").
5. En otro caso → `active` ("Activo").

## Reglas de validación (Zod, en el servidor)

**Producto**
- `name`: 2–80 caracteres, único sin distinguir mayúsculas.
- `short_description`: 10–200.
- `description_md`: 20–5000.
- `ingredients_md` y `usage_md`: ≤ 3000, opcionales.
- `category_id`: debe existir.
- `pet_ids`: al menos uno, y todos deben existir.
- `price`: euros con como mucho 2 decimales, mayor que 0 y como mucho 9999,99 (se guarda en
  céntimos).
- `on_sale` con `compare_at` mayor que `price`.
- `vat_rate` ∈ `VAT_RATES`.
- `stock_initial`: entero de 0 a 99999, solo al crear.
- `is_new`, `published`.
- `position`: 0–9999.
- `image`: opcional; ≤ 5 MB; formato detectado `jpeg`, `png` o `webp`; como mucho 40 MP.
- `image_alt`: 3–150 caracteres, obligatorio si queda foto.
- `remove_image`.

**Ajuste de stock**
- `delta`: entero distinto de 0, de −99999 a 99999.
- `reason` ∈ `restock`, `count`, `damage`, `other`.
- `note`: ≤ 200, obligatoria si `reason = other`.

**Cambio de estado**
- `id`: uuid.
- `from` y `to` ∈ `order_status`.
- `note`: ≤ 200 (obligatoria al cancelar: 3–200).
- `deliver`: booleano, solo en la confirmación del pago en clínica.

**Código de descuento**
- `code`: se normaliza a `^[A-Z0-9]{3,20}$` y debe ser único.
- `kind` ∈ `percent`, `fixed`.
- `value`: 1–100 en `percent`, o euros mayores que 0 en `fixed`.
- `starts_on` y `ends_on`: fechas opcionales, con `ends_on ≥ starts_on`.
- `min_subtotal` y `max_uses`: opcionales, mayores que 0.

## Relaciones nuevas

- `stock_movements` → `products` (n:1), → `orders` (n:1, opcional), → `customers` (n:1, opcional,
  el autor).
- `order_status_history` → `customers` (n:1, opcional, el autor).
