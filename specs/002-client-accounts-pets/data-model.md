# Data Model: Cuentas de cliente y mascotas

Todo se añade a `src/db/schema.ts` y a la migración `drizzle/0001_client_accounts.sql`. Las fechas
son `timestamptz` y los identificadores, `uuid` (`gen_random_uuid()`), como en la 001.

## Tablas nuevas

### `customers`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `email` | text NOT NULL | tal como lo escribió el cliente (sin espacios en los extremos), como máximo 254 caracteres |
| `email_normalized` | text NOT NULL **UNIQUE** | `lower(trim(email))` (FR-004) |
| `first_name` | text NOT NULL | 1–80 caracteres |
| `last_name` | text NOT NULL | 1–80 caracteres |
| `phone` | text NULL | formato telefónico ([forms.md](contracts/forms.md)); se guarda tal como se escribió |
| `address_line` | text NULL | como máximo 120 caracteres |
| `postal_code` | text NULL | `^\d{5}$` (España); obligatorio si hay `city`, y viceversa |
| `city` | text NULL | como máximo 80 caracteres |
| `province` | text NULL | como máximo 80 caracteres |
| `password_hash` | text NOT NULL | PHC de Argon2id (A1) |
| `email_verified_at` | timestamptz NULL | NULL significa cuenta sin verificar |
| `marketing_opt_in` | boolean NOT NULL DEFAULT false | FR-041 |
| `marketing_opt_in_changed_at` | timestamptz NULL | |
| `created_at`, `updated_at` | timestamptz NOT NULL | |

Índices: `customers_unverified_idx (created_at) WHERE email_verified_at IS NULL`, para la purga.
Restricción: `CHECK ((postal_code IS NULL) = (city IS NULL))`.

### `customer_consents`

Es un registro de solo inserción.

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `customer_id` | uuid NOT NULL FK → customers ON DELETE CASCADE | |
| `kind` | enum `consent_kind`: `privacy_terms`, `marketing_opt_in`, `marketing_opt_out` | |
| `privacy_version` | text NULL | `legal_pages.version` de `privacidad` al aceptar (solo en `privacy_terms`) |
| `terms_version` | text NULL | `legal_pages.version` de `terminos` (solo en `privacy_terms`) |
| `created_at` | timestamptz NOT NULL | |

### `customer_sessions`

| Columna | Tipo | Reglas |
|---|---|---|
| `token_hash` | text PK | SHA-256 hex del token de la cookie (A2) |
| `customer_id` | uuid NOT NULL FK → customers ON DELETE CASCADE | índice |
| `remember` | boolean NOT NULL | |
| `created_at` | timestamptz NOT NULL | |
| `last_seen_at` | timestamptz NOT NULL | se actualiza como máximo una vez por minuto |
| `expires_at` | timestamptz NOT NULL | con `remember`, `created_at + 30 d`; sin él, `created_at + 12 h` como tope absoluto |

Una sesión es **vigente** si `now < expires_at` y además, cuando `remember = false`,
`now < last_seen_at + 2 h`.

### `account_tokens`

| Columna | Tipo | Reglas |
|---|---|---|
| `token_hash` | text PK | SHA-256 hex |
| `customer_id` | uuid NOT NULL FK → customers ON DELETE CASCADE | |
| `purpose` | enum `token_purpose`: `verify_email`, `reset_password` | |
| `expires_at` | timestamptz NOT NULL | 24 h para `verify_email` y 1 h para `reset_password` |
| `used_at` | timestamptz NULL | |
| `created_at` | timestamptz NOT NULL | |

Índice: `(customer_id, purpose)`. Emitir un token borra antes los del mismo par (A4).

Estado de un token:

```text
vigente --(POST que lo consume)--> usado
vigente --(nuevo token del mismo propósito | cambio de contraseña | borrado de cuenta)--> eliminado
vigente --(now >= expires_at)--> caducado (lo borra la purga)
```

### `species`

Es un dato configurable de la clínica.

| Columna | Tipo | Reglas |
|---|---|---|
| `key` | text PK | `^[a-z][a-z0-9-]{0,31}$` |
| `label` | text NOT NULL | 1–40 caracteres |
| `sort_order` | smallint NOT NULL | |

### `pets`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | uuid PK | |
| `customer_id` | uuid NOT NULL FK → customers ON DELETE CASCADE | índice `(customer_id, name)` |
| `name` | text NOT NULL | 1–40 caracteres, sin espacios en los extremos |
| `species_key` | text NULL FK → species(key) ON DELETE SET NULL ON UPDATE CASCADE | NULL significa "Otra" (A10) |
| `birth_date` | date NOT NULL | entre hoy menos 40 años y hoy (FR-024) |
| `created_at`, `updated_at` | timestamptz NOT NULL | |

Como máximo hay 30 por `customer_id`, comprobado en la transacción del alta con `FOR UPDATE` sobre
el cliente (A9).

### `processed_submissions`

| Columna | Tipo | Reglas |
|---|---|---|
| `submission_id` | uuid PK | viene del token firmado del formulario |
| `scope` | text NOT NULL | `register` o `pet_create` |
| `result_ref` | text NULL | el destino de la redirección que se repite en un reenvío |
| `created_at` | timestamptz NOT NULL | se purga a las 24 h |

## Cambios en tablas existentes

### `email_outbox` (A8)

- `contact_message_id` pasa a admitir nulos.
- Columnas nuevas:
  - `customer_id uuid NULL` FK → customers ON DELETE SET NULL;
  - `payload jsonb NULL`, con `{to, subject, html, text}`, que se pone a NULL al pasar a `sent` o
    `failed`.
- `CHECK (contact_message_id IS NOT NULL OR payload IS NOT NULL OR status IN ('sent','failed','skipped_rate_limit'))`.
- La restricción única `(contact_message_id, kind)` se mantiene (en PostgreSQL los nulos no
  colisionan).
- `outbox_kind` gana `verify_email`, `account_exists`, `password_reset`, `password_changed` y
  `account_deleted`.

### `rate_limit_hits`

No cambia su esquema. Los buckets llevan el prefijo de su política (`login_account:`,
`login_origin:`, `auth_origin:`) antes del HMAC (A6).

### `sections`

No cambia su esquema. En el YAML, `cuenta.href` pasa a `/mi-cuenta`
([contracts/content-file.md](contracts/content-file.md)).

## Relaciones

```text
customers 1─* pets *─0..1 species
customers 1─* customer_consents
customers 1─* customer_sessions
customers 1─* account_tokens
customers 1─* email_outbox (SET NULL al borrar)
```

## Validaciones (resumen)

Los esquemas Zod están en `src/domain/account-schemas.ts`, compartidos por el cliente y el
servidor. Los campos y los mensajes están en [contracts/forms.md](contracts/forms.md).
