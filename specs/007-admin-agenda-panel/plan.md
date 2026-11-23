# Implementation Plan: Panel de administración de la agenda

**Branch**: `007-admin-agenda-panel` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/007-admin-agenda-panel/spec.md`

## Summary

Primer módulo del panel de administración (`/admin`), al que solo entran las cuentas con
`is_admin`. Incluye:

- la agenda del día y de la semana por veterinario;
- la gestión de servicios reservables, de veterinarios reservables y de su horario semanal;
- bloqueos puntuales o semanales, de un veterinario o de toda la clínica;
- cancelar y mover citas, con correo al cliente.

Para que las franjas de la reserva pública reflejen los cambios en el acto, la disponibilidad pasa
a ser (horario de la clínica ∩ horario del veterinario) − cierres − bloqueos − citas.
`content:load` deja de sobrescribir los datos de agenda que gestiona el panel. Las decisiones
están en [research.md](research.md) (F1–F18) y el modelo en [data-model.md](data-model.md)
(migración `0006_admin_agenda`).

## Technical Context

**Language/Version**: TypeScript strict sobre Node.js 22 LTS.

**Primary Dependencies**: Next.js 15 (App Router, RSC, Server Actions), React 19, Drizzle ORM y
`pg`, Zod, pino y `@js-temporal/polyfill`. **Sin dependencias nuevas.**

**Storage**: PostgreSQL 16, con la migración `0006_admin_agenda`:
- columnas nuevas: `customers.is_admin`, `team_members.bookable` y `booking_position`;
- 4 tablas nuevas: `staff_hours`, `schedule_blocks`, `appointment_events` y `admin_audit_log`;
- índice único `lower(name)` en `booking_services`;
- backfill de `bookable`, de horarios copiados de `opening_hours` y de los eventos `created` y
  `cancelled`.

**Testing**: Vitest (unitarias e integración contra PostgreSQL) y Playwright con
`@axe-core/playwright` (también con el perfil sin JavaScript).

**Target Platform**: Docker Compose en el VPS compartido. Una CLI nueva, `cli/admin.mjs`, y ningún
temporizador nuevo.

**Project Type**: Aplicación web monolítica (Next.js).

**Performance Goals**:
- la agenda semanal se resuelve con una consulta por rango indexada, más una consulta de bloqueos
  y otra de tramos;
- la reserva pública añade como mucho una consulta por día consultado (bloqueos).

**Constraints**:
- rol comprobado en el servidor en cada petición;
- 404 para quien no es administrador;
- sin JavaScript obligatorio;
- WCAG 2.2 AA;
- solo tokens y componentes de `design/`;
- ningún dato de la clínica en `src/`;
- `Europe/Madrid`;
- sin datos personales en logs ni en URLs.

**Scale/Scope**:
- una clínica con 2–10 veterinarios y unas decenas de citas al día;
- unas 14 páginas nuevas, 7 Server Actions, 1 CLI;
- 2 plantillas de correo ampliadas;
- cambios en `availability`, `book`, `reschedule`, `cancel` y `content/load`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | No hay maqueta en `design/`, así que se compone con `.account-grid`, `.side-nav`, `.tabs`, `table.orders--stack`, `.badge*`, `.notice`, `.btn`. Los componentes nuevos (`.admin-toolbar`, `.agenda-day`, `.agenda-week`, `.agenda-slot*`, `.schedule-grid`) solo usan tokens (F15). Guardar va en marino, cancelar y borrar con `.btn--ghost` (ya existe) y el éxito en menta. | ✅ |
| **II. Marca propia** | No se publica nada nuevo; los nombres de servicios y veterinarios son datos. | ✅ |
| **III. Tests de flujos críticos** | Cambia la disponibilidad de la **reserva de cita** y la guardia se apoya en el **inicio de sesión**: se pasan sus tests y se añaden los del panel (F18). | ✅ |
| **IV. Privacidad y seguridad** | Rol comprobado en cada petición y en cada acción; 404 para quien no es admin; CSRF con Origin y token firmado; `noindex` y `no-store`; contacto solo en el detalle; nota sin datos de salud, borrada al anonimizar y exportada (v4); log de auditoría sin datos de clientes; correos fuera de los logs. | ✅ |
| **V. WCAG 2.2 AA** | Agenda con encabezados por veterinario y día, `<time>`, estados en texto (no solo color), rejilla de horario con `<fieldset>` y `<legend>` por día, errores junto al campo y axe en todas las rutas de `/admin`. | ✅ |
| **VI. Rendimiento** | Páginas privadas y dinámicas, sin JavaScript propio nuevo. No toca la portada ni el catálogo. | ✅ |
| **VII. Pagos de prueba** | No aplica. | ✅ |
| **VIII. Producto real y adaptable** | Cierra la excepción para servicios, veterinarios, horarios por veterinario, bloqueos y agenda. **Sigue la excepción** para el horario general y los cierres de la clínica, las reglas de reserva, la ficha pública del equipo y el resto de contenidos (ver Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec declara que no hay página en `design/` y enumera los componentes. CI con lint, tests y Gitleaks. Migración probada en la base de datos de pruebas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción parcial justificada.

**Re-check tras la Fase 1**: PASA. Las comprobaciones de diseño que lo confirman son:
- una sola función pura (`availableSlots`) calcula las franjas del cliente y del panel, y
  `isOutsideSchedule` usa las mismas ventanas;
- cancelar y mover reutilizan `cancelAppointment` y `rescheduleAppointment` (bloqueos por día y
  exclusión GiST), así que SC-005 se mantiene;
- `ADMIN_ACTIONS` permite probar la guardia de todas las acciones (SC-001);
- la CSP no cambia.

## Project Structure

### Documentation (this feature)

```text
specs/007-admin-agenda-panel/
├── plan.md                 # este archivo
├── research.md             # decisiones F1–F18
├── data-model.md           # 0006_admin_agenda, transiciones y reglas derivadas
├── quickstart.md           # validación manual y pruebas filtradas
├── contracts/
│   ├── routes.md           # páginas, Server Actions y cabeceras
│   ├── emails.md           # cancelación y cambio por la clínica
│   └── cli-and-content.md  # npm run admin y content:load sin sobrescribir
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
drizzle/0006_admin_agenda.sql            # + exclusiones GiST a mano y backfills
src/db/schema.ts                         # columnas y tablas nuevas
src/db/queries/
├── booking-config.ts                    # + staffHours y bookable
├── schedule-blocks.ts                   # nuevo: bloqueos por día y por rango
└── admin-agenda.ts                      # nuevo: citas por rango, detalle y eventos
src/domain/
├── availability.ts                      # intersección con el horario del veterinario y bloqueos
├── blocks.ts                            # nuevo: expansión de bloqueos
├── staff-schedule.ts                    # nuevo: validación de la rejilla semanal
├── outside-schedule.ts                  # nuevo: isOutsideSchedule y countAffected
└── admin-schemas.ts                     # nuevo: Zod del panel
src/lib/auth/require-admin.ts            # nuevo
src/lib/admin/
├── actions-list.ts                      # ADMIN_ACTIONS
├── services.ts, staff.ts, hours.ts      # nuevos: escritura y auditoría
├── blocks.ts                            # nuevo: guardar con decisión (F10)
├── appointments.ts                      # nuevo: cancelar y mover con AdminRules
├── audit.ts                             # nuevo: admin_audit_log
└── cli.ts                               # nuevo: list, grant y revoke
src/lib/booking/{book,cancel,reschedule,clinic-manage}.ts  # + appointment_events y relectura en el lock
src/email/templates/appointment-{cancelled,changed}.ts     # + variante de la clínica y nota
src/content/load.ts                      # sembrar sin sobrescribir y --force-booking
src/lib/account/export.ts                # v4 con clinic_note
src/middleware.ts                        # cabeceras /admin/*
src/app/admin/                           # layout, agenda, citas, servicios, veterinarios y bloqueos
src/app/mi-cuenta/page.tsx               # enlace al panel
src/components/admin/                    # AgendaDay, AgendaWeek, ScheduleGrid, BlockForm, AdminNav…
design/styles.css                        # componentes nuevos solo con tokens
scripts/admin.ts, scripts/build-cli.mjs  # CLI y su empaquetado
tests/unit/, tests/integration/, tests/e2e/   # ver F18
tests/account-fixtures.ts, tests/e2e/fixtures.ts  # createCustomer({ admin }) y loginAs admin
deploy/README.md                         # npm run admin y la nueva regla de content:load
```

**Structure Decision**: es el monolito Next.js de siempre. La lógica con efectos del panel vive en
`src/lib/admin/`, la pura en `src/domain/` y las páginas en `src/app/admin/`. La reserva
(`src/lib/booking/`) sigue siendo la única que escribe citas.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principio VIII (parcial): el horario general de la clínica, los cierres, las reglas de reserva, la ficha pública del equipo y el resto de contenidos siguen gestionándose con el YAML | La spec limita esta feature a la agenda y la aclaración Q2 deja la ficha pública fuera; el resto llegará en otras features del panel | Meterlo todo aquí multiplicaría el alcance. La guardia, el layout y el log de auditoría de esta feature son la base que reutilizarán las siguientes sin migrar datos |
| Riesgo aceptado de carrera entre una reserva y un cambio de horario o un bloqueo simultáneos (F7) | Evitarlo exige bloquear todos los días del horizonte en cada cambio de horario | La relectura dentro del bloqueo por día reduce la ventana a milisegundos, y la marca "Fuera de horario" deja el caso visible para el administrador |
| No se reconstruyen los cambios de cita anteriores a la feature en `appointment_events` | `appointments` solo guarda el último estado | Se crean `created` y `cancelled` a partir de las columnas existentes; los cambios anteriores no se pueden recuperar y así se indica en el historial |
