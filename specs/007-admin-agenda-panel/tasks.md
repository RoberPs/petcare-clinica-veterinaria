# Tasks: Panel de administración de la agenda

**Input**: documentos de diseño de `specs/007-admin-agenda-panel/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/) y [quickstart.md](./quickstart.md).

**Tests**: **se incluyen**. CLAUDE.md exige que pasen los tests de la feature y los de los flujos
críticos afectados (reserva de cita e inicio de sesión); el plan los detalla en F18. Los tests de
cada historia se escriben antes de implementarla y deben fallar. En local solo se ejecutan los
filtrados de [quickstart.md](./quickstart.md); la batería completa la pasa la CI.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado sobre la fase 2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: la historia a la que pertenece (US1–US5).

## Convenciones del proyecto

- Son las mismas de la 001 a la 006:
  - un solo proyecto Next.js;
  - estilos solo en `design/` y con tokens, sin `style=""`;
  - textos en español e identificadores en inglés;
  - ningún dato de la clínica en `src/`.
- **Capas**:
  - `src/domain/` es puro (sin Next, React, Drizzle ni `pg`): ventanas, bloqueos, validación del
    horario, "Fuera de horario" y esquemas Zod;
  - los efectos del panel van en `src/lib/admin/`;
  - las lecturas van en `src/db/queries/`;
  - las vistas van en `src/app/admin/` y `src/components/admin/`.
- **Escritura de citas**: solo `src/lib/booking/` escribe en `appointments`. El panel llama a
  `cancelAppointment` y `rescheduleAppointment` (F11). Cada cambio de cita escribe un
  `appointment_events` desde esas mismas funciones (F12).
- **Guardia**: toda página de `/admin` pasa por `src/app/admin/layout.tsx` y **cada Server Action
  empieza por `await requireAdmin()`** (F2). Cada acción nueva se registra en `ADMIN_ACTIONS`
  (`src/lib/admin/actions-list.ts`); el test `admin-authz` recorre esa lista.
- **Disponibilidad**: una sola función pura, `availableSlots`, y una sola función de ventanas,
  `staffWindows`, para el cliente, el panel y `isOutsideSchedule` (F7, F9).
- **Decisiones**: las referencias F1–F18 son de [research.md](./research.md). Las rutas y acciones
  están en [contracts/routes.md](./contracts/routes.md), los correos en
  [contracts/emails.md](./contracts/emails.md) y la CLI y el YAML en
  [contracts/cli-and-content.md](./contracts/cli-and-content.md).
- **Tests**:
  - los de integración usan `setupTestDb` y `truncateAll` de `tests/integration/helpers/db.ts` y
    `EMAIL_PROVIDER=fake`;
  - los e2e usan `loadPetcare`/`loadPetcareVariant` de `tests/e2e/db.ts` (con `--force-booking`),
    corren en los proyectos `mobile-360`, `desktop` y `no-js` y pasan axe en cada página nueva;
  - ninguno usa la red.
- **Logs**: solo ids (`appointment_id`, `block_id`, `admin_id`) y códigos de error; nunca correos,
  nombres, notas ni motivos (FR-006).

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Comprobar el entorno: `docker compose up -d`, `npm run db:migrate` hasta `0005_health_tips_newsletter` en desarrollo (5434) y en pruebas (5433), y que `npm run lint` y los tests filtrados de reserva (`tests/integration/booking-*`, `tests/unit/availability`) pasan antes de empezar. Si alguno falla, anotarlo en `specs/007-admin-agenda-panel/checklists/requirements.md`
- [X] T002 [P] Crear las carpetas vacías `src/app/admin/`, `src/components/admin/` y `src/lib/admin/`, y añadir `"admin": "tsx scripts/admin.ts"` a `package.json`

---

## Phase 2: Foundational (requisitos que bloquean todas las historias)

**Purpose**: esquema, migración, ventanas de disponibilidad, eventos de cita, guardia y fixtures.

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

- [X] T003 Ampliar `src/db/schema.ts` según [data-model.md](./data-model.md):
  - columnas nuevas: `customers.isAdmin`, `teamMembers.bookable` y `bookingPosition`;
  - índice único `lower(name)` en `bookingServices` e índice `appointments(starts_at)`;
  - tablas `staffHours`, `scheduleBlocks`, `appointmentEvents` y `adminAuditLog`;
  - enums `schedule_block_kind`, `appointment_event_kind` y `appointment_event_actor`;
  - los CHECK de cada tabla;
  - hacer nulo `team_members.photo_path` si hoy es `NOT NULL`.
- [X] T004 Generar `drizzle/0006_admin_agenda.sql` con `npm run db:generate` y completarlo a mano:
  - las exclusiones GiST de `staff_hours` (`tsrange` sobre `'2000-01-01'::date + time`);
  - el backfill de `bookable` (miembros presentes en `booking_service_staff`) y de
    `booking_position = position`;
  - la copia de `opening_hours` a `staff_hours` de cada veterinario reservable;
  - los eventos `created` (actor deducido de `booked_as`) y `cancelled` (`clinic` pasa a
    `clinic_link`).
  Aplicar la migración en 5434 y en 5433 (depende de T003).
- [X] T005 [P] Crear `src/domain/blocks.ts`:
  - `expandBlocks(blocks, day)` devuelve los intervalos absolutos de ese día (en `Europe/Madrid`)
    de los bloqueos `once` y `weekly`, con el mismo tratamiento del cambio de hora que
    `availability.ts`;
  - `blocksOverlapRange(block, from, to)` dice si un bloqueo se solapa con un rango (F8).
- [X] T006 [P] Crear `src/domain/staff-schedule.ts` con `validateWeek(days)`. Exige como máximo 3
  tramos por día, múltiplos de 5 minutos, fin posterior al inicio y tramos sin solapar. Devuelve
  errores por `día.tramo.campo` en español y `outsideClinic(week, clinicHours)` (F6).
- [X] T007 Ampliar `src/domain/availability.ts` (F7):
  - añadir `staffWindows({ clinicHours, staffHours, closures, blocks, day })`, que calcula
    (clínica ∩ veterinario) − cierres − bloqueos;
  - hacer que `availableSlots` reciba cada miembro con sus `hours` y una lista `blocks`, y use
    `staffWindows`;
  - un miembro sin tramos no ofrece nada;
  - actualizar `nextAvailableDate` y los tipos.
  Depende de T005.
- [X] T008 [P] Crear `src/domain/outside-schedule.ts` con `isOutsideSchedule(appt, windows)` y `countAffected(appts, windowsBefore, windowsAfter)` (F9), usando `staffWindows` (depende de T007)
- [X] T009 [P] Crear `src/db/queries/schedule-blocks.ts` con `blocksForDay(day)`, `blocksForRange(from, to)` y `blockById(id)` (los `once` por rango y los `weekly` por fechas e `isodow`)
- [X] T010 Ampliar `src/db/queries/booking-config.ts` (depende de T003 y T009):
  - `loadBookingConfig` carga `staffHours` y filtra los miembros con `bookable` y una asignación,
    ordenados por `booking_position`;
  - `slotsForDay` y `nextDateWithSlots` (`src/lib/booking/slots.ts`) pasan los bloqueos del día a
    `availableSlots`.
- [X] T011 Hacer que `bookAppointment` (`src/lib/booking/book.ts`) y `rescheduleAppointment` (`src/lib/booking/reschedule.ts`) vuelvan a leer `staff_hours` y los bloqueos del día **dentro** de `withDayLocks` antes de comprobar la franja e insertar (F7)
- [X] T012 Escribir `appointment_events` en todos los caminos (F12):
  - `bookAppointment` escribe `created`;
  - `cancelAppointment` (`src/lib/booking/cancel.ts`) escribe `cancelled`, con `actor`, `admin_id?`
    y `note?` nuevos en sus opciones;
  - `rescheduleAppointment` escribe `rescheduled`, con origen y destino;
  - el actor sale del camino: `cancelOwn`/`rescheduleOwn` usan `customer`, `clinic-manage.ts` usa
    `clinic_link` y `cancelForSystem` usa `system`;
  - la anonimización (`anonymizeCustomerAppointments` y `retention:purge`) pone `note = NULL`.
- [X] T013 [P] Crear `src/lib/admin/audit.ts` con `recordAdminAction(tx, { actorId?, actorLabel?, action, entityType, entityId, changes })`. Valida `action` con Zod y rechaza claves de `changes` que no estén en la lista de configuración (F13)
- [X] T014 [P] Crear `src/lib/auth/require-admin.ts` con `requireAdmin()` (F2):
  - sin sesión: `redirect(loginUrl(await getPathname()))`;
  - con sesión pero sin `isAdmin` o sin `emailVerifiedAt`: `notFound()`;
  - devuelve el admin.
  Incluir `lookupSession` en `src/lib/auth/session.ts` (`isAdmin` en `CurrentCustomer`).
- [X] T015 [P] Crear `src/lib/admin/actions-list.ts` con `ADMIN_ACTIONS`, un registro `{ name, module }` que cada historia ampliará, y `src/domain/admin-schemas.ts` con los esquemas Zod comunes (`dateParam`, `weekParam`, `staffSlug`, `uuid`, `version`)
- [X] T016 Ampliar los fixtures (depende de T017, que crea `--force-booking`):
  - `createCustomer({ admin?: boolean })` en `tests/account-fixtures.ts`;
  - `loginAs(page, { admin })` en `tests/e2e/fixtures.ts`;
  - `createStaffHours` y `createBlock` en `tests/booking-fixtures.ts`;
  - `loadPetcareVariant` pasa `--force-booking` en `tests/e2e/db.ts`.
- [X] T017 Añadir `--force-booking` a `scripts/content-load.ts` y a `src/content/load.ts`, sin cambiar aún el comportamiento por defecto, para que los tests existentes sigan cargando todo (F4; el modo de semilla llega en US3). `--force-booking` hace un upsert por slug de todos los campos y aplica `unpublishMissing`; **solo borra** `staff_hours` y `schedule_blocks` y vuelve a sembrar los horarios. Nunca borra servicios ni miembros (FK `restrict` desde `appointments`).
- [X] T018 [P] Tests unitarios:
  - `tests/unit/blocks.test.ts`: `once`, `weekly`, cruce de medianoche no permitido y día de
    cambio de hora;
  - `tests/unit/staff-schedule.test.ts`;
  - `tests/unit/outside-schedule.test.ts`;
  - ampliar `tests/unit/availability.test.ts` con la intersección clínica ∩ veterinario, el
    veterinario sin tramos (sin franjas ni "Sin preferencia"), los bloqueos del veterinario y de la
    clínica, y la duración que no cabe.
- [X] T019 Tests de integración:
  - ampliar `tests/integration/booking-flow.test.ts` y `cancel-reschedule.test.ts` para comprobar
    `appointment_events` en cada camino;
  - ampliar `tests/integration/retention-appointments.test.ts` para comprobar `note = NULL` tras
    anonimizar;
  - ejecutar los tests filtrados de reserva (`booking-*`, `cancel-reschedule`, `manage-link`) y los
    e2e `us1`–`us4` (flujo crítico): deben seguir en verde con los horarios copiados por la
    migración.

**Checkpoint**: la reserva pública funciona igual que antes, ahora con horario por veterinario y
eventos. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Acceder al panel con una cuenta de administrador (Priority: P1) 🎯 MVP

**Goal**: solo las cuentas verificadas con `is_admin` entran en `/admin`. El rol se gestiona con
`npm run admin`.

**Independent Test**: dar el rol con la CLI, entrar en `/admin`. Con un cliente y sin sesión, cada
ruta y cada acción se rechazan; tras `revoke`, la siguiente petición da 404.

### Tests for User Story 1 ⚠️

- [X] T020 [P] [US1] Crear `tests/integration/admin-authz.test.ts`. Para cada entrada de `ADMIN_ACTIONS` y cada página de `/admin`, comprobar:
  - un anónimo es redirigido;
  - un cliente sin rol, un admin sin verificar y un admin con el rol retirado a mitad de sesión
    reciben 404 y no ejecutan nada;
  - un admin pasa.
  La lista se completa en cada historia.
- [X] T021 [P] [US1] Crear `tests/integration/admin-cli.test.ts`:
  - `grant`, `revoke` y `list`;
  - códigos de salida 0, 2 y 3;
  - `admin_audit_log` con `actor_label`;
  - sin correo en los logs capturados.
- [X] T022 [P] [US1] Crear `tests/e2e/admin-access.spec.ts`:
  - el admin ve el enlace en `/mi-cuenta` y entra en `/admin`;
  - el cliente recibe el 404 normal y no ve el enlace;
  - el anónimo va a `/iniciar-sesion?return_to=/admin/servicios` y vuelve;
  - cabeceras `X-Robots-Tag` y `Cache-Control: no-store`;
  - axe y teclado (enlace para saltar al contenido y foco visible en `.side-nav`).

### Implementation for User Story 1

- [X] T023 [P] [US1] Crear `src/lib/admin/cli.ts` con `runAdminCli(argv)` (`list`, `grant <correo> --by`, `revoke <correo> --by`), que actualiza `customers.is_admin` y llama a `recordAdminAction` en la misma transacción, y `scripts/admin.ts` (carga `.env`, ejecuta y cierra la BD) según [contracts/cli-and-content.md](./contracts/cli-and-content.md)
- [X] T024 [P] [US1] Añadir `admin` a `scripts/build-cli.mjs` (genera `cli/admin.mjs`) y documentar `npm run admin` y su uso en producción en `deploy/README.md`
- [X] T025 [US1] Ampliar `src/middleware.ts`: para `/admin/*`, añadir `X-Robots-Tag: noindex, nofollow` y `Cache-Control: no-store`, sin consultar la sesión (F3)
- [X] T026 [US1] Crear `src/app/admin/layout.tsx` (`await requireAdmin()`, `metadata.robots` noindex, `.account-grid` con `src/components/admin/AdminNav.tsx`) y `src/app/admin/page.tsx` (redirige a `/admin/agenda`). `AdminNav` es un `.side-nav` con Agenda, Servicios, Veterinarios y Bloqueos y `aria-current` en la sección activa.
- [X] T027 [US1] Crear `src/app/admin/agenda/page.tsx` mínima (título "Agenda" y el día de hoy) para que el acceso se pueda probar; la completa US2
- [X] T028 [US1] Mostrar el enlace "Panel de administración" en `src/app/mi-cuenta/page.tsx` (y en `.side-nav` de la cuenta, si existe) solo si `customer.isAdmin`

**Checkpoint**: US1 funciona y se prueba sola (T020–T022 en verde).

---

## Phase 4: User Story 2 - Ver la agenda del día y de la semana por veterinario (Priority: P1)

**Goal**: agenda del día y de la semana por veterinario, con filtros, bloqueos, tramos sin horario,
marcas y el detalle con historial.

**Independent Test**: con citas de dos veterinarios en varios días, abrir el día y la semana,
navegar, filtrar y mostrar canceladas; abrir un detalle y ver contacto e historial.

### Tests for User Story 2 ⚠️

- [X] T029 [P] [US2] Crear `tests/integration/admin-agenda.test.ts` con `agendaForRange`:
  - citas por veterinario ordenadas y canceladas solo con el filtro;
  - marca "Fuera de horario" y "Servicio inactivo";
  - bloqueos y tramos sin horario incluidos;
  - cita anonimizada sin datos personales;
  - semana de lunes a domingo, también la del cambio de hora.
- [X] T030 [P] [US2] Crear `tests/e2e/admin-agenda.spec.ts`:
  - día y semana;
  - anterior, siguiente, hoy e ir a fecha;
  - filtro por veterinario que se conserva al navegar;
  - mostrar canceladas;
  - detalle con contacto e historial;
  - perfil `no-js` y axe.

### Implementation for User Story 2

- [X] T031 [P] [US2] Crear `src/db/queries/admin-agenda.ts`:
  - `agendaForRange(from, to, { staffId?, includeCancelled })`: citas del rango
    (`starts_at >= from AND starts_at < to`) con servicio (y su `published`), veterinario, mascota
    y responsable; solo el nombre, sin contacto;
  - `appointmentDetail(id)`: con contacto, `manage_version` y `appointment_events` ordenados.
- [X] T032 [P] [US2] Crear `src/domain/agenda-view.ts`:
  - `buildAgenda({ appointments, staff, clinicHours, staffHours, closures, blocks, from, days })`
    devuelve por veterinario y día las citas con sus marcas (`isOutsideSchedule`, servicio
    inactivo), los bloqueos y los tramos sin horario;
  - `parseAgendaParams(searchParams)` valida con Zod y cae al valor por defecto (F16);
  - `weekStart(date)`, con el lunes y Temporal.
- [X] T033 [P] [US2] Añadir a `design/styles.css`, solo con tokens y apilados por debajo de 900 px:
  - `.admin-toolbar`;
  - `.agenda-day` (columnas por veterinario);
  - `.agenda-week` (7 columnas por veterinario);
  - `.agenda-slot`, `.agenda-slot--cancelled`, `.agenda-slot--block` y `.agenda-slot--off`.
  Si hace falta un valor nuevo, añadirlo primero como token en `design/tokens.css`. Pasar
  `npm run check:design` (F15).
- [X] T034 [US2] Crear `src/components/admin/AgendaToolbar.tsx` (pestañas Día / Semana con `.tabs`; enlaces anterior, hoy y siguiente; formulario GET con fecha, veterinario y canceladas que conserva los parámetros), `AgendaDay.tsx` y `AgendaWeek.tsx`:
  - un encabezado por veterinario y día;
  - `<time>`;
  - estados y marcas en texto con `.badge`, `.badge--urgent` y `.badge--muted`;
  - un enlace al detalle por cita;
  - "No hay citas" y los bloqueos con su motivo interno.
- [X] T035 [US2] Completar `src/app/admin/agenda/page.tsx` con `parseAgendaParams`, `agendaForRange`, `blocksForRange`, `buildAgenda` y los componentes de T034, más el aviso de `?aviso=` en `role="status"`
- [X] T036 [US2] Crear `src/app/admin/citas/[id]/page.tsx` y `src/components/admin/AppointmentHistory.tsx`:
  - servicio, veterinario, fecha y hora, estado y motivo;
  - origen (cuenta o invitado), nombre, teléfono, correo y mascota;
  - historial ("Creada", "Movida de … a …", "Cancelada", con quién);
  - nota sobre los cambios anteriores a la feature;
  - botones "Mover" y "Cancelar" (en US4) solo si es confirmada y futura;
  - 404 si no existe.

**Checkpoint**: US1 y US2 funcionan; la recepción ya puede consultar la agenda.

---

## Phase 5: User Story 3 - Definir servicios y horarios de cada veterinario (Priority: P1)

**Goal**: servicios, veterinarios y horarios desde el panel, con efecto inmediato en la reserva
pública y sin que `content:load` los sobrescriba.

**Independent Test**: crear un servicio de 45 minutos, asignarlo a un veterinario con horario del
martes de 10:00 a 13:00 y ver en `/pide-cita` solo esas franjas (de 10:00 a 12:00, con el paso de 30 min); desactivarlo y
ver que desaparece.

### Tests for User Story 3 ⚠️

- [X] T037 [P] [US3] Crear `tests/integration/admin-services.test.ts`:
  - crear y editar un servicio;
  - nombre duplicado sin distinguir mayúsculas;
  - duración no válida;
  - asignación de veterinarios;
  - desactivar o cambiar la duración con citas futuras: se mantienen con su `ends_at` y se
    informa del número;
  - `slotsForDay` refleja cada cambio en la consulta siguiente;
  - aviso `sin-franjas`;
  - `admin_audit_log` escrito.
- [X] T038 [P] [US3] Crear `tests/integration/admin-staff-hours.test.ts`:
  - alta de veterinario (no publicado y no visible en la página del equipo);
  - `bookable` desactivado: no se ofrece ni se asigna con "Sin preferencia" y sus citas se
    mantienen;
  - horario con errores por campo y sin guardado parcial;
  - tramo fuera del horario de la clínica (se guarda, avisa y no se ofrece);
  - citas que quedan fuera (`afectadas=N`) y marcadas;
  - veterinario sin tramos.
- [X] T039 [P] [US3] Crear `tests/integration/content-load-seed.test.ts`:
  - sin `--force-booking` no se sobrescriben el nombre ni la duración de un servicio, ni el nombre,
    `bookable` y horario de un veterinario cambiados en el panel, y se crean los nuevos del YAML;
  - con `--force-booking` se restaura todo aunque haya citas pasadas y futuras, y el servicio que
    falta en el YAML queda despublicado, no borrado;
  - la ficha pública del equipo sí se actualiza.
- [X] T040 [P] [US3] Crear `tests/e2e/admin-services-hours.spec.ts` con el recorrido del Independent Test, más un veterinario sin horario, en el perfil `no-js` y con axe en las 6 páginas

### Implementation for User Story 3

- [X] T041 [P] [US3] Añadir a `src/domain/admin-schemas.ts` `serviceForm`, `staffForm` y `weekForm` (los nombres de los campos de la rejilla son `d{1..7}_{0..2}_{opens|closes}`) según [contracts/routes.md](./contracts/routes.md)
- [X] T042 [P] [US3] Crear `src/lib/admin/services.ts`: `saveService(admin, input)` (upsert, `slug` generado y fijo, asignaciones, `countAffected` de citas futuras, aviso `sin-franjas` si ningún tramo admite la duración, auditoría y 23505 como error de nombre duplicado) y `listServicesWithStats()`
- [X] T043 [P] [US3] Crear `src/lib/admin/staff.ts` con `saveStaff(admin, input)` (alta con `published = false`, `slug` único, servicios que atiende y auditoría) y `src/lib/admin/hours.ts` con `saveStaffHours(admin, staffId, week)` (`validateWeek`, borrado y creación en una transacción, `countAffected` antes y después, `outsideClinic` y auditoría `staff.hours`)
- [X] T044 [US3] Cambiar `src/content/load.ts` al modo de semilla por defecto, según [contracts/cli-and-content.md](./contracts/cli-and-content.md):
  - `booking.services` solo crea los nuevos, sin `unpublishMissing`;
  - en `team` existente solo actualiza los campos de la ficha pública;
  - copia `opening_hours` a los veterinarios reservables nuevos sin tramos;
  - `--force-booking` mantiene la sobrescritura de T017 (sin borrar servicios ni miembros) y
    avisa.
  Actualizar `deploy/README.md` con la regla nueva.
- [X] T045 [P] [US3] Añadir `.schedule-grid` a `design/styles.css` (`fieldset` por día y tramos en fila; apilado en móvil) solo con tokens, y crear `src/components/admin/ScheduleGrid.tsx`:
  - `<fieldset>`/`<legend>` por día y 3 tramos con `<label>`;
  - errores junto al campo con `aria-describedby`;
  - resumen con `role="alert"`.
- [X] T046 [US3] Crear las páginas y las acciones de servicios:
  - páginas `src/app/admin/servicios/page.tsx` (tabla `table.orders--stack` con duración, estado,
    orden, veterinarios y citas futuras), `nuevo/page.tsx` y `[id]/page.tsx` (formulario con aviso
    previo de citas futuras al desactivar o cambiar la duración, FR-014);
  - acción `src/app/admin/servicios/actions.ts` → `saveService`, con `requireAdmin()` primero,
    token de envío y PRG.
  Registrar las acciones en `ADMIN_ACTIONS`.
- [X] T047 [US3] Crear las páginas y las acciones de veterinarios:
  - páginas `src/app/admin/veterinarios/page.tsx` (lista con reservable, servicios y aviso "Sin
    horario: no recibe reservas"), `nuevo/page.tsx`, `[id]/page.tsx` y `[id]/horario/page.tsx`
    (`ScheduleGrid` y horario de la clínica como referencia);
  - acción `src/app/admin/veterinarios/actions.ts` → `saveStaff` y `saveStaffHours`, con
    `requireAdmin()`, token y PRG.
  Registrar las acciones en `ADMIN_ACTIONS`.
- [X] T048 [US3] Comprobar que `/pide-cita` muestra "Ahora no hay citas online disponibles" con enlace a contacto cuando ningún servicio activo tiene un veterinario con horario (`src/app/pide-cita/page.tsx`), y ampliar `tests/e2e/us1-guest-booking.spec.ts` con ese caso

**Checkpoint**: US1–US3 funcionan; la clínica configura su agenda sin tocar el YAML (SC-006).

---

## Phase 6: User Story 4 - Cancelar o mover una cita (Priority: P2)

**Goal**: cancelar y mover desde el detalle, con correo al responsable, idempotencia y control de
versión.

**Independent Test**: cancelar una cita con nota (la franja queda libre y llega el correo con
"Mensaje de la clínica"); mover otra (franja vieja libre, la nueva ocupada y correo con la hora
anterior y la nueva).

### Tests for User Story 4 ⚠️

- [X] T049 [P] [US4] Crear `tests/integration/admin-appointments.test.ts`:
  - cancelar con nota: `cancelled_by = clinic`, evento `admin` con `note` y correo
    `appointment_cancelled`;
  - mover sin antelación mínima ni horizonte, pero respetando horario, bloqueo y no solapamiento,
    y a un veterinario que no atiende el servicio (rechazado);
  - servicio inactivo (permitido);
  - versión obsoleta (`cita-cambiada`) y reenvío idempotente (un solo correo);
  - cita pasada o cancelada (`no-modificable`);
  - carrera entre el admin moviendo y un cliente reservando la misma franja (solo uno lo consigue);
  - recordatorio reprogramado o anulado;
  - el enlace de gestión antiguo queda invalidado;
  - se intenta enviar el correo en el acto: queda `sent` con el proveedor falso sin ejecutar
    `email:dispatch`.
- [X] T050 [P] [US4] Ampliar `tests/unit/appointment-emails.test.ts` con la variante de la clínica: asunto, texto y nota escapada (`<script>` como texto) y sin nota
- [X] T051 [P] [US4] Crear `tests/e2e/admin-cancel-move.spec.ts`:
  - mover y cancelar desde el detalle;
  - franja libre y ocupada en `/pide-cita`;
  - correos con `latestEmailTo`;
  - "franja ocupada" que conserva fecha y veterinario;
  - perfil `no-js`, axe y teclado.

### Implementation for User Story 4

- [X] T052 [P] [US4] Ampliar `src/email/templates/appointment-cancelled.ts` y `appointment-changed.ts` y `src/lib/booking/emails.ts` (`enqueueCancelEmails` y `enqueueChangeEmails` con `{ byClinic, clinicNote? }`), según [contracts/emails.md](./contracts/emails.md)
- [X] T053 [P] [US4] Añadir a `src/domain/admin-schemas.ts` `cancelForm` (`id`, `version` y `note` de 0 a 300 caracteres, sin saltos de línea múltiples) y `moveForm` (`id`, `version`, `date`, `time` y `staff_id`), y a `src/domain/booking-schemas.ts` o a `availability.ts` las `AdminRules` (antelación 0, horizonte de 365 días, solo futuro)
- [X] T054 [US4] Crear `src/lib/admin/appointments.ts`:
  - `adminCancel(admin, input)` llama a `cancelAppointment` con `actor 'clinic'`, sin plazo, con
    evento `admin` y nota, y encola el correo con `byClinic`;
  - `adminMove(admin, input)` llama a `rescheduleAppointment` con `AdminRules`; acepta un servicio
    inactivo y exige un veterinario `bookable` que atienda el servicio;
  - `adminMoveSlots(id, date, staffId?)` da las franjas libres para la pantalla;
  - las dos acciones comprueban `manage_version` y devuelven `cita-cambiada`, `no-modificable` o
    `franja-ocupada`;
  - después del commit, las dos acciones intentan enviar el correo en el acto con `sendEmailsSoon`
    (en `after()`), como las features 003 y 005 (SC-004).
- [X] T055 [US4] Crear las páginas `src/app/admin/citas/[id]/cancelar/page.tsx` (confirmación, nota con aviso de no incluir datos de salud y botón `.btn--ghost`) y `src/app/admin/citas/[id]/mover/page.tsx` (GET de fecha y veterinario; franjas libres como opciones de radio; confirmar en marino), y la acción `src/app/admin/citas/[id]/actions.ts` → `cancelAppointmentAdmin` y `moveAppointmentAdmin`, con `requireAdmin()`, token y PRG. Registrar las acciones en `ADMIN_ACTIONS`.
- [X] T056 [US4] Activar los botones "Mover" y "Cancelar" en `src/app/admin/citas/[id]/page.tsx` y mostrar los avisos `cancelada`, `movida`, `cita-cambiada`, `no-modificable` y `franja-ocupada` en `role="status"` o `role="alert"`
- [X] T057 [US4] Exportación de datos: añadir `clinic_note` a cada cita y `version: 4` en `src/lib/account/export.ts` y en `buildAccountExport`, y actualizar su test en `tests/integration/` (busca `export`)

**Checkpoint**: US1–US4 funcionan; el enlace de gestión de la 003 queda como alternativa.

---

## Phase 7: User Story 5 - Bloquear franjas: vacaciones y descansos (Priority: P2)

**Goal**: bloqueos puntuales y semanales, de un veterinario o de toda la clínica, con la revisión
de las citas afectadas y la decisión de mantenerlas o cancelarlas.

**Independent Test**: bloquear a un veterinario de lunes a viernes (no se le ofrecen franjas) y
borrar el bloqueo (vuelven las franjas). Bloquear un día con una cita: con "Mantener" queda "Fuera
de horario"; con "Cancelarlas todas" se cancela y sale el correo.

### Tests for User Story 5 ⚠️

- [X] T058 [P] [US5] Crear `tests/integration/admin-blocks.test.ts`:
  - crear, editar y borrar bloqueos `once` y `weekly`, del veterinario y de la clínica, con efecto
    en `slotsForDay`;
  - validaciones: fin anterior al inicio, en el pasado y más de 366 días;
  - con citas afectadas: sin `decision`, se rechaza;
  - `keep`: se guarda y las citas quedan marcadas;
  - `cancel_all`: cancela todas con un correo por cita, en una transacción, y es idempotente con el
    mismo `submission_id`;
  - si las afectadas cambian entre revisar y guardar, no se guarda nada;
  - auditoría.
- [X] T059 [P] [US5] Crear `tests/e2e/admin-block.spec.ts`:
  - el recorrido del Independent Test;
  - descanso semanal de 11:00 a 11:30 de lunes a viernes;
  - perfil `no-js` (revisar por GET y confirmar por POST);
  - axe y teclado.

### Implementation for User Story 5

- [X] T060 [P] [US5] Añadir a `src/domain/admin-schemas.ts` `blockForm`:
  - `scope`, `staff_id?` y `kind`;
  - para `once`: fecha y hora de inicio y fin;
  - para `weekly`: desde, hasta, días y horas;
  - `reason` de 1 a 120 caracteres;
  - `decision?`, `affected_ids[]` y `submission_id`;
  - errores por campo en español.
- [X] T061 [US5] Crear `src/lib/admin/blocks.ts`:
  - `previewBlock(input)` calcula las citas afectadas con `blocksOverlapRange` e
    `isOutsideSchedule`;
  - `saveBlock(admin, input)` vuelve a calcular las afectadas dentro de la transacción; si
    difieren de `affected_ids`, devuelve `afectadas-cambiadas`; si hay afectadas y falta
    `decision`, se rechaza;
  - con `cancel_all`, hace `withDayLocks` de los días afectados, `cancelAppointment` con
    `actor 'clinic'` y evento `admin`, y encola los correos con `byClinic`;
  - `saveBlock` inserta o actualiza con `id = submission_id`, de forma idempotente, y registra la
    auditoría;
  - después del commit de `cancel_all`, intenta enviar los correos en el acto con
    `sendEmailsSoon` (en `after()`) (SC-004);
  - `deleteBlock(admin, id)` borra y registra la auditoría (el botón de borrar usa `.btn--ghost`).
- [X] T062 [P] [US5] Crear `src/components/admin/BlockForm.tsx` con dos pasos:
  - paso 1: formulario GET "Revisar" con radios de ámbito y tipo; los campos de cada tipo en
    `<fieldset>`; sin JavaScript se ven todos y el servidor ignora los del otro tipo;
  - paso 2: confirmación con los datos ocultos, la lista de citas afectadas (hora, veterinario,
    servicio y mascota) y radios "Mantenerlas (quedan fuera de horario)" y "Cancelarlas todas y
    avisar a los clientes" sin opción preseleccionada;
  - "Guardar bloqueo" en marino.
- [X] T063 [US5] Crear las páginas `src/app/admin/bloqueos/page.tsx` (tabla de vigentes y futuros, `?pasados=1`), `nuevo/page.tsx` y `[id]/page.tsx` (con `?revisar=1` llaman a `previewBlock`), y la acción `src/app/admin/bloqueos/actions.ts` → `saveBlock` y `deleteBlock`, con `requireAdmin()`, token y PRG a `/admin/agenda?fecha=<inicio>&aviso=bloqueo-guardado`. Registrar las acciones en `ADMIN_ACTIONS`.
- [X] T064 [US5] Mostrar los bloqueos en la agenda (`AgendaDay` y `AgendaWeek`, que ya reciben `blocks` desde T035), con enlace a su edición, y comprobar que `staffWindows` ya los resta en la reserva pública (ampliar `tests/integration/booking-flow.test.ts` con un caso de bloqueo de la clínica)

**Checkpoint**: las 5 historias funcionan.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T065 [P] Completar `tests/e2e/a11y-all-routes.spec.ts` con todas las rutas de `/admin` (con sesión de admin y datos de ejemplo) en `mobile-360`, `desktop` y `no-js`
- [X] T066 [P] Revisar que ningún log de `src/lib/admin/` ni de `src/lib/booking/` incluye correos, nombres, notas ni motivos (`grep` de `logger.` en esos directorios), y que `admin_audit_log.changes` no guarda datos de clientes
- [X] T067 [P] Ejecutar `npm run lint` (ESLint, tsc y `check:design`) y Gitleaks sobre el diff; sin `style=""`, colores escritos a mano ni secretos
- [X] T068 Ejecutar las pruebas filtradas de [quickstart.md](./quickstart.md) (unitarias, integración y e2e de la feature y de los flujos críticos de reserva e inicio de sesión) y recorrer a mano el quickstart; anotar cualquier desviación en `specs/007-admin-agenda-panel/checklists/requirements.md`
- [X] T069 Actualizar `CLAUDE.md` (feature 007 implementada, `npm run admin` en Comandos, regla de `content:load` con `--force-booking`) y `deploy/README.md` (dar el primer administrador tras desplegar)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (fase 1)**: sin dependencias.
- **Foundational (fase 2)**: depende de la fase 1 y bloquea todas las historias. Dentro de la
  fase:
  - T004 depende de T003;
  - T007 depende de T005;
  - T008 depende de T007;
  - T010 depende de T003 y T009;
  - T016 depende de T017;
  - T011 y T012 dependen de T004 y T010;
  - T019 depende de T011 y T012.
- **US1 (fase 3)**: depende de la fase 2. Es el MVP: sin ella ninguna página del panel es accesible.
- **US2 (fase 4)**: depende de US1 (layout y guardia).
- **US3 (fase 5)**: depende de US1. Es independiente de US2, salvo que las marcas de la agenda se
  ven mejor con US2 hecha.
- **US4 (fase 6)**: depende de US2 (página de detalle, T036).
- **US5 (fase 7)**: depende de US2 (agenda, T035) y usa `byClinic` de los correos (T052, de US4).
  Si se hace antes que US4, T052 pasa a US5.
- **Polish (fase 8)**: depende de las historias que se entreguen.

### Within Each User Story

- Los tests se escriben primero y deben fallar.
- Dominio → consultas → efectos (`src/lib/admin/`) → vistas y acciones → registro en
  `ADMIN_ACTIONS`.
- Cada checkpoint se valida antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- Fase 1: T002.
- Fase 2: T005, T006, T009, T013, T014 y T015 en paralelo; luego T007 → T008 y T017 → T016; T018
  en paralelo con T010–T012.
- US1: T020, T021 y T022 juntos; T023 y T024 en paralelo.
- US2: T029 y T030 juntos; T031, T032 y T033 juntos.
- US3: T037–T040 juntos; T041, T042, T043 y T045 juntos.
- US4: T049, T050 y T051 juntos; T052 y T053 juntos.
- US5: T058 y T059 juntos; T060 y T062 juntos.
- Polish: T065, T066 y T067 juntos.
- Con dos personas: tras US1, una hace US2 → US4 y otra US3; US5 al final.

---

## Parallel Example: User Story 3

```text
# Tests de US3, juntos:
Task: "tests/integration/admin-services.test.ts"
Task: "tests/integration/admin-staff-hours.test.ts"
Task: "tests/integration/content-load-seed.test.ts"
Task: "tests/e2e/admin-services-hours.spec.ts"

# Piezas independientes de US3:
Task: "src/domain/admin-schemas.ts (serviceForm, staffForm, weekForm)"
Task: "src/lib/admin/services.ts"
Task: "src/lib/admin/staff.ts y hours.ts"
Task: ".schedule-grid en design/styles.css y ScheduleGrid.tsx"
```

---

## Implementation Strategy

### MVP First

1. Fases 1 y 2: la reserva pública sigue igual, con horario por veterinario y eventos.
2. Fase 3 (US1): acceso, guardia y CLI. **Parar y validar** T020–T022.
3. Con US2, la recepción ya tiene agenda; con US3, la clínica es autónoma (es el MVP útil del panel).

### Incremental Delivery

1. Fases 1 y 2, con la reserva pública verificada (flujo crítico).
2. US1, después US2 y después US3: el panel P1 completo.
3. US4: cancelar y mover con correo.
4. US5: bloqueos con revisión de citas afectadas.
5. Fase 8 y cierre.

---

## Notes

- [P] = archivos distintos y sin dependencias pendientes.
- Cada Server Action nueva empieza por `await requireAdmin()` y entra en `ADMIN_ACTIONS`; si no,
  falla `admin-authz`.
- No se hacen commits ni pushes sin que el usuario lo pida.
- Las desviaciones respecto a la spec o al plan se anotan en `checklists/requirements.md`.
