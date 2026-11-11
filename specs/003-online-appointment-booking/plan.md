# Implementation Plan: Reserva de citas online

**Branch**: `003-online-appointment-booking` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-online-appointment-booking/spec.md`

## Summary

Reserva de citas con o sin cuenta, en tres pasos (servicio y profesional, fecha y hora, mascota y
datos), con disponibilidad real. Incluye "Mis citas", cancelación y cambio por el cliente hasta 24
h antes, y un enlace de gestión para la clínica en su correo.

Enfoque técnico (detalle en [research.md](research.md), decisiones B1–B17):

- **Configuración como datos**: servicios reservables, duración, profesionales por servicio y
  reglas en un bloque `booking:` del YAML (B1).
- **Disponibilidad**: función pura en `src/domain/availability.ts` sobre el horario y los cierres
  de la 001 (B3). La misma función se usa al mostrar y al confirmar.
- **Sin dobles reservas**: restricción `EXCLUDE` con `btree_gist` más un bloqueo de transacción por
  día, que también hace correcta la asignación de "Sin preferencia" (B2, B4).
- **Sin JavaScript**: los pasos 1 y 2 son GET con el estado en la query; el paso 3 es una Server
  Action con PRG e idempotencia por `submission_id` (B5, B6).
- **Gestión por la clínica**: enlace HMAC sin estado con `manage_version`, de modo que solo vale el
  del último correo (B7).
- **Recordatorio por correo** 24 h antes (principio VIII): lo encola cada pasada de
  `email:dispatch`, sin temporizador nuevo (B17).

## Technical Context

**Language/Version**: TypeScript 6 `strict` sobre Node.js 22 LTS (sin cambios).

**Primary Dependencies**: las de la 001 y la 002. **No se añade ninguna dependencia.**

**Storage**: PostgreSQL 16 y Drizzle. La migración `drizzle/0002_appointments.sql` añade la
extensión `btree_gist` (es *trusted*), las tablas `booking_settings`, `booking_services`,
`booking_service_staff` y `appointments`, y amplía `email_outbox` (ver [data-model.md](data-model.md)).

**Testing**: Vitest (unitarias e integración contra PostgreSQL real) y Playwright con axe en
`mobile-360`, `desktop` y `no-js`, con el reloj fijado por `x-test-now`.

**Target Platform**: el mismo VPS (Docker Compose, Caddy y Cloudflare). La imagen oficial de
`postgres:16` ya incluye `btree_gist`.

**Project Type**: aplicación web full-stack (un solo proyecto Next.js).

**Performance Goals**:

- El paso 2 se pinta con 2 consultas: configuración en caché por petición y citas activas del día.
  Debe tardar menos de 300 ms en el servidor.
- La confirmación debe tardar menos de 500 ms con el bloqueo por día.

**Constraints**:

- Funciona sin JavaScript.
- No hay datos personales en la URL ni en los logs.
- Las páginas privadas y la gestión van con `no-store` y `noindex`.
- No hay datos de la clínica en `src/`.
- Todo se calcula en la zona `Europe/Madrid`.

**Scale/Scope**:

- 8 rutas nuevas y 3 ampliadas.
- 5 correos nuevos (incluido el recordatorio).
- Decenas de citas al día y 3–10 profesionales por clínica.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | Se usan `.steps`, `.panel`, `.cart-layout`, `.summary`, `.summary__row`, `.slots`, `.slot`, `.slot.is-selected`, `.slot:disabled`, `.field`, `.field-row`, `.check`, `table.orders`, `.badge` y `.empty-state`, que ya existen. Se añaden solo con tokens: la variante de `.slot` para `input[type=radio]` con su `:focus-visible`, `.badge--muted` (cancelada y realizada) y el bloque "Tu próxima cita". Se quitan los `style=""` de la maqueta. Los CTA son cian para pedir y confirmar la cita y marino para cancelar o volver. | ✅ |
| **II. Marca propia** | Los nombres de veterinarios, mascotas y horas de `design/cita.html` no se publican. Los servicios y los profesionales salen del YAML. | ✅ |
| **III. Tests de flujos críticos** | **Aplica**: la reserva de cita es un flujo crítico. Hay tests de concurrencia, de autorización, de plazos y de extremo a extremo con axe y sin JavaScript (B16), y bloquean el merge. | ✅ |
| **IV. Privacidad y seguridad** | Cada campo tiene su finalidad (FR-009) y el motivo lleva un aviso. La privacidad no viene premarcada. El paso de datos personales es POST. Hay autorización por `customer_id` (A9) y CSRF por Origin. Límites por origen y por correo (B9). El enlace de gestión es HMAC, de una sola cita, con versión, no-referrer y registro de usos (B7, con el riesgo aceptado en la spec). Las citas se exportan, se anonimizan al borrar la cuenta y a los 12 meses las de invitado (B12). | ✅ |
| **V. WCAG 2.2 AA** | Las horas son un `fieldset` de radios con `legend`, no botones sin estado. Los errores van junto al campo y hay un resumen enfocable. El resumen de la cita es un `aside` con encabezado. Los pasos se marcan con `aria-current="step"`. Hay `autocomplete` en los datos y axe en todas las rutas nuevas. | ✅ |
| **VI. Rendimiento** | Son páginas de servidor sin JavaScript obligatorio y no tocan la portada. | ✅ |
| **VII. Pagos de prueba** | El pago de la cita está fuera de alcance. | N/A |
| **VIII. Producto real y adaptable** | La disponibilidad es real (horario, cierres, duración y sin solapes), con todos los estados de error y vacíos, correos reales y retención. Toda la configuración es un dato. **Excepción heredada**: no hay panel; la agenda de la clínica se limita al correo con el enlace de gestión (ver Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec referencia `design/cita.html` y `cuenta.html`. La CI actual cubre las pruebas nuevas, y la migración se prueba en la base de datos de pruebas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción heredada.

**Re-check tras la Fase 1**: PASA.
- `appointments` y `booking_*` son el modelo que leerá la agenda del panel futuro, sin cambiar el
  esquema.
- El enlace de gestión usa las mismas funciones de cancelar y cambiar que el panel reutilizará.

## Project Structure

### Documentation (this feature)

```text
specs/003-online-appointment-booking/
├── plan.md
├── research.md          # B1–B17
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── routes.md        # rutas, acceso, avisos y enlaces que cambian
│   ├── forms.md         # pasos, campos, orden en servidor y resultados
│   ├── emails.md        # 5 correos de cita
│   ├── content-file.md  # bloque booking: del YAML
│   └── export-format.md # citas en la descarga de datos
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── pide-cita/                    # page (pasos 1–3 + resumen), actions.ts, confirmada/
│   ├── gestion-cita/[token]/         # page, actions.ts, cambiar/
│   └── mi-cuenta/
│       ├── citas/                    # page, [id]/cancelar/, [id]/cambiar/, actions.ts
│       ├── page.tsx                  # + "Tu próxima cita"
│       ├── layout.tsx                # appointmentsHref → /mi-cuenta/citas
│       ├── mascotas/[id]/eliminar/   # + aviso y cancelación de citas
│       └── eliminar-cuenta/          # + aviso
├── domain/
│   ├── availability.ts               # availableSlots, nextAvailableDate
│   ├── assign-staff.ts               # B4
│   ├── appointment-view.ts           # estado deducido y canChange (plazo)
│   ├── booking-schemas.ts            # Zod de los pasos y acciones
│   ├── rate-limit.ts                 # + booking_origin
│   └── account-export.ts             # + citas
├── lib/
│   ├── booking/
│   │   ├── book.ts                   # confirmAppointment (transacción B2)
│   │   ├── cancel.ts, reschedule.ts  # cliente, clínica y sistema
│   │   ├── manage-link.ts            # firma y verificación B7
│   │   ├── reminders.ts              # enqueueDueReminders (B17)
│   │   └── confirmation-ref.ts       # ref firmado B6
│   ├── account/pets.ts, delete-account.ts   # + cancelación y anonimización
│   └── notice.ts                     # + avisos de cita
├── db/
│   ├── schema.ts                     # + tablas y enums
│   ├── queries/{booking-config,appointments}.ts
│   └── retention.ts                  # + anonimización de invitados
├── email/
│   ├── outbox.ts                     # enqueueEmail generalizado (antes account-outbox)
│   └── templates/                    # appointment-confirmed, -changed, -cancelled, -reminder, clinic-appointment
├── content/schema.ts, load.ts        # + booking
└── components/
    ├── BookingSteps.tsx, BookingSummary.tsx, ServiceStep.tsx, SlotPicker.tsx, DetailsStep.tsx
    ├── AppointmentList.tsx, AppointmentStatus.tsx, NextAppointment.tsx
    └── AccountNav.tsx                # recibe /mi-cuenta/citas

drizzle/0002_appointments.sql         # + SQL a mano: extensión y EXCLUDE
design/styles.css                     # + .slot radio, .badge--muted (solo tokens)
content/petcare.yaml                  # + booking:, reservas.href

tests/
├── unit/        # availability, assign-staff, appointment-view, booking-schemas, manage-link, confirmation-ref, appointment-emails
├── integration/ # booking-concurrency, booking-flow, booking-limits, appointments-authz, cancel-reschedule, manage-link, delete-cascade, reminders, retention-appointments, content-booking
└── e2e/         # us1-guest-booking … us5-clinic-manage, booking-a11y, booking-no-js
```

**Structure Decision**:
- Se mantiene el proyecto único.
- La lógica con efectos va en `src/lib/booking/*` y devuelve resultados discriminados, como
  `contact-submission.ts`.
- Las reglas de disponibilidad, asignación y plazo son puras en `src/domain/`.
- `account-outbox.ts` se generaliza a `outbox.ts` sin cambiar el comportamiento de los correos de
  cuenta.
- `tests/integration/helpers/db.ts` (`truncateAll`) se amplía con las tablas nuevas.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Principio VIII (heredada de la 001)**: no hay panel de administración. La clínica no tiene vista de agenda; gestiona cada cita con el enlace de su correo, y los servicios, profesionales y reglas se cambian en el YAML. | El panel es una feature posterior ya decidida, y Q1 eligió el enlace firmado. | Una agenda de personal exige roles de administrador y su autorización, lo que adelanta el panel. **Mitigación**: el modelo y las funciones de cancelar y cambiar son los que usará el panel. El correo de la clínica funciona como agenda cronológica. **Caducidad**: se cierra con la feature del panel. |
| **Extensión `btree_gist`** (primera extensión de PostgreSQL del proyecto). | Garantiza en la base de datos que no haya solapes (SC-002, principio VIII). | Un solo bloqueo de aplicación no protege de un fallo de lógica o de un acceso fuera de la aplicación. La extensión es *trusted* y viene con la imagen oficial. |
