# Data Model: Catálogo de la tienda online

Migración **`0003_product_catalog`**. Sigue las convenciones de `src/db/schema.ts`:
- tablas en plural y `snake_case`;
- los helpers `id()`, `position()`, `published()` y `...timestamps`;
- los checks se llaman `<tabla>_<regla>`;
- los índices se llaman `<tabla>_<uso>_idx`.

No necesita extensiones nuevas (C4).

## `product_categories`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | serial PK | |
| `slug` | text UNIQUE NOT NULL | `^[a-z0-9-]+$`, es el valor de `?categoria=` |
| `name` | text NOT NULL | 1–60 caracteres |
| `position` | integer NOT NULL | orden en los filtros |
| `published` | boolean NOT NULL default true | despublicada → no sale en los filtros y sus productos no se publican |
| `created_at`, `updated_at` | timestamptz | |

Índice: `product_categories_order_idx (published, position)`.

## `product_pets`

Mascotas del catálogo (C1). Son independientes de `species`.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | serial PK | |
| `slug` | text UNIQUE NOT NULL | es el valor de `?mascota=` |
| `name` | text NOT NULL | 1–40 caracteres ("Otros animales") |
| `position` | integer NOT NULL | |
| `published` | boolean NOT NULL default true | |
| `created_at`, `updated_at` | timestamptz | |

## `products`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | serial PK | |
| `slug` | text UNIQUE NOT NULL | es la dirección `/productos/<slug>` |
| `name` | text NOT NULL | 1–120 caracteres |
| `search_name` | text NOT NULL | `normalizeSearch(name)`, lo calcula la carga (C4) |
| `short_description` | text NOT NULL | 1–300 caracteres; texto plano, también es la meta descripción |
| `description_md` | text NOT NULL | Markdown, sin HTML crudo (react-markdown) |
| `ingredients_md` | text NULL | nulo o vacío → no hay pestaña |
| `usage_md` | text NULL | nulo o vacío → no hay pestaña |
| `category_id` | integer NOT NULL FK → `product_categories.id` | `ON DELETE RESTRICT` |
| `price_cents` | integer NOT NULL | check `products_price_positive` (> 0); IVA incluido |
| `compare_at_cents` | integer NULL | check `products_compare_at_positive` (nulo o > 0); oferta si es > `price_cents` |
| `vat_rate` | smallint NOT NULL | check `products_vat_rate` IN (0, 4, 10, 21) |
| `stock` | integer NOT NULL default 0 | check `products_stock_non_negative` (>= 0) |
| `is_new` | boolean NOT NULL default false | etiqueta "Novedad" |
| `position` | integer NOT NULL | orden "Destacados" |
| `image_path` | text NULL | relativa a `public/` |
| `image_alt` | text NULL | check `products_image_alt` (con `image_path`, el alt no puede ser nulo ni vacío) |
| `published` | boolean NOT NULL default true | |
| `created_at`, `updated_at` | timestamptz | |

Índices:
- `products_listing_idx (published, category_id)`;
- `products_order_idx (published, position)`.

Con el volumen previsto, el `LIKE` sobre `search_name` no necesita índice.

**Valores derivados** (en `src/domain/catalog.ts`, no se guardan):
- `inStock = stock > 0`.
- `onSale = compareAtCents !== null && compareAtCents > priceCents`.
- `availabilityLabel`: "En stock · Envío en <shipping_text>" o "Agotado".
- `tabs`: la lista de pestañas con contenido, de entre `descripcion`, `ingredientes` y
  `modo-de-uso`.

**Visibilidad pública**: `products.published AND product_categories.published AND` al menos una
mascota publicada enlazada. La regla vive en una sola consulta base (`publishedProducts()`) que
usan el listado, la ficha, los relacionados y el sitemap.

## `product_pet_links`

| Columna | Tipo | Reglas |
|---|---|---|
| `product_id` | integer FK → `products.id` | `ON DELETE CASCADE` |
| `pet_id` | integer FK → `product_pets.id` | `ON DELETE RESTRICT` |

La PK es `(product_id, pet_id)`, y hay un índice `product_pet_links_pet_idx (pet_id)`. Cada
producto tiene al menos una mascota; lo exige la validación de la carga, no la base de datos.

## `shop_settings` (singleton)

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | integer PK | check `shop_settings_singleton` (`id = 1`) |
| `shipping_text` | text NOT NULL | "24-48 h"; 1–40 caracteres |
| `page_size` | smallint NOT NULL default 12 | check entre 4 y 48 |
| `demo_notice_enabled` | boolean NOT NULL default false | en la demo es `true` (FR-019b) |
| `demo_notice_text` | text NULL | obligatorio si el aviso está activado (check `shop_settings_demo_notice`) |
| `meta_description` | text NOT NULL | meta descripción de `/productos` |
| `updated_at` | timestamptz | |

## Estados

`published` es el único estado, y lo maneja la carga:
- un producto que deja de estar en el YAML pasa a `false` (`unpublishMissing`);
- si vuelve a estar, pasa a `true` con el mismo `id`.

El stock no cambia en esta feature; lo moverán el carrito y los pedidos.

## Relación con features futuras

- El **carrito y los pedidos** referenciarán `products.id`, y guardarán en cada línea de pedido
  el precio y el IVA de ese momento.
- El **panel de administración** editará estas mismas tablas, así que el esquema no cambia.
