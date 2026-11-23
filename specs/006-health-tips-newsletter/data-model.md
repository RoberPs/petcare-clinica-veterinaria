# Data Model: Consejos de salud y boletín (feature 006)

Migración `0005_health_tips_newsletter` (generada con `drizzle-kit` + SQL a mano para los CHECK,
los `ALTER TYPE` y el backfill de E12).

## Enums

| Enum | Cambio |
|---|---|
| `post_kind` (nuevo) | `article`, `news` |
| `newsletter_status` (nuevo) | `pending`, `confirmed` |
| `newsletter_source` (nuevo) | `form`, `account` |
| `newsletter_unsubscribe_reason` (nuevo) | `link`, `one_click`, `account`, `account_deleted` |
| `legal_kind` | + `boletin` |
| `outbox_kind` | + `newsletter_confirm` |

## `post_categories`

| Columna | Tipo | Regla |
|---|---|---|
| `key` | text PK | `^[a-z][a-z0-9-]{0,31}$` |
| `label` | text NOT NULL | 1–40 caracteres |
| `sort_order` | integer NOT NULL | orden de las pestañas |
| `updated_at` | timestamptz NOT NULL | |

Se cargan del YAML; una categoría ausente del archivo se borra si no tiene publicaciones, y si las
tiene el loader falla con un error claro.

## `posts`

| Columna | Tipo | Regla / origen |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text UNIQUE NOT NULL | formato `slug` del loader; FR-008 |
| `kind` | `post_kind` NOT NULL | E1 |
| `category_key` | text NULL → `post_categories.key` (`ON UPDATE CASCADE`) | CHECK `kind = 'news' OR category_key IS NOT NULL` |
| `title` | text NOT NULL | 1–120 |
| `lead` | text NOT NULL | preámbulo, 1–400 |
| `body_md` | text NOT NULL | ≤ 40 000, sin `#` de nivel 1 (E2) |
| `image` | text NULL | ruta `/media/…` |
| `image_alt` | text NULL | obligatorio si hay `image` (CHECK) |
| `meta_description` | text NOT NULL | ≤ 160; si falta en el YAML, se toma del preámbulo recortado |
| `search_text` | text NOT NULL | `normalizeSearch(title + lead + cuerpo sin marcas)` (E4) |
| `published` | boolean NOT NULL DEFAULT true | `unpublishMissing` lo pone a false |
| `published_at` | timestamptz NOT NULL | fecha del YAML a las 00:00 `Europe/Madrid` |
| `created_at`, `updated_at` | timestamptz NOT NULL | |

Índices: `(kind, published_at DESC) WHERE published`, `(category_key, published_at DESC) WHERE
published`. Visible = `published AND published_at <= now()`.

## `newsletter_subscriptions` (solo suscripciones vivas)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | va en el token de baja; una nueva alta tras una baja crea otro id |
| `email` | text UNIQUE NOT NULL | normalizado (minúsculas, sin espacios), ≤ 254 |
| `status` | `newsletter_status` NOT NULL | |
| `source` | `newsletter_source` NOT NULL | |
| `customer_id` | uuid UNIQUE NULL → `customers.id` `ON DELETE SET NULL` | |
| `policy_version` | text NOT NULL | versión de la página `boletin` aceptada; `previa` en el backfill |
| `created_at` | timestamptz NOT NULL | alta |
| `confirmed_at` | timestamptz NULL | CHECK `status = 'confirmed'` ⇔ `confirmed_at IS NOT NULL` |
| `confirm_token_hash` | text UNIQUE NULL | SHA-256; se conserva tras confirmar para responder "ya confirmada" a un segundo uso (E8) |
| `confirm_expires_at` | timestamptz NULL | `confirm_sent_at + 7 días` |
| `confirm_sent_at` | timestamptz NULL | regla de 1 hora (E9) |

Índice: `(created_at) WHERE status = 'pending'` para la purga.

### Transiciones

```text
(nada) ──subscribe──▶ pending ──confirm (token vigente)──▶ confirmed
pending ──subscribe (≥ 1 h desde el último envío)──▶ pending (token nuevo)
pending ──30 días sin confirmar──▶ (borrada, sin constancia)
pending | confirmed ──baja (enlace, un clic, cuenta, cuenta eliminada)──▶ (borrada + constancia)
(nada) ──verificar cuenta con preferencia / activar en "Datos personales"──▶ confirmed (source = account)
```

Una baja de una fila `pending` también escribe constancia (tuvo una política aceptada).

## `newsletter_unsubscribe_records` (constancias anónimas)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `email_hmac` | text NOT NULL | `HMAC-SHA256(NEWSLETTER_HASH_KEY, email)` en hex (E7) |
| `source` | `newsletter_source` NOT NULL | |
| `policy_version` | text NOT NULL | |
| `subscribed_at` | timestamptz NOT NULL | |
| `confirmed_at` | timestamptz NULL | |
| `unsubscribed_at` | timestamptz NOT NULL | |
| `reason` | `newsletter_unsubscribe_reason` NOT NULL | |

Índices: `(unsubscribed_at)` para la purga de 3 años; `(email_hmac)`.

## Cambios en tablas existentes

- `customers.marketing_opt_in` y `marketing_opt_in_changed_at`: sin cambios de esquema; pasan a ser
  un espejo escrito solo desde `src/lib/newsletter/sync.ts` (E11).
- `customer_consents`: sin cambios; se registra `marketing_opt_in` / `marketing_opt_out` en cada
  cambio que venga del boletín.
- `rate_limit_hits`: sin cambios; nueva política `newsletter_origin` en `RATE_POLICIES`.
- `site_sections`: `consejos.href` = `/consejos` desde el YAML.
- `processed_submissions`: el CHECK de `scope` admite además `newsletter`; registra el `submission_id` del formulario del boletín
  para que un reenvío devuelva la misma confirmación (E9).

## `newsletter_settings` (una fila, como `booking_settings` y `shop_settings`)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | smallint PK DEFAULT 1 | CHECK `id = 1` |
| `enabled` | boolean NOT NULL | si es true, el loader exige la página legal `boletin` (E13) |
| `title` | text NOT NULL | 1–80 |
| `text` | text NOT NULL | 1–240 |
| `updated_at` | timestamptz NOT NULL | |

## Backfill (E12)

```sql
INSERT INTO newsletter_subscriptions (id, email, status, source, customer_id, policy_version, created_at, confirmed_at)
SELECT gen_random_uuid(), lower(c.email), 'confirmed', 'account', c.id, 'previa',
       coalesce(c.marketing_opt_in_changed_at, c.created_at), coalesce(c.marketing_opt_in_changed_at, c.created_at)
FROM customers c
WHERE c.marketing_opt_in AND c.email_verified_at IS NOT NULL
ON CONFLICT DO NOTHING;
```

## Retención (E15)

| Dato | Plazo |
|---|---|
| Suscripción `pending` | 30 días desde `created_at` |
| Suscripción `confirmed` | hasta la baja |
| Constancia de baja | 3 años desde `unsubscribed_at` |
| `rate_limit_hits` | 24 h (sin cambios) |
