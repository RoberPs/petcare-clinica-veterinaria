# Research: Panel de administración de la agenda (feature 007)

Decisiones **F1–F18** de la feature 007. Siguen vigentes las R1–R17 (001), A1–A14 (002), B1–B17
(003), C1–C16 (004), D1–D20 (005) y E1–E18 (006). No hay incógnitas abiertas ni dependencias
nuevas.

## F1. Rol de administrador: columna en `customers` y constancia en `admin_audit_log`

- **Decision**: `customers.is_admin boolean NOT NULL DEFAULT false`. Lo asigna y lo retira solo
  la herramienta `npm run admin` (F14), que escribe a la vez una fila en `admin_audit_log` con
  `actor_label` (el `--by` obligatorio de la orden) y la fecha.
- **Rationale**: hay un único rol (spec, Assumptions). `lookupSession` ya relee el cliente en cada
  petición, así que retirar el rol surte efecto en la siguiente (FR-002) sin tocar las sesiones.
- **Alternatives considered**:
  - una tabla `admin_roles`: es más flexible, pero sobra con un solo rol;
  - un enum `role`: obligaría a migrarlo cuando haya varios roles combinables;
  - cuentas de personal separadas: duplican el login, la recuperación y la limitación de intentos
    de la 002.

## F2. Guardia `requireAdmin()` en el layout y en cada Server Action

- **Decision**: `src/lib/auth/require-admin.ts`, que devuelve el admin actual:
  - sin sesión: `redirect(loginUrl(pathname))`, como `requireCustomer`;
  - con sesión pero sin `is_admin` o sin correo verificado: `notFound()`, la misma respuesta que
    una ruta inexistente (FR-003).
  - Se llama en `src/app/admin/layout.tsx` y **al principio de cada Server Action** del panel,
    porque los layouts no se ejecutan en las acciones (lo advierte `mi-cuenta/layout.tsx`).
  - Un test de integración recorre la lista exportada `ADMIN_ACTIONS` y comprueba que cada acción
    rechaza a un cliente y a un anónimo (SC-001).
- **Rationale**: autorización en servidor en cada petición (principio IV) sin depender del
  middleware, que no consulta la sesión.
- **Alternatives considered**: comprobar en el middleware. Habría que leer la sesión desde la base
  de datos en todas las rutas, y las acciones seguirían necesitando la comprobación.

## F3. Rutas bajo `/admin`, sin indexar y sin caché

- **Decision**:
  - todo cuelga de `/admin`; el detalle está en [contracts/routes.md](contracts/routes.md);
  - `/admin` redirige a `/admin/agenda`;
  - metadata `robots: noindex, nofollow`, más `X-Robots-Tag: noindex` y `Cache-Control: no-store`
    desde el middleware para `/admin/*` (mismo criterio que `account-no-cache`);
  - las Server Actions usan la comprobación Origin/Host de Next, el token firmado de envío
    (`form-token.ts`) y la idempotencia (FR-005, FR-023).
- **Rationale**: el patrón de `mi-cuenta`. No revela más que una URL conocida, porque un cliente
  recibe el 404.

## F4. Quién manda: el panel sobre el YAML en la agenda

- **Decision**: `content:load` pasa a **sembrar sin sobrescribir** lo que gestiona el panel:
  - `booking.services`: crea los servicios cuyo `slug` no existe, con sus veterinarios. Los
    existentes no se tocan y deja de aplicarse `unpublishMissing`.
  - `team`: crea los miembros nuevos y en los existentes actualiza solo la ficha pública
    (`specialty`, `photo_path`, `photo_alt`, `position`, `published`). `name` y `bookable` solo se
    escriben al crear.
  - Horarios por veterinario: se siembran con el horario de la clínica solo para los veterinarios
    reservables que se crean y no tienen tramos.
  - `opening_hours`, `closures` y `booking.rules` siguen como hoy, porque no se gestionan en el
    panel (spec, Assumptions).
  - La opción `--force-booking` recupera la sobrescritura total. Hace upsert por slug de todos los
    campos y aplica `unpublishMissing`, pero solo borra `staff_hours` y `schedule_blocks`, nunca
    servicios ni miembros, porque las citas los referencian con una FK `restrict`. La usan los tests
    y la puesta en marcha de una clínica, y avisa en la salida.
- **Rationale**: sin esto, el siguiente despliegue con `content:load` borraría los cambios del
  panel (FR-018, SC-006). El YAML queda como semilla inicial y el panel cierra la excepción del
  principio VIII para servicios, veterinarios y horarios.
- **Alternatives considered**:
  - quitar esas secciones del YAML: rompe la puesta en marcha reproducible de una clínica nueva;
  - una marca `managed_by_panel` por fila: más estado y la misma regla.

## F5. Veterinario reservable: `team_members.bookable` y `booking_position`

- **Decision**:
  - `bookable boolean NOT NULL DEFAULT false` y `booking_position integer NOT NULL DEFAULT 0` en
    `team_members`;
  - la migración pone `bookable = true` a quien hoy aparece en `booking_service_staff`;
  - para reservar hay que cumplir tres cosas: `bookable`, atender el servicio y tener tramos;
  - dar de alta desde el panel crea un `team_member` con `published = false`, sin foto, para que
    no salga en la página del equipo, y con un `slug` generado del nombre y fijo después;
  - la ficha pública sigue en el YAML (aclaración Q2).
- **Rationale**: FR-015 y US3, escenario 9, piden activar y desactivar sin perder las asignaciones.
- **Alternatives considered**: deducirlo de `booking_service_staff`. Desactivar obligaría a borrar
  las asignaciones.

## F6. Horario por veterinario: tabla `staff_hours`

- **Decision**:
  - `staff_hours(team_member_id, weekday 1..7, opens_at time, closes_at time)`, con
    `CHECK (closes_at > opens_at)` y una exclusión GiST que impide tramos solapados del mismo
    veterinario y día;
  - el formulario envía la semana completa y se guarda en una transacción que borra y vuelve a
    crear los tramos de ese veterinario;
  - la validación pura (`src/domain/staff-schedule.ts`) da errores por campo antes de llegar a la
    base de datos;
  - la migración copia `opening_hours` a cada veterinario reservable (spec, Assumptions);
  - hasta 3 tramos por día en el formulario, porque sin JavaScript hacen falta filas fijas.
- **Rationale**: FR-016 y FR-019. Con borrar y volver a crear basta para un formulario semanal.
- **Alternatives considered**: guardar el horario como JSON en `team_members`: la exclusión y la
  validación por tramo quedarían en la aplicación.

## F7. Disponibilidad: intersección con el horario del veterinario y bloqueos

- **Decision**:
  - `availableSlots` (`src/domain/availability.ts`) recibe en cada veterinario su `hours` y una
    lista `blocks` (intervalos absolutos de ese día, del veterinario o de toda la clínica);
  - las ventanas de cada veterinario son: (horario de la clínica ∩ horario del veterinario) −
    cierres − bloqueos;
  - se ofrece una franja si la duración cabe entera en una ventana y no choca con `busy`;
  - un veterinario sin tramos no tiene ventanas, así que no sale en el selector ni se asigna con
    "Sin preferencia" (FR-017);
  - `loadBookingConfig` añade `staffHours`, y `slotsForDay` carga los bloqueos del día;
  - `bookAppointment` y `rescheduleAppointment` vuelven a leer tramos y bloqueos del día **dentro**
    de `withDayLocks`, antes de insertar.
- **Rationale**: una sola función pura decide las franjas del cliente y del panel; los cambios se
  ven en la siguiente consulta porque `getBookingConfig` solo guarda caché por petición (FR-018).
- **Riesgo aceptado**: una reserva que se confirma en el mismo instante en que se guarda un
  bloqueo o un horario puede quedar dentro. La cita queda marcada "Fuera de horario" (F9) y el
  administrador la ve. Para evitarlo habría que bloquear todos los días del horizonte en cada
  cambio de horario.

## F8. Bloqueos: tabla `schedule_blocks`, puntuales o semanales

- **Decision**: una tabla `schedule_blocks`:
  - `team_member_id` nulo significa toda la clínica;
  - `kind`: `once` (`starts_at` y `ends_at` como `timestamptz`) o `weekly` (`from_date`,
    `until_date`, `weekdays smallint[]`, `start_time`, `end_time`), con CHECK de coherencia por
    tipo;
  - `reason` (1–120 caracteres, interno), `created_by` y marcas de tiempo;
  - la expansión a intervalos de un día la hace `src/domain/blocks.ts`, en `Europe/Madrid` y con
    las reglas de cambio de hora de B*;
  - un bloqueo semanal dura como máximo 366 días;
  - no se aceptan bloqueos que acaben en el pasado.
- **Rationale**: US5, escenarios 1 a 3. La regla semanal se guarda una vez y se expande al
  consultar, sin generar miles de filas.
- **Alternatives considered**: generar una fila por día, que complica editar y borrar; RRULE
  (RFC 5545), que es demasiado para "días de la semana dentro de un periodo".

## F9. "Fuera de horario" se calcula, no se guarda

- **Decision**: `isOutsideSchedule(appointment, windows)` en `src/domain/`. Una cita confirmada y
  futura está fuera de horario si no cabe en las ventanas de F7 de su veterinario. La agenda y los
  avisos de FR-014, FR-019 y FR-028 usan la misma función (`countAffected`).
- **Rationale**: siempre refleja el horario actual, sin marcas que se queden viejas al deshacer un
  bloqueo.

## F10. Bloquear con citas dentro: previsualización por GET y decisión por POST

- **Decision**: el formulario del bloqueo funciona en dos pasos y sin JavaScript.
  1. "Revisar" envía un **GET** a la misma página con los campos del bloqueo, que solo llevan
     fechas, veterinario y motivo y ningún dato personal. La página valida y muestra las citas
     afectadas.
  2. El formulario de confirmación los reenvía ocultos junto con `decision` (`keep` o
     `cancel_all`). Es obligatorio si hay citas afectadas.
  - La Server Action vuelve a calcular las afectadas dentro de la transacción. Si no coinciden con
    las que se mostraron (se envía su lista de ids), no guarda nada y vuelve al paso 1 con el
    aviso "Las citas afectadas han cambiado".
  - Con `cancel_all`, cancela cada cita con `actor = 'clinic'`, sin plazo, bajo `withDayLocks` de
    los días afectados, encola un correo por cita y guarda el bloqueo, todo en la misma
    transacción.
  - Después hace POST-Redirect-GET a la agenda con un aviso de éxito.
  - Editar un bloqueo sigue el mismo flujo; borrarlo no necesita revisión.
- **Rationale**: aclaración Q1 y FR-028; sin estado de servidor entre los pasos y el mismo patrón
  PRG del proyecto.
- **Alternatives considered**: un borrador guardado en la base de datos (estado que purgar);
  `useActionState` con estado devuelto (en este proyecto se ha preferido el PRG).

## F11. Cancelar y mover desde el panel: se reutiliza la lógica de la 003

- **Decision**:
  - cancelar llama a `cancelAppointment` con `actor 'clinic'` y `enforceCutoff false`;
  - mover llama a `rescheduleAppointment` con unas `AdminRules`: antelación 0, horizonte de 365
    días, sin plazo, solo franjas futuras, servicio aunque esté inactivo y veterinario reservable
    que atienda el servicio (FR-021);
  - el formulario lleva `manage_version`; si no coincide, se avisa de que la cita cambió y se
    muestra su estado actual (FR-023);
  - la idempotencia sale del token de envío firmado y del `manage_version`: un reenvío ve la
    versión nueva y devuelve el mismo resultado sin otro correo;
  - los recordatorios y el enlace de gestión funcionan como en la 003, porque se reutilizan las
    funciones (FR-024).
- **Rationale**: un solo camino para cancelar y cambiar, con los mismos bloqueos, la misma
  exclusión GiST y los mismos correos.

## F12. Historial de la cita: tabla `appointment_events`

- **Decision**:
  - `appointment_events(id, appointment_id, at, kind created|rescheduled|cancelled, actor
    customer|guest_link|clinic_link|admin|system, admin_id null, from_starts_at, to_starts_at,
    from_staff_id, to_staff_id, note)`;
  - la escriben todos los caminos: reserva, `cancelOwn`, `rescheduleOwn`, el enlace de la
    clínica, el panel y el sistema;
  - la migración crea un `created` por cita y un `cancelled` por cada cita ya cancelada; los
    cambios anteriores a esta feature no se pueden reconstruir y se anota así;
  - `note` es la nota del administrador al cancelar (FR-020), de 0 a 300 caracteres; la
    anonimización la pone a `NULL`.
- **Rationale**: FR-006 y FR-010 piden quién, cuándo y qué cambió, y en `appointments` solo queda
  el último estado.

## F13. Registro de acciones del resto del panel: `admin_audit_log`

- **Decision**:
  - `admin_audit_log(id, at, actor_id null, actor_label null, action, entity_type, entity_id,
    changes jsonb)`;
  - `action` es un texto validado con Zod: `service.create`, `service.update`, `staff.create`,
    `staff.update`, `staff.hours`, `block.create`, `block.update`, `block.delete`,
    `role.grant`, `role.revoke`;
  - `changes` guarda solo campos de configuración (nombre de servicio, duración, días…), nunca
    datos de clientes;
  - `actor_id` tiene `ON DELETE SET NULL`.
  - Se consulta desde la base de datos; no hay pantalla de auditoría, porque los informes quedan
    fuera de alcance.
- **Rationale**: FR-006. Los logs de pino siguen llevando solo ids.

## F14. Herramienta de operación `npm run admin`

- **Decision**:
  - `scripts/admin.ts` llama a `src/lib/admin/cli.ts`, con el mismo patrón que `orders`;
  - órdenes: `list`, `grant <correo> --by "<quién>"` y `revoke <correo> --by "<quién>"`;
  - `grant` exige una cuenta existente y verificada;
  - se empaqueta en `cli/admin.mjs` con `scripts/build-cli.mjs`;
  - el correo no se escribe en los logs; la salida por terminal sí lo muestra, porque la ve el
    operador.
- **Rationale**: FR-004, sin gestión de usuarios en la web.

## F15. Interfaz: layout propio con `.account-grid` y componentes nuevos de agenda

- **Decision**:
  - se reutilizan la cabecera y el pie compartidos, `.account-grid` y `.side-nav` (Agenda,
    Servicios, Veterinarios, Bloqueos), `.tabs` (Día / Semana), `table.orders--stack`, `.badge`,
    `.badge--urgent` ("Fuera de horario"), `.badge--muted` ("Cancelada", "Servicio inactivo"),
    `.notice`, `.status-ok` y `.btn`;
  - componentes nuevos en `design/styles.css`, solo con tokens: `.admin-toolbar` (navegación de
    fechas y filtros), `.agenda-day` (una columna por veterinario, apiladas por debajo de 900 px),
    `.agenda-week` (7 columnas por veterinario, apiladas en móvil), `.agenda-slot`,
    `.agenda-slot--block` y `.agenda-slot--off` (tramo sin horario) y `.schedule-grid`
    (formulario semanal);
  - colores: guardar en marino; cancelar y borrar con `.btn--ghost` (fondo blanco, texto marino y
    borde fino, ya existe), nunca en cian ni rosa; el éxito en menta (FR-029);
  - "Mi cuenta" muestra el enlace "Panel de administración" solo si `is_admin`.
- **Rationale**: el panel no tiene maquetas en `design/` (principio I: se compone con los
  componentes existentes).

## F16. Navegación de la agenda por parámetros GET validados

- **Decision**:
  - `/admin/agenda?vista=dia|semana&fecha=AAAA-MM-DD&veterinario=<slug>&canceladas=1`, validado
    con Zod; un valor no válido cae al valor por defecto (hoy, semana actual, todos y sin
    canceladas);
  - la semana va de lunes a domingo, con Temporal en `Europe/Madrid`;
  - "anterior", "siguiente", "hoy" y "ir a fecha" son enlaces y un formulario GET, así que los
    filtros se conservan en la URL (FR-008);
  - las consultas van por rango `[inicio, fin)` sobre `appointments(starts_at)`; se añade el
    índice `(starts_at)` si no existe.

## F17. Privacidad

- El panel muestra los datos de contacto solo en el detalle de la cita (FR-010); la agenda enseña
  únicamente el nombre del responsable y el de la mascota.
- Las citas anonimizadas se muestran sin datos personales.
- La nota de cancelación lleva el aviso de no incluir datos de salud y sale en la exportación de
  datos del cliente: se añade `clinic_note` a cada cita, con `version: 4`.
- Al eliminar la cuenta, `appointment_events` sigue el borrado o la anonimización de su cita.
- No se registran las consultas del panel; queda fuera de alcance.

## F18. Tests imprescindibles de la feature

- **Unitarias**:
  - `availability` con horarios de veterinario, intersección y bloqueos;
  - `blocks`: expansión, semanales y cambio de hora;
  - `staff-schedule`: validación;
  - `outside-schedule`;
  - esquemas Zod del panel.
- **Integración**:
  - `admin-authz`: todas las acciones y rutas, con cliente, anónimo y rol retirado;
  - `admin-services` y `admin-staff-hours`, comprobando sus efectos en `slotsForDay`;
  - `admin-blocks`: `keep`, `cancel_all`, correos y cambio de las afectadas;
  - `admin-appointments`: cancelar, mover, versión obsoleta, idempotencia y carrera con una reserva;
  - `content-load-seed`: sembrar sin sobrescribir y `--force-booking`;
  - `admin-cli`.
- **E2E**:
  - `admin-access`;
  - `admin-agenda`: día, semana y filtros;
  - `admin-cancel-move` y `admin-block`, con el perfil sin JavaScript;
  - axe en todas las rutas de `/admin`;
  - teclado.
- **Flujos críticos afectados**: reserva de cita (cambia la disponibilidad), y registro e inicio de
  sesión (guardia). Se pasan `booking-*`, `cancel-reschedule`, `manage-link` y `login` (integración)
  y los e2e `us1`–`us4`. Lighthouse no aplica: no se tocan ni la portada ni el catálogo.
