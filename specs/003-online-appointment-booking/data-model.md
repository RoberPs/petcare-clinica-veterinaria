# Data Model: Reserva de citas online

Migración nueva `drizzle/0002_appointments.sql`. Contiene `CREATE EXTENSION IF NOT EXISTS
btree_gist`, 4 tablas nuevas, la restricción de exclusión (en SQL, B2) y la ampliación de
`email_outbox`. Se reutilizan sin cambios `clinic`, `opening_hours`, `closures`, `team_members`,
`species`, `customers` y `pets`.

## booking_settings (singleton)

| Columna | Tipo | Regla |
|---|---|---|
| `singleton` | boolean PK, default `true` | check `= true` |
| `slot_step_minutes` | smallint | 5–120; por defecto 30 |
| `min_lead_minutes` | integer | 0–10 080; por defecto 120 |
| `horizon_days` | smallint | 1–365; por defecto 60 |
| `change_cutoff_hours` | smallint | 0–168; por defecto 24 |
| `max_active_per_email` | smallint | 1–20; por defecto 3 (invitados, B9) |
| `max_active_per_customer` | smallint | 1–50; por defecto 9 (clientes, B9) |
| `reminder_hours_before` | smallint | 0–72; por defecto 24; 0 desactiva el recordatorio (B17) |
| `retention_months` | smallint | 1–60; por defecto 12 |
| `updated_at` | timestamptz | |

## booking_services

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `slug` | text unique | `^[a-z0-9-]{1,60}$` |
| `name` | text | 1–80 caracteres |
| `duration_minutes` | smallint | 5–480, múltiplo de 5 |
| `service_id` | uuid FK → `services.id` `SET NULL` | opcional: enlace a la ficha del tratamiento |
| `position` | smallint | orden del selector |
| `published` | boolean | si es `false`, no se ofrece |
| `created_at`, `updated_at` | timestamptz | |

## booking_service_staff

| Columna | Tipo | Regla |
|---|---|---|
| `booking_service_id` | uuid FK → `booking_services.id` `CASCADE` | PK compuesta |
| `team_member_id` | uuid FK → `team_members.id` `CASCADE` | PK compuesta |

Un miembro del equipo es **reservable** si tiene al menos una fila y está `published`. La carga
reemplaza entera la lista de cada servicio.

## appointments

| Columna | Tipo | Regla |
|---|---|---|
| `id` | uuid PK | |
| `submission_id` | uuid **unique** not null | idempotencia (B6) |
| `booking_service_id` | uuid FK `RESTRICT` | |
| `team_member_id` | uuid FK `RESTRICT` | profesional asignado |
| `starts_at`, `ends_at` | timestamptz | check `ends_at > starts_at` |
| `status` | enum `appointment_status` (`confirmed`, `cancelled`) | |
| `cancelled_by` | enum `appointment_actor` (`customer`, `clinic`, `system`) nullable | check: no nulo ⇔ `status = 'cancelled'` |
| `cancelled_at` | timestamptz nullable | igual que `cancelled_by` |
| `booked_as` | enum (`guest`, `customer`) | |
| `customer_id` | uuid FK → `customers.id` `SET NULL` | no nulo al crear si `booked_as = customer` |
| `pet_id` | uuid FK → `pets.id` `SET NULL` | igual |
| `pet_name` | text | 1–40, copia (B11) |
| `pet_species_label` | text | copia; "Otra" si la especie es otra |
| `contact_name` | text nullable | 2–100; `NULL` solo si está anonimizada |
| `contact_email` | text nullable | ≤ 254 |
| `contact_email_normalized` | text nullable | minúsculas y sin espacios |
| `contact_phone` | text nullable | 9–20 caracteres de teléfono |
| `reason` | text nullable | ≤ 500 |
| `privacy_accepted_at` | timestamptz | |
| `privacy_version` | text | versión del texto legal aceptado |
| `manage_version` | integer default 1 | se incrementa con cada cambio o cancelación (B7) |
| `reminder_sent_at` | timestamptz nullable | se marca al encolar el recordatorio; un cambio lo vuelve a `NULL` (B17) |
| `anonymized_at` | timestamptz nullable | check: `contact_*` nulos ⇔ anonimizada |
| `created_at`, `updated_at` | timestamptz | |

**Restricción** `appointments_no_overlap`: `EXCLUDE USING gist (team_member_id WITH =,
tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`.

**Índices**:

- `(team_member_id, starts_at)`, para ver lo que está ocupado en un día.
- `(customer_id, starts_at desc)`, para "Mis citas".
- `(contact_email_normalized) WHERE status = 'confirmed'`, para el límite de citas por correo.
- `(starts_at) WHERE booked_as = 'guest' AND anonymized_at IS NULL`, para la retención.
- `(starts_at) WHERE status = 'confirmed' AND reminder_sent_at IS NULL`, para los recordatorios.

### Transiciones

```text
(nueva) ──reservar──▶ confirmed ──cancelar (customer | clinic | system)──▶ cancelled
                        │  ▲
                        └──┘ cambiar (misma fila: profesional, inicio y fin; manage_version + 1)
"Realizada" = confirmed y ends_at ≤ ahora (deducido, no se guarda)
```

- **Cancelar**:
  - El cliente puede si `starts_at − ahora ≥ change_cutoff_hours`.
  - La clínica, por el enlace, mientras `starts_at > ahora`.
  - `system`, al eliminar la cuenta.
- **Cambiar**: mismas condiciones. El servicio no cambia y la franja nueva pasa por el cálculo de
  disponibilidad y la restricción de exclusión. `reminder_sent_at` vuelve a `NULL`.
- No se puede actuar sobre una cita `cancelled` o ya pasada.

## Cambios en tablas existentes

| Tabla | Cambio |
|---|---|
| `email_outbox` | `outbox_kind` + `appointment_confirmed`, `appointment_changed`, `appointment_cancelled`, `appointment_reminder`, `clinic_appointment`; columna `appointment_id` uuid FK `SET NULL` |
| `pets` | sin cambios de esquema; al borrar una mascota, antes se cancelan sus citas futuras (B12) |
| `customers` | sin cambios de esquema; al borrar una cuenta, antes se cancelan y anonimizan sus citas (B12) |

## Tipos de dominio (`src/domain/`)

- `BookingRules`: los campos de `booking_settings`.
- `BookableService { id, slug, name, durationMinutes, staffIds }`.
- `BookableStaff { id, name, position }`.
- `BusyInterval { teamMemberId, startsAt, endsAt }` (instantes).
- `Slot { time: 'HH:MM', startsAt, endsAt, freeStaffIds: string[] }`.
- `availableSlots(input) → Slot[]` y `nextAvailableDate(input) → string | null` (B3).
- `assignStaff(freeStaffIds, dayLoad, staffOrder) → string` (B4).
- `appointmentView(row, now) → { state: 'confirmed' | 'cancelled' | 'done', canChange: boolean }`.

## Validación (Zod, `src/domain/booking-schemas.ts`)

| Campo | Regla |
|---|---|
| `servicio` | slug de un `booking_service` publicado |
| `profesional` | `sin-preferencia` o slug de un profesional que atiende el servicio |
| `fecha` | `AAAA-MM-DD` entre hoy y hoy + `horizon_days` (zona de la clínica) |
| `hora` | `HH:MM` presente en `availableSlots` para la fecha, el servicio y el profesional |
| `mascota` (cliente) | uuid de una mascota de la cuenta, o `otra` |
| `nombre_mascota` | 1–40 tras recortar |
| `especie` | `key` de `species` u `other` |
| `fecha_nacimiento` (mascota nueva) | reglas de FR-024 de la 002 |
| `nombre` | 2–100 |
| `telefono` | 9–20 caracteres de `[0-9 +()-]` y al menos 9 dígitos |
| `correo` | correo válido ≤ 254 |
| `motivo` | opcional, ≤ 500 |
| `privacidad` | debe valer `on` |
