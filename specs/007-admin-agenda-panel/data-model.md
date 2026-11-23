# Data Model: Panel de administración de la agenda (feature 007)

Migración **`0006_admin_agenda`**. Se genera con `npm run db:generate` y las exclusiones GiST se
escriben a mano en el SQL, como en la `0002`. La extensión `btree_gist` ya existe.

## Cambios en tablas existentes

### `customers`

| Columna | Tipo | Notas |
|---|---|---|
| `is_admin` | `boolean NOT NULL DEFAULT false` | Solo lo escribe `npm run admin` (F1). Se lee en cada petición vía `lookupSession`. |

### `team_members`

| Columna | Tipo | Notas |
|---|---|---|
| `bookable` | `boolean NOT NULL DEFAULT false` | Backfill: `true` si está en `booking_service_staff` (F5). |
| `booking_position` | `integer NOT NULL DEFAULT 0` | Orden en el selector de la reserva y en la agenda. Backfill: `position`. |

Un miembro creado desde el panel nace con `published = false`, `photo_path` nulo y un `slug`
generado a partir del nombre, único y fijo. Si la columna `photo_path` es `NOT NULL`, la migración
la hace nula; el test de la página del equipo lo cubre.

### `booking_services`

- Índice único nuevo `booking_services_name_lower_uq` sobre `lower(name)`, para que el nombre sea
  único sin distinguir mayúsculas (FR-012). La migración falla si hay duplicados; los datos de la
  demo no los tienen.
- Las validaciones ya existentes se mantienen: duración de 5 a 480 minutos y múltiplo de 5.
- `published` es "activo".

### `appointments`

Sin columnas nuevas. "Fuera de horario" y "Servicio inactivo" se calculan (F9). Se añade el índice
`appointments_starts_at_idx (starts_at)` si no existe.

## Tablas nuevas

### `staff_hours` (F6)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid PK` | |
| `team_member_id` | `uuid NOT NULL → team_members(id) ON DELETE CASCADE` | |
| `weekday` | `smallint NOT NULL CHECK (1..7)` | 1 = lunes |
| `opens_at` | `time NOT NULL` | Hora local de `Europe/Madrid` |
| `closes_at` | `time NOT NULL CHECK (closes_at > opens_at)` | |

- `EXCLUDE USING gist (team_member_id WITH =, weekday WITH =, tsrange('2000-01-01'::date + opens_at,
  '2000-01-01'::date + closes_at, '[)') WITH &&)`.
- La validación (`src/domain/staff-schedule.ts`) admite como máximo 3 tramos por día, en múltiplos
  de 5 minutos.
- Backfill: una copia de `opening_hours` por cada veterinario con `bookable = true`.

### `schedule_blocks` (F8)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid PK` | Se genera a partir del `submission_id` firmado, para que crear un bloqueo sea idempotente. |
| `team_member_id` | `uuid NULL → team_members(id) ON DELETE CASCADE` | `NULL` = toda la clínica |
| `kind` | enum `schedule_block_kind` (`once`, `weekly`) | |
| `starts_at`, `ends_at` | `timestamptz NULL` | Solo `once`; `ends_at > starts_at` |
| `from_date`, `until_date` | `date NULL` | Solo `weekly`; `until_date >= from_date`, ≤ 366 días |
| `weekdays` | `smallint[] NULL` | Solo `weekly`; no vacío y con valores de 1 a 7 |
| `start_time`, `end_time` | `time NULL` | Solo `weekly`; `end_time > start_time` |
| `reason` | `text NOT NULL CHECK (char_length 1..120)` | Interno |
| `created_by` | `uuid NULL → customers(id) ON DELETE SET NULL` | |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

- Un `CHECK` por tipo exige las columnas de ese tipo y deja nulas las del otro.
- Índices: `(team_member_id)`; `(kind, ends_at)` para los `once`; `(kind, until_date)` para los
  `weekly`.
- Consulta del día D: los `once` con `starts_at < fin(D)` y `ends_at > inicio(D)`, más los `weekly`
  con `from_date ≤ D ≤ until_date` y `isodow(D) = ANY(weekdays)`. Lo expande
  `src/domain/blocks.ts`.

### `appointment_events` (F12)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid PK` | |
| `appointment_id` | `uuid NOT NULL → appointments(id) ON DELETE CASCADE` | |
| `at` | `timestamptz NOT NULL DEFAULT now()` | |
| `kind` | enum `appointment_event_kind` (`created`, `rescheduled`, `cancelled`) | |
| `actor` | enum `appointment_event_actor` (`customer`, `guest_link`, `clinic_link`, `admin`, `system`) | |
| `admin_id` | `uuid NULL → customers(id) ON DELETE SET NULL` | Solo si `actor = 'admin'` |
| `from_starts_at`, `to_starts_at` | `timestamptz NULL` | `rescheduled` |
| `from_staff_id`, `to_staff_id` | `uuid NULL → team_members(id)` | `rescheduled` |
| `note` | `text NULL CHECK (char_length ≤ 300)` | Nota al cliente al cancelar (FR-020); la anonimización la borra |

- Índice: `(appointment_id, at)`.
- Backfill: un `created` (con `at = created_at`, `actor` deducido de `booked_as`) por cada cita y
  un `cancelled` (con `at = cancelled_at`) por cada cita cancelada, con el actor que sale de
  `cancelled_by`: `clinic` pasa a `clinic_link`.

### `admin_audit_log` (F13)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `uuid PK` | |
| `at` | `timestamptz NOT NULL DEFAULT now()` | |
| `actor_id` | `uuid NULL → customers(id) ON DELETE SET NULL` | Administrador del panel |
| `actor_label` | `text NULL` | `--by` de la CLI |
| `action` | `text NOT NULL` | `service.create`, `service.update`, `staff.create`, `staff.update`, `staff.hours`, `block.create`, `block.update`, `block.delete`, `role.grant`, `role.revoke` (validado con Zod) |
| `entity_type`, `entity_id` | `text NOT NULL`, `uuid NOT NULL` | |
| `changes` | `jsonb NOT NULL DEFAULT '{}'` | Solo campos de configuración (antes y después) |

- Un `CHECK` exige que `actor_id` o `actor_label` no sean nulos.

## Enum ampliado

- `outbox_kind`: no cambia. Se reutilizan `appointment_cancelled` y `appointment_changed`, ahora con
  la nota opcional en el payload (ver [contracts/emails.md](contracts/emails.md)).

## Transiciones

```text
Cita (feature 003, sin cambios de estado):
  confirmed ──cancelar (cliente | enlace clínica | admin | sistema)──▶ cancelled
  confirmed ──mover (cliente | enlace clínica | admin)──▶ confirmed  (manage_version + 1)
  Cada transición añade un appointment_events.

Bloqueo con citas afectadas (F10):
  revisar (GET) ─▶ hay afectadas? ─no─▶ guardar
                                 └sí─▶ decision=keep       ─▶ guardar; las citas quedan "Fuera de horario"
                                       decision=cancel_all ─▶ cancelar cada una (admin) + correo; guardar
  Si las afectadas cambian entre revisar y guardar: no se guarda y se vuelve a revisar.

Servicio: activo ⇄ inactivo (no se borra). Veterinario: reservable ⇄ no reservable (no se borra).
```

## Reglas derivadas

- **Ventanas del veterinario V el día D**: (`opening_hours(D)` ∩ `staff_hours(V, D)`) − `closures`
  − bloqueos de V y de la clínica en D (F7).
- **Veterinario ofrecido** para el servicio S: `bookable` y en `booking_service_staff(S)`, con
  ventanas no vacías en el periodo consultado.
- **Fuera de horario**: cita `confirmed`, futura, que no está contenida en una ventana de su
  veterinario (F9).
- **Afectadas** por un bloqueo o un horario: las citas `confirmed` futuras que pasarían a estar
  fuera de horario con el cambio (`countAffected`).

## Retención y exportación

- La anonimización de citas (B*) pone `appointment_events.note` a `NULL`.
- Al eliminar una cuenta, sus eventos siguen el destino de cada cita: se anonimiza y se borra la
  nota.
- La exportación de la cuenta añade `clinic_note` (la última nota de cancelación) a cada cita y sube
  a `version: 4` (F17).
