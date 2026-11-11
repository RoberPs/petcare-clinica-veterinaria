# Data Model: Web pública de la clínica veterinaria

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Esquema en PostgreSQL 16 gestionado con Drizzle (R2). Hay una base de datos por clínica, y las
tablas de contenido se rellenan con la carga del archivo de contenido (R3). Ningún campo de
contenido tiene un valor por defecto que sea un dato de una clínica concreta.

Convenciones:

- `id` es `uuid` (v4) generado en la base de datos.
- `slug` es la clave estable del archivo de contenido, única por tabla y en formato `kebab-case`.
- `position` es un entero que da el orden configurado; a igualdad de `position`, se ordena por
  `slug`.
- `published` es un booleano por defecto `true`. La carga marca `false` lo que desaparece del
  archivo.
- `created_at` y `updated_at` son `timestamptz`. Todo se guarda en UTC y se presenta en
  `Europe/Madrid`.

---

## Contenido (cargado desde `content/<clinica>.yaml`)

### `clinic` (una sola fila)

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. Hay una restricción `CHECK` de una sola fila (`singleton boolean UNIQUE DEFAULT true CHECK (singleton)`). |
| `name` | text | Obligatorio, de 1 a 80 caracteres. Se usa en la cabecera, el pie, los metadatos, la franja de demo y los correos. |
| `logo_path` | text? | Ruta en `public/media/...`. Si es nula, se muestra el nombre como texto. |
| `hero_title`, `hero_text` | text | Obligatorios, de 120 y 300 caracteres como máximo. |
| `hero_image_path`, `hero_image_alt` | text? | Si hay imagen, `alt` es obligatorio. |
| `about_title`, `about_text`, `about_image_path`, `about_image_alt` | text? | Cabecera de La clínica. |
| `address_line`, `postal_code`, `city`, `province` | text | Obligatorios. |
| `latitude`, `longitude` | numeric(9,6)? | Si faltan, no se ofrece el mapa (caso límite de datos incompletos). |
| `phone` | text | Obligatorio, en formato E.164 para el enlace `tel:` y en formato de visualización. |
| `public_email` | text? | Correo que se muestra. |
| `inbox_email` | text | Obligatorio y **no se publica**: es el buzón que recibe los mensajes (FR-025b). |
| `response_time_text` | text | Por ejemplo, "en un plazo de 24 horas laborables". Se usa en la confirmación y en el acuse. |
| `legal_owner_name` | text | Responsable del tratamiento (FR-040a). En la demo es el responsable real. |
| `legal_owner_tax_id`, `legal_owner_address` | text? | Nulos en la demo: no se inventan (FR-040a). |
| `legal_contact_email` | text | Obligatorio. Correo para ejercer los derechos. |
| `demo_banner_enabled` | boolean | Activado en la demo (FR-007a). |

### `opening_hours`

| Campo | Tipo | Reglas |
|---|---|---|
| `weekday` | smallint | ISO, de 1 (lunes) a 7 (domingo). |
| `opens_at`, `closes_at` | time | `opens_at < closes_at`. |

Puede haber varios tramos por día y no pueden solaparse (se valida en la carga). Un día sin filas
significa que la clínica está cerrada ese día.

### `closures` (cierres excepcionales)

| Campo | Tipo | Reglas |
|---|---|---|
| `slug` | text | Único. |
| `starts_on`, `ends_on` | date | Ambos incluidos y `starts_on <= ends_on`. |
| `reason` | text | Obligatorio, por ejemplo "Festivo local". |

Un cierre prevalece sobre `opening_hours` (FR-019). Se muestra si está vigente o empieza en los
próximos 30 días.

### `services`

`slug`, `name` (de 1 a 80 caracteres), `description` (de 1 a 600, en texto), `position` y
`published`. FR-013 y FR-014.

### `team_members`

`slug`, `name`, `specialty` (de 1 a 120 caracteres), `photo_path?`, `photo_alt?` (obligatorio si
hay foto; si no hay, se usa "Foto de <name>"), `position` y `published`. FR-017.

### `faq_topics` y `faqs`

- `faq_topics`: `slug` (por ejemplo `citas`, `tienda` o `tu-mascota`), `name` y `position`.
- `faqs`: `slug`, `topic_id` (FK a `faq_topics`), `question` (de 1 a 200 caracteres), `answer_md`
  (Markdown restringido, R11), `position` y `published`.

Un tema sin `faqs` publicadas no se renderiza (FR-032).

### `activity_stats` (cifras de actividad)

`slug`, `value_text` (por ejemplo "+4.500"), `label` (por ejemplo "pacientes al año"),
`description?`, `position` y `published`. Pueden ser ficticias en la demo (FR-011).

### `health_notices` (avisos de salud)

`slug`, `text`, `source_label` y `source_url`, estos dos últimos **obligatorios** (`NOT NULL` y
URL `https`), además de `published`. Sin fuente no se pueden cargar, así que nunca se publican sin
ella (FR-011).

### `contact_reasons`

`slug`, `label` y `position`. Por defecto son Información general, Consulta sobre una cita, Pedido
de la tienda y Otro (FR-022).

### `legal_pages`

| Campo | Tipo | Reglas |
|---|---|---|
| `kind` | enum `aviso-legal \| privacidad \| cookies \| terminos` | Único. |
| `title` | text | |
| `body_md` | text | Markdown restringido (R11). |
| `version` | text | Por ejemplo `2026-11-10`. Se guarda junto a cada aceptación (FR-029). |
| `updated_on` | date | Se muestra en la página (FR-039). |

### `sections` (destinos de secciones futuras)

`key` (enum `reservas | tienda | carrito | consejos | cuenta`), `label` y `href?`, que es nulo
mientras la sección no exista y entonces lleva a `/proximamente/<key>` (FR-006 y R12).

---

## Operación (escritas por la web)

### `contact_messages`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. |
| `submission_id` | uuid | **UNIQUE**. Viene del formulario y sirve para la idempotencia (FR-026). |
| `name` | text | De 1 a 100 caracteres, recortado. |
| `phone` | text? | Hasta 20 caracteres: dígitos, espacios, `+`, `(` y `)`. |
| `email` | text | Hasta 254 caracteres, con formato válido, normalizado en minúsculas en el dominio. |
| `reason_id` | uuid | FK a `contact_reasons`. Se guarda también el texto (`reason_label`) por si el motivo cambia después. |
| `message` | text | De 10 a 2.000 caracteres. Se trata siempre como texto. |
| `privacy_accepted_at` | timestamptz | Obligatorio (FR-029). |
| `privacy_version` | text | El `legal_pages.version` de `privacidad` en el momento del envío. |
| `created_at` | timestamptz | |
| `purge_after` | timestamptz | `created_at + 12 meses` (FR-030). Lleva índice. |

No se guardan ni la IP ni el agente de usuario con el mensaje, por minimización. La IP solo se
usa, transformada con HMAC y durante 24 h, en `rate_limit_hits`.

### `email_outbox`

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | uuid | PK. |
| `contact_message_id` | uuid | FK a `contact_messages`, con `ON DELETE CASCADE`. |
| `kind` | enum `clinic_notification \| visitor_ack` | Hay `UNIQUE (contact_message_id, kind)`, de modo que nunca se crean dos correos iguales. |
| `recipient_hash` | text | SHA-256 de la dirección normalizada. Sirve para limitar los acuses a uno por hora sin buscar en claro. |
| `status` | enum (ver abajo) | |
| `attempts` | smallint | Empieza en 0 y llega como mucho a 8. |
| `next_attempt_at` | timestamptz | Lleva índice parcial `WHERE status = 'pending'`. |
| `last_error_code` | text? | Código o estado HTTP. Nunca contiene datos personales. |
| `provider_message_id` | text? | Identificador que devuelve Brevo. |
| `sent_at` | timestamptz? | |

**Estados**:

```text
pending ──envío OK──▶ sent
   │ fallo (attempts < 8) ──▶ pending (next_attempt_at = backoff)
   └ fallo (attempts = 8) ──▶ failed   (log de error, FR-027)
skipped_rate_limit           (solo visitor_ack: ya hubo un acuse a ese hash en la última hora)
```

El contenido del correo no se guarda: se compone en el momento del envío a partir de
`contact_messages` y `clinic`. Así, si el mensaje se purga, la bandeja de salida no conserva copia
de datos personales.

### `rate_limit_hits`

`bucket` (text): es `HMAC-SHA256(FORM_SECRET, "contact:" + clave)`, donde la clave es la IPv4
completa o el prefijo IPv6 /64. **Nunca se guarda la IP en claro.** Además, `hit_at`
(timestamptz) y un índice por `(bucket, hit_at)`. La regla es: si en 10 minutos hay 5 o más filas
del mismo `bucket`, se rechaza el envío. La purga diaria borra lo que tenga más de 24 h.

---

## Fuera de la base de datos

- **Preferencia de cookies**: la cookie propia `pc_consent`, con valor JSON firmado con este
  formato: `{ v: CONSENT_VERSION, third_party: boolean, at: ISO-8601 }`. Dura 12 meses (R8 y
  FR-037).
- **Token del formulario**: `submission_id` más el sello temporal, firmados con HMAC con
  `FORM_SECRET` (R6). No se persiste hasta el envío.

## Correspondencia entre la spec y el modelo

| Entidad de la spec | Tabla |
|---|---|
| Clínica | `clinic` |
| Horario semanal | `opening_hours` |
| Cierre excepcional | `closures` |
| Servicio | `services` |
| Profesional | `team_members` |
| Tema de preguntas frecuentes y Pregunta frecuente | `faq_topics` y `faqs` |
| Cifra destacada | `activity_stats` |
| Aviso de salud | `health_notices` |
| Motivo de contacto | `contact_reasons` |
| Mensaje de contacto | `contact_messages` y `email_outbox` |
| Página legal | `legal_pages` |
| Preferencia de cookies | cookie `pc_consent` |
| Sección próximamente | `sections` |
