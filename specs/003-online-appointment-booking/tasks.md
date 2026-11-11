# Tasks: Reserva de citas online

**Input**: documentos de diseño de `specs/003-online-appointment-booking/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **se incluyen**. La reserva de cita es un flujo crítico (principio III), y las reglas de
acceso (principio IV) y axe (principio V) forman parte de sus tests. Dentro de cada historia, las
pruebas se escriben **antes** que la implementación y deben fallar primero.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado una vez terminada la Fase 2. Las fixtures de la Fase 2 crean citas
directamente en la base de datos, así que US3–US5 no dependen de la interfaz de US1 ni de US2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: historia de usuario de la spec (US1–US5).

## Convenciones del proyecto

- Son las mismas de la 001 y la 002: un solo proyecto Next.js, estilos solo en `design/` y con
  tokens, textos en español e identificadores en inglés, y ningún dato de la clínica en `src/`.
- **Patrón de las acciones**: la lógica con efectos va en `src/lib/booking/<flujo>.ts` y devuelve
  un resultado discriminado (`ok | invalid | slot_taken | rate_limited | limit_reached | expired |
  not_found | out_of_window | already_cancelled | error`). La Server Action, en
  `src/app/**/actions.ts`, lo traduce a una redirección 303 (`?aviso=`) o a un estado de
  `useActionState`. Sigue el modelo de `src/lib/contact-submission.ts`.
- **Reloj**: toda la lógica recibe `now` (`getNow()` de `src/lib/clock.ts`). Los e2e fijan la hora
  con `x-test-now`.
- **Decisiones**: las referencias B1–B17 son de [research.md](./research.md). Los campos, mensajes
  y resultados están en [contracts/forms.md](./contracts/forms.md), las rutas y avisos en
  [contracts/routes.md](./contracts/routes.md) y los correos en
  [contracts/emails.md](./contracts/emails.md).

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Comprobar que la imagen de PostgreSQL de `docker-compose.yml` (desarrollo 5434 y pruebas 5433) y la de `deploy/` es la oficial `postgres:16`, que incluye `btree_gist`. Ejecutar `CREATE EXTENSION IF NOT EXISTS btree_gist` con el usuario de la aplicación en las dos bases locales y anotar el resultado en `deploy/README.md` (sección de migraciones).
- [X] T002 [P] Ampliar la regla `no-restricted-imports` de `eslint.config.mjs` para que `src/domain/` tampoco pueda importar `src/lib/booking/*`.

---

## Phase 2: Foundational (requisitos que bloquean todo)

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

### Esquema y migración

- [X] T003 Añadir a `src/db/schema.ts`:
  - los enums `appointment_status` (`confirmed`, `cancelled`), `appointment_actor` (`customer`, `clinic`, `system`) y `appointment_booked_as` (`guest`, `customer`);
  - las tablas `booking_settings`, `booking_services`, `booking_service_staff` y `appointments`, con las columnas, los `CHECK`, las FK (`RESTRICT` y `SET NULL`) y los índices de [data-model.md](./data-model.md).
- [X] T004 Modificar `email_outbox` en `src/db/schema.ts`: añadir los valores `appointment_confirmed`, `appointment_changed`, `appointment_cancelled`, `appointment_reminder` y `clinic_appointment` a `outbox_kind`, y la columna `appointment_id` (FK a `appointments.id`, `ON DELETE SET NULL`).
- [X] T005 Generar `drizzle/0002_appointments.sql` con `npm run db:generate` (tag `0002_appointments`) y añadir a mano:
  - al principio, `CREATE EXTENSION IF NOT EXISTS btree_gist;`;
  - al final, la restricción `appointments_no_overlap` (`EXCLUDE USING gist (team_member_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`).

  Comprobar que `npm run db:migrate` la aplica sobre una base de datos con datos de la 002 y que la base de pruebas también migra.

### Contenido y configuración

- [X] T006 Añadir el bloque `booking` (`rules` con sus valores por defecto y `services` de 1 a 20 elementos) a `src/content/schema.ts`, con las validaciones de [contracts/content-file.md](./contracts/content-file.md):
  - `slug` único;
  - duración múltiplo de 5, entre 5 y 480, que quepa en el tramo de horario más largo;
  - `staff` con slugs que existan en `team` y `service` que exista en `services`;
  - si `sections.reservas.href` no es nulo, el bloque es obligatorio.
- [X] T007 Implementar en `src/content/load.ts`:
  - el upsert de `booking_settings`;
  - el upsert de `booking_services` por `slug`, con `position` igual al índice y `unpublishMissing` para los que desaparecen;
  - el reemplazo completo de `booking_service_staff` de cada servicio.

  La carga no debe tocar nunca `appointments` (B15).
- [X] T008 Actualizar `content/petcare.yaml`: añadir el bloque `booking:` con las reglas por defecto y los 6 servicios de la demo (slugs, duraciones y profesionales de la tabla de contracts/content-file.md), y poner `sections.reservas.href: /pide-cita`.
- [X] T009 [P] Test de integración `tests/integration/content-booking.test.ts`. Comprobar que:
  - la carga crea los servicios, el reparto de profesionales y las reglas;
  - una segunda carga sin un servicio lo despublica sin tocar sus citas;
  - un `staff` inexistente o una duración no válida hacen fallar la carga con un mensaje claro.
- [X] T010 Crear `src/db/queries/booking-config.ts` con `getBookingConfig = cache(...)`. Devuelve las reglas, los servicios publicados con su duración y sus `staffIds`, los profesionales reservables (publicados, con `position`) y el horario y los cierres publicados, reutilizando `src/db/queries/site.ts`.

### Dominio puro

- [X] T011 [P] Test unitario `tests/unit/availability.test.ts`. Debe cubrir:
  - los tramos de mañana y tarde;
  - el último inicio válido de cada tramo (Cirugía de 60 min, no a las 13:30 si se cierra a las 14:00);
  - los cierres;
  - el domingo sin horario;
  - la antelación mínima de hoy y el horizonte;
  - un intervalo ocupado de un profesional que deja libre a otro;
  - "Sin preferencia" frente a un profesional concreto;
  - un día del cambio de hora (último domingo de octubre y de marzo);
  - `nextAvailableDate` con y sin hueco dentro del horizonte.
- [X] T012 Implementar `src/domain/availability.ts`: `availableSlots(input): Slot[]` y `nextAvailableDate(input): string | null`, con Temporal en `CLINIC_TZ` y `disambiguation: 'reject'` (B3). Los tipos `BookingRules`, `BookableService`, `BookableStaff`, `BusyInterval` y `Slot` son los de data-model.md y reutilizan `WeeklySlot` y `ClosureRange` de `src/domain/open-status.ts`.
- [X] T013 [P] Test unitario y luego implementación de `src/domain/assign-staff.ts`, con `assignStaff(freeStaffIds, dayLoad, staffOrder)`: elige el que tenga menos citas ese día y, si empatan, el de `position` menor (B4). El test va en `tests/unit/assign-staff.test.ts`.
- [X] T014 [P] Test unitario y luego implementación de `src/domain/appointment-view.ts`, con `appointmentView(row, now, cutoffHours)`. Devuelve el estado `confirmed`, `cancelled` o `done` y `canChange` (falso si está cancelada, ya pasada o a menos del plazo). El test va en `tests/unit/appointment-view.test.ts` y cubre el límite exacto de 24 h.
- [X] T015 [P] Test unitario y luego implementación de `src/domain/booking-schemas.ts`, con los esquemas Zod de los pasos 1 y 2 (query), del paso 3 (invitado y cliente, con y sin `otra`), de cancelar y de cambiar, con las reglas y mensajes de contracts/forms.md. Reutiliza el esquema de mascota de `src/domain/account-schemas.ts` para `fecha_nacimiento`. El test va en `tests/unit/booking-schemas.test.ts`.
- [X] T016 [P] Añadir la política `booking_origin` (5 cada 10 minutos, por origen) a `RATE_POLICIES` en `src/domain/rate-limit.ts` y su caso en `tests/unit/rate-limit.test.ts`.

### Infraestructura compartida

- [X] T017 Generalizar `src/email/account-outbox.ts` a `src/email/outbox.ts`:
  - `enqueueEmail(tx, { kind, to, email, customerId?, appointmentId? })` admite los `kind` de cita y conserva el límite de `LIMITED_KINDS` solo para los de cuenta;
  - `sendEmailsNow(ids)`;
  - `getEmailContext(db)` añade la dirección y el teléfono de la clínica.

  Actualizar las importaciones de `src/lib/account/*`. `npm run test:integration` debe seguir en verde sin cambiar los tests de cuenta.
- [X] T018 [P] Crear `src/lib/booking/manage-link.ts`, con `signManageToken({ appointmentId, version })` y `verifyManageToken(token)`. Es HMAC-SHA256 con una clave derivada `hmacHex(FORM_SECRET, 'appointment-manage')` sobre `src/lib/signing.ts` (B7). Su test unitario va en `tests/unit/manage-link.test.ts` y cubre la manipulación, otra cita y otra versión.
- [X] T019 [P] Crear `src/lib/booking/confirmation-ref.ts`, con `signConfirmationRef(appointmentId, now)` y `verifyConfirmationRef(ref, now)`, con caducidad de 2 h (B6). Su test unitario va en `tests/unit/confirmation-ref.test.ts`.
- [X] T020 Crear `src/db/queries/appointments.ts` con:
  - `busyIntervalsForDay(tx, dateIso)`: citas confirmadas de ese día, por profesional;
  - `dayLoad(tx, dateIso)`: número de citas por profesional;
  - `countActiveByEmail(tx, emailNormalized, now)` y `countActiveByCustomer(tx, customerId, now)`;
  - `insertAppointment(tx, values)`: devuelve la existente si `submission_id` está repetido;
  - `findAppointmentForUpdate(tx, id)`.
- [X] T021 Crear `src/lib/booking/transaction.ts`, con `withDayLocks(db, dateIsos, fn)`: abre la transacción, toma `pg_advisory_xact_lock(hashtext('booking:' || fecha))` en orden y traduce el error `23P01` a `{ status: 'slot_taken' }` (B2).
- [X] T022 [P] Añadir los códigos `hora-ocupada`, `cita-cancelada`, `cita-cambiada`, `fuera-de-plazo`, `cita-no-disponible` y `limite-citas`, con sus textos, a `NOTICES` en `src/lib/notice.ts`.
- [X] T023 [P] Añadir a `design/styles.css`, **solo con tokens**:
  - la variante de `.slot` para `input[type="radio"]` con su `label`: radio oculto accesible, `:checked` igual que `.is-selected`, `:focus-visible` y `:disabled`;
  - `.badge--muted`, para cancelada y realizada;
  - `.next-appointment`, para el bloque del resumen.

  Si falta algún valor, crear antes el token en `design/tokens.css`. `npm run check:design` debe pasar.
- [X] T024 Ampliar `tests/integration/helpers/db.ts`:
  - añadir `appointments`, `booking_service_staff`, `booking_services` y `booking_settings` a `truncateAll`;
  - añadir `seedBookingConfig()`, con 2 profesionales, 3 servicios, horario de lunes a viernes y un cierre;
  - añadir `createAppointment({ ... })`, para invitado o cliente y en cualquier estado.
- [X] T025 [P] Ampliar `tests/e2e/fixtures.ts` y `tests/e2e/db.ts`: una fixture `bookingClock` que fija `x-test-now` en un lunes laborable a las 09:00, y `createAppointmentInDb`, que reutiliza los helpers de T024.

**Checkpoint**: migración aplicada, contenido cargado y dominio probado. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Reservar una cita como invitado (Priority: P1) 🎯 MVP

**Goal**: un visitante sin cuenta reserva en tres pasos con el resumen visible, ve la confirmación y recibe el correo; la clínica recibe el suyo con el enlace de gestión.

**Independent Test**: sin sesión, reservar en una franja libre; comprobar la confirmación, los 2 correos en el buzón falso y que la franja deja de ofrecerse.

### Tests de US1 (antes de implementar; deben fallar)

- [X] T026 [P] [US1] Test de integración `tests/integration/booking-flow.test.ts` (invitado). Comprobar:
  - una reserva válida crea la cita y 2 correos (`appointment_confirmed` y `clinic_appointment`) en la misma transacción;
  - "Sin preferencia" asigna según B4;
  - un reenvío con el mismo `submission` no duplica nada;
  - un profesional que no atiende el servicio, una fecha pasada, una fecha fuera del horizonte y una hora fuera de la cuadrícula dan `invalid`;
  - el honeypot y un token demasiado rápido no crean nada.
- [X] T027 [P] [US1] Test de integración `tests/integration/booking-concurrency.test.ts`. Comprobar:
  - 20 `bookAppointment` simultáneos a la misma hora y con el mismo profesional dejan exactamente 1 confirmada y 19 `slot_taken` (SC-002);
  - 20 simultáneos con "Sin preferencia" y 2 profesionales dejan 2 confirmadas;
  - un `INSERT` directo solapado viola `appointments_no_overlap`.
- [X] T028 [P] [US1] Test de integración `tests/integration/booking-limits.test.ts`. Comprobar:
  - la sexta reserva desde el mismo origen en 10 minutos da `rate_limited`;
  - la cuarta cita futura con el mismo correo de invitado (sin importar mayúsculas) da `limit_reached`;
  - una cita cancelada no cuenta para el límite.
- [X] T029 [P] [US1] Test unitario `tests/unit/appointment-emails.test.ts` para `appointment-confirmed` (variante de invitado) y `clinic-appointment` (nueva). Comprobar:
  - el correo del invitado lleva el teléfono, el plazo y la indicación de llamar, y no lleva el motivo;
  - el de la clínica lleva el motivo y el enlace de gestión;
  - todo va escapado y hay versión de texto.
- [X] T030 [P] [US1] Test e2e `tests/e2e/us1-guest-booking.spec.ts` (mobile-360, desktop y no-js) con axe en cada paso. Comprobar:
  - el resumen se actualiza en cada paso;
  - un día sin horas ofrece el siguiente día disponible;
  - los errores aparecen junto al campo y se conservan los datos;
  - la confirmación muestra el profesional asignado;
  - los correos llegan al buzón falso;
  - una segunda pestaña ya no ve la hora reservada;
  - confirmar una hora ocupada desde una página antigua no redirige: vuelve a pintar el paso 3 con los datos escritos, el aviso `hora-ocupada` y las horas libres actualizadas, y se puede confirmar otra hora sin volver a escribir nada (también en no-js).

### Implementación de US1

- [X] T031 [P] [US1] Crear las plantillas `src/email/templates/appointment-confirmed.ts` (variantes de invitado y de cliente, y línea "inicia sesión la próxima vez" si se pasa `hasAccount`) y `src/email/templates/clinic-appointment.ts` (nueva, cambiada y cancelada; enlace de gestión salvo en las cancelaciones), según contracts/emails.md y sobre `account-layout.ts`.
- [X] T032 [US1] Implementar `src/lib/booking/book.ts` con `bookAppointment(form, ctx)`, siguiendo el orden de contracts/forms.md:
  1. Honeypot, token, `booking_origin` y Zod.
  2. `withDayLocks`: límite por correo, `availableSlots` recalculado, `assignStaff` e `insertAppointment`, con copias de mascota y contacto, `privacy_version` y `contact_email_normalized`.
  3. Encolar los 2 correos con `enqueueEmail`. Para `hasAccount`, consulta `customers.email_normalized` sin cambiar la respuesta.
  4. Devolver `{ status: 'ok', appointmentId, emailIds }`.

  Registrar en los logs solo ids y códigos.
- [X] T033 [P] [US1] Crear los componentes:
  - `src/components/BookingSteps.tsx`: `.steps` con `aria-current="step"`;
  - `src/components/BookingSummary.tsx`: `aside.summary` con servicio, profesional, mascota, fecha y hora, "—" en lo que falta y un enlace "Cambiar" por paso.
- [X] T034 [P] [US1] Crear los componentes:
  - `src/components/ServiceStep.tsx`: formulario GET con los `select` de servicio y profesional, este filtrado por servicio y con "Sin preferencia" por defecto;
  - `src/components/SlotPicker.tsx`: formulario GET con fecha (`min` y `max`), "Ver horas", `fieldset` de radios `.slot` con `legend` "Horas disponibles", estado vacío y enlace al siguiente día.
- [X] T035 [US1] Crear `src/components/DetailsStep.tsx` (variante de invitado): nombre y especie de la mascota (de `species`, más "Otra"), nombre y apellidos, teléfono, correo, motivo con el aviso de FR-010, privacidad sin marcar con el enlace a la política, campos ocultos, honeypot y token. Errores con `aria-describedby` y resumen enfocable. Botón `.btn--sky` "Confirmar cita".
- [X] T036 [US1] Crear `src/app/pide-cita/page.tsx`. Valida la query con `booking-schemas`, decide el paso según contracts/routes.md, calcula las horas con `getBookingConfig`, `busyIntervalsForDay` y `availableSlots`, y pinta `cart-layout` con el formulario y el resumen. Si `reservas.href` es nulo, devuelve 404. Lleva los metadatos en español.
- [X] T037 [US1] Crear `src/app/pide-cita/actions.ts` con `confirmAppointment`. Llama a `bookAppointment`, usa `after(() => sendEmailsNow(ids))`, y si el resultado es `ok`, hace un 303 a `/pide-cita/confirmada?ref=…`. Con `slot_taken`, **no redirige**: devuelve el estado con los `values` del paso 3 y las horas recalculadas de esa fecha, y `DetailsStep` pinta un `SlotPicker` (radio `hora`) dentro del mismo formulario con el aviso `hora-ocupada` (B5). El resto de resultados los traduce según contracts/forms.md.
- [X] T038 [US1] Crear `src/app/pide-cita/confirmada/page.tsx`. Con `verifyConfirmationRef` válido, muestra servicio, profesional, mascota, fecha, hora y dirección. Con un `ref` caducado o manipulado, muestra el mensaje genérico sin datos. Lleva `noindex` y `no-store`.
- [X] T039 [US1] Comprobar que la cabecera, el pie, `MobileNav`, la portada, los tratamientos y la clínica llevan a `/pide-cita` por `sectionHref('reservas')`, sin rutas escritas a mano, y ajustar el test e2e de "Próximamente" de la 001 si espera `/proximamente/reservas`.

**Checkpoint**: US1 funciona de punta a punta como MVP.

---

## Phase 4: User Story 2 - Reservar con sesión iniciada (Priority: P1)

**Goal**: el cliente elige entre sus mascotas o añade otra, ve sus datos ya rellenos y la cita queda asociada a su cuenta.

**Independent Test**: con una cuenta con dos mascotas, pulsar "Pedir cita" en una, reservar y comprobar que la mascota venía preelegida, los datos rellenos y la cita asociada.

### Tests de US2

- [X] T040 [P] [US2] Test de integración `tests/integration/booking-customer.test.ts`. Comprobar:
  - una cita con una mascota propia queda con `customer_id` y `pet_id`;
  - con una mascota ajena da `not_found` y no crea nada;
  - con "Otra mascota" crea la mascota y la cita en la misma transacción, y respeta `MAX_PETS`;
  - sin teléfono en la cuenta, el teléfono es obligatorio y no se guarda en la cuenta;
  - el nombre y el correo salen de la cuenta aunque el formulario traiga otros;
  - el límite de 9 citas activas por cliente.
- [X] T041 [P] [US2] Test e2e `tests/e2e/us2-customer-booking.spec.ts` (mobile-360, desktop y no-js) con axe. Comprobar:
  - "Pedir cita" desde una mascota la deja preelegida;
  - los datos aparecen rellenos y el correo es de solo lectura;
  - "Otra mascota…" pide los datos de la 002 y la mascota aparece después en "Mis mascotas";
  - el correo de confirmación lleva la variante de cliente.

### Implementación de US2

- [X] T042 [US2] Ampliar `src/lib/booking/book.ts` con la rama de cliente (`ctx.customer`):
  - comprobar la mascota con `readOwnPet`;
  - crear la mascota nueva con la lógica de `src/lib/account/pets.ts` dentro de la misma transacción;
  - tomar el contacto de la cuenta;
  - aplicar el límite por `customer_id`;
  - `booked_as = 'customer'` y la variante de cliente del correo.
- [X] T043 [US2] Ampliar `src/components/DetailsStep.tsx` con la variante de cliente: `select` de mascotas (nombre y especie) más "Otra mascota…", los campos de mascota nueva (los de `PetForm`) mostrados solo con `otra` (sin JavaScript: un GET con `mascota=otra`), nombre y correo de solo lectura y teléfono relleno u obligatorio. Para invitados, el enlace "Inicia sesión para elegir entre tus mascotas guardadas" con `return_to=/pide-cita?…`.
- [X] T044 [US2] En `src/app/pide-cita/page.tsx` y `actions.ts`, usar `getOptionalCustomer()`, preelegir `?mascota=<id>` solo si la mascota es suya (si no, se ignora en silencio) y pasar el cliente a `bookAppointment`.
- [X] T045 [P] [US2] Cambiar "Pedir cita" en `src/components/PetCard.tsx` (y donde se use en `src/app/mi-cuenta/`) a `` `${sectionHref('reservas')}?mascota=${id}` ``, que mantiene "Próximamente" si la sección está desactivada.

**Checkpoint**: US1 y US2 funcionan por separado.

---

## Phase 5: User Story 3 - Ver mis citas (Priority: P1)

**Goal**: "Mis citas" muestra las próximas y las anteriores con su estado, y el resumen de la cuenta muestra la próxima cita.

**Independent Test**: con una cita futura, una pasada y una cancelada creadas por fixture, comprobar el orden, los datos y los estados, y que las citas ajenas no se ven.

### Tests de US3

- [X] T046 [P] [US3] Test de integración `tests/integration/appointments-authz.test.ts`. Comprobar que:
  - `listCustomerAppointments` solo devuelve las del cliente;
  - leer, cancelar o cambiar el id de una cita ajena da `not_found`;
  - una cita de invitado con el mismo correo no aparece (Q2);
  - una mascota eliminada conserva `pet_name` en la lista.
- [X] T047 [P] [US3] Test e2e `tests/e2e/us3-my-appointments.spec.ts` (mobile-360, desktop y no-js) con axe. Comprobar:
  - los bloques "Próximas" (la más cercana primero) y "Anteriores" (la más reciente primero) con los estados Confirmada, Cancelada y Realizada;
  - el estado vacío con el enlace a "Pide cita";
  - "Tu próxima cita" en `/mi-cuenta`;
  - `aria-current="page"` en "Mis citas";
  - un 404 al cambiar el id en la URL.

### Implementación de US3

- [X] T048 [US3] Añadir a `src/db/queries/appointments.ts` las funciones `listCustomerAppointments(customerId)` (con servicio y profesional), `nextCustomerAppointment(customerId, now)` y `readOwnAppointment(customerId, id)`.
- [X] T049 [P] [US3] Crear `src/components/AppointmentStatus.tsx` (`.badge` para confirmada y `.badge--muted` para cancelada y realizada), `src/components/AppointmentList.tsx` (`table.orders` con mascota, servicio, profesional, fecha, hora y estado, más las acciones o el teléfono según `canChange`) y `src/components/NextAppointment.tsx`.
- [X] T050 [US3] Crear `src/app/mi-cuenta/citas/page.tsx` con las dos listas y el estado vacío (`.empty-state`). Lleva `no-store`, `noindex` y `requireCustomer()` (del layout).
- [X] T051 [US3] En `src/app/mi-cuenta/layout.tsx`, pasar `appointmentsHref` como `/mi-cuenta/citas` si `reservas.href` no es nulo, o como `sectionHref('reservas')` si lo es (B14). En `src/app/mi-cuenta/page.tsx`, añadir `NextAppointment`.
- [X] T052 [US3] Ampliar `src/domain/account-export.ts` (`AccountExportInput` y `buildAccountExport`) y `src/lib/account/export.ts` con la clave `citas` de [contracts/export-format.md](./contracts/export-format.md), y sus casos en `tests/unit/account-export.test.ts` y `tests/integration/export.test.ts`.

**Checkpoint**: las tres historias P1 están completas.

---

## Phase 6: User Story 4 - Cancelar o cambiar desde la cuenta (Priority: P2)

**Goal**: el cliente cancela o cambia una cita futura hasta 24 h antes; la franja anterior queda libre. Eliminar una mascota o la cuenta cancela sus citas futuras.

**Independent Test**: cancelar una cita y comprobar que su franja vuelve a ofrecerse; cambiar otra y comprobar que la antigua queda libre y la nueva ocupada; intentar ambas cosas a menos de 24 h.

### Tests de US4

- [X] T053 [P] [US4] Test de integración `tests/integration/cancel-reschedule.test.ts`. Comprobar:
  - cancelar dentro de plazo deja la cita `cancelled` con `cancelled_by = 'customer'`, incrementa `manage_version`, la hora vuelve a `availableSlots` y se encolan 2 correos;
  - fuera de plazo da `out_of_window`;
  - cancelar dos veces da `already_cancelled`;
  - un cambio a una hora libre es atómico (la antigua queda libre y la nueva ocupada);
  - un cambio a una hora que se ocupa en paralelo da `slot_taken` y la cita conserva la original;
  - un cambio a otro día toma los dos bloqueos en orden;
  - un cambio a la misma hora no hace nada y no envía correo.
- [X] T054 [P] [US4] Test de integración `tests/integration/delete-cascade.test.ts`. Comprobar que:
  - eliminar una mascota cancela sus citas futuras (`customer`) y avisa a la clínica, y las pasadas conservan `pet_name` con `pet_id` nulo;
  - eliminar la cuenta cancela las futuras (`system`) sin correo al cliente y anonimiza todas sus citas (`contact_*` y `reason` nulos, `anonymized_at` y `customer_id` nulo);
  - la franja liberada vuelve a ofrecerse.
- [X] T055 [P] [US4] Ampliar `tests/unit/appointment-emails.test.ts` con `appointment-changed` (con la fecha anterior y la nueva) y `appointment-cancelled` (variantes de cliente y de clínica).
- [X] T056 [P] [US4] Test e2e `tests/e2e/us4-cancel-reschedule.spec.ts` (mobile-360, desktop y no-js) con axe. Comprobar:
  - cancelar con la página de confirmación;
  - cambiar con el paso de fecha y hora con el servicio fijo;
  - los avisos `cita-cancelada` y `cita-cambiada`;
  - una cita a menos de 24 h (con `x-test-now`) muestra el teléfono y no tiene acciones;
  - los avisos de citas que se cancelarán al eliminar una mascota y la cuenta.

### Implementación de US4

- [X] T057 [P] [US4] Crear las plantillas `src/email/templates/appointment-changed.ts` y `src/email/templates/appointment-cancelled.ts` según contracts/emails.md.
- [X] T058 [US4] Implementar `src/lib/booking/cancel.ts`, con `cancelAppointment(tx, id, actor, now, { enforceCutoff })`: hace `findAppointmentForUpdate`, comprueba el estado y el plazo, pasa la cita a `cancelled`, incrementa `manage_version` y encola los correos (al responsable salvo si cancela `system`, y siempre a la clínica). Añadir los envoltorios `cancelOwnAppointment(customerId, id, ctx)` y `cancelForSystem`.
- [X] T059 [US4] Implementar `src/lib/booking/reschedule.ts`, con `rescheduleAppointment(id, { fecha, profesional, hora }, actor, ctx)`:
  - `withDayLocks` sobre el día antiguo y el nuevo;
  - recalcular la disponibilidad excluyendo la propia cita;
  - asignar el profesional;
  - `UPDATE` de la misma fila (`team_member_id`, `starts_at` y `ends_at`) con `manage_version + 1`;
  - encolar `appointment_changed` y `clinic_appointment` (cambiada).

  Añadir el envoltorio `rescheduleOwnAppointment` con la comprobación de propiedad y de plazo.
- [X] T060 [US4] Crear `src/app/mi-cuenta/citas/[id]/cancelar/page.tsx` (confirmación con "Sí, cancelar la cita" en `.btn` y "Volver") y `src/app/mi-cuenta/citas/[id]/cambiar/page.tsx` (reutiliza `SlotPicker` y el selector de profesional con el servicio fijo, y lleva el resumen de la cita actual).
- [X] T061 [US4] Crear `src/app/mi-cuenta/citas/actions.ts` con `cancelOwnAppointment` y `rescheduleOwnAppointment`, que hacen un 303 con `?aviso=` según contracts/routes.md, usan `after(() => sendEmailsNow(ids))` y responden 404 si la cita es ajena.
- [X] T062 [US4] Ampliar `processDeletePet` en `src/lib/account/pets.ts` para cancelar las citas futuras de la mascota con `cancelAppointment(..., 'customer', ...)` en la misma transacción. Añadir el aviso "Tiene N citas próximas que se cancelarán" en `src/app/mi-cuenta/mascotas/[id]/eliminar/page.tsx`.
- [X] T063 [US4] Ampliar `processDeleteAccount` en `src/lib/account/delete-account.ts`: antes del `delete customers`, cancelar las citas futuras con `cancelForSystem` y anonimizar todas las citas de la cuenta. Añadir el aviso en `src/app/mi-cuenta/eliminar-cuenta/page.tsx` y actualizar el texto de lo que se elimina en el correo `account-deleted` si lo menciona.

**Checkpoint**: US4 funciona y las franjas se liberan.

---

## Phase 7: User Story 5 - Gestión por la clínica de las citas de invitado (Priority: P2)

**Goal**: la clínica cancela o cambia cualquier cita futura (la del invitado que llama o la de un cliente fuera de plazo) con el enlace firmado de su correo.

**Independent Test**: reservar como invitado, abrir el enlace del correo de la clínica, cancelar, comprobar que la franja vuelve a estar libre y que el mismo enlace ya no sirve.

### Tests de US5

- [X] T064 [P] [US5] Test de integración `tests/integration/manage-link.test.ts`. Comprobar que:
  - un token válido permite cancelar sin aplicar el plazo y deja `cancelled_by = 'clinic'`, con el correo al invitado;
  - un cambio genera un correo a la clínica con un token nuevo, y el antiguo da "no válido" (versión);
  - un token manipulado, de una cita pasada o de una cita cancelada no muestra datos;
  - cada uso queda en el log solo con el id de la cita y el resultado.
- [X] T065 [P] [US5] Test e2e `tests/e2e/us5-clinic-manage.spec.ts` (mobile-360, desktop y no-js) con axe. Comprobar:
  - abrir el enlace desde el correo falso;
  - la página muestra la cita y no cancela nada solo por abrirse;
  - cancelar y cambiar;
  - el enlace reutilizado muestra "Este enlace ya no es válido";
  - las cabeceras `Referrer-Policy: no-referrer`, `no-store` y `noindex`;
  - el correo del invitado indica que llame a la clínica, con su teléfono.

### Implementación de US5

- [X] T066 [US5] Crear `src/lib/booking/clinic-manage.ts`, con `readManagedAppointment(token, now)` (`verifyManageToken` más la comprobación de estado, futuro y `manage_version`), `clinicCancel(token, ctx)` y `clinicReschedule(token, input, ctx)`. Reutilizan `cancelAppointment` y `rescheduleAppointment` con `actor = 'clinic'` y `enforceCutoff = false`, y registran cada uso.
- [X] T067 [US5] Crear `src/app/gestion-cita/[token]/page.tsx` (datos de la cita con "Cancelar cita" y "Cambiar fecha u hora", o "Este enlace ya no es válido"), `src/app/gestion-cita/[token]/cambiar/page.tsx` (`SlotPicker` con el servicio fijo y el selector de profesional) y `src/app/gestion-cita/[token]/actions.ts` (`clinicCancelAppointment` y `clinicRescheduleAppointment`, que redirigen al token nuevo tras un cambio).
- [X] T068 [US5] Añadir en `src/middleware.ts` (o en la configuración de cabeceras de `next.config.ts`, donde ya estén las de seguridad) `Referrer-Policy: no-referrer`, `Cache-Control: private, no-store` y `X-Robots-Tag: noindex` para `/gestion-cita/*`.

**Checkpoint**: todas las historias funcionan por separado.

---

## Phase 8: Recordatorio por correo (transversal, FR-034, principio VIII)

**Goal**: cada cita confirmada recibe un único recordatorio por correo con la antelación configurada (24 h por defecto), que se vuelve a programar si la cita cambia.

**Independent Test**: con `now` fijado, crear por fixture citas a 23 h, a 30 h, cancelada y reservada tarde; ejecutar una pasada de `email:dispatch` y comprobar que solo la primera recibe el recordatorio.

- [X] T069 [P] Ampliar `tests/unit/appointment-emails.test.ts` con `appointment-reminder` (variantes de invitado y de cliente): lleva los datos de la cita y las instrucciones para cancelar o cambiar, no lleva el motivo, va escapado y tiene versión de texto.
- [X] T070 [P] Test de integración `tests/integration/reminders.test.ts`. Comprobar que `enqueueDueReminders`:
  - encola `appointment_reminder` y marca `reminder_sent_at` en la misma transacción para las citas confirmadas que empiezan dentro de `reminder_hours_before`;
  - no encola las canceladas, las ya recordadas ni las reservadas con menos antelación que la configurada;
  - con dos pasadas simultáneas no duplica ningún recordatorio;
  - tras un cambio de cita (`reminder_sent_at` a `NULL`) vuelve a recordar la nueva hora;
  - con `reminder_hours_before = 0` no hace nada.
- [X] T071 [P] Crear la plantilla `src/email/templates/appointment-reminder.ts` según contracts/emails.md, sobre `account-layout.ts` y con las mismas variantes de instrucciones que `appointment-confirmed.ts`.
- [X] T072 Implementar `src/lib/booking/reminders.ts` con `enqueueDueReminders(db, now)` (B17): selección con `FOR UPDATE SKIP LOCKED`, encolado con `enqueueEmail` y marca de `reminder_sent_at`, devolviendo los ids encolados. Comprobar que `rescheduleAppointment` (`src/lib/booking/reschedule.ts`, T059) pone `reminder_sent_at` a `NULL`.
- [X] T073 Llamar a `enqueueDueReminders` al principio de cada pasada en `scripts/email-dispatch.ts` y en su versión de producción `cli/` que lanza `deploy/systemd/petcare-email-dispatch.service`. Comprobar que `deploy/systemd/petcare-email-dispatch.timer` se ejecuta al menos cada 15 minutos (si no, ajustarlo) y anotarlo en `deploy/README.md`.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T074 [P] Test de integración `tests/integration/retention-appointments.test.ts` y luego la ampliación de `purgeExpired` en `src/db/retention.ts`. Debe:
  - anonimizar las citas de invitado con `starts_at` de hace más de `retention_months` (FR-030);
  - borrar los correos de cita no pendientes a las 24 h;
  - no tocar las citas de cliente ni las de invitado recientes.
- [X] T075 [P] Test e2e `tests/e2e/booking-keyboard.spec.ts` en escritorio y no-js (SC-006). Con **solo el teclado**, hacer la reserva de invitado, la de cliente, la cancelación y el cambio, comprobar el foco visible y comprobar el foco en el resumen de errores tras un envío inválido.
- [X] T076 [P] Ampliar `tests/e2e/security-headers.spec.ts` con `no-store` y `noindex` en `/pide-cita/confirmada`, `/mi-cuenta/citas/*` y `/gestion-cita/*`.
- [X] T077 [P] Ampliar `tests/unit/no-pii-logs.test.ts` para recorrer también `src/lib/booking/`: falla si se registran `contact_name`, `contact_email`, `contact_phone`, `reason`, `pet_name` o el token.
- [X] T078 [P] Ampliar `tests/unit/no-design-copy.test.ts` para que falle si aparecen en `src/` o en `content/` los textos de ejemplo de `design/cita.html` ("Dra. María García", "Dr. Javier Ruiz", "Dra. Laura Pérez", "Toby (perro)").
- [X] T079 [P] Actualizar `deploy/README.md` (migración `0002` con `btree_gist`, recarga del contenido con `booking:` y anonimización de citas en el temporizador de purga existente) y `.env.example` (no hay variables nuevas; documentar que `FORM_SECRET` firma también los enlaces de gestión y que cambiarlo los invalida).
- [X] T080 Actualizar `CLAUDE.md` (estado de la 003: implementada; migración `0002_appointments`) y anotar las desviaciones encontradas en `specs/003-online-appointment-booking/checklists/requirements.md`.
- [X] T081 Ejecutar [quickstart.md](./quickstart.md) completo, con y sin JavaScript, y después `npm run lint`, `npm test`, `npm run test:integration` y `npm run test:e2e`.

---

## Dependencies & Execution Order

### Fases

- **Setup (F1)** no tiene dependencias.
- **Foundational (F2)** depende de F1 y **bloquea** todas las historias. Dentro de F2:
  - T003 y T004 van antes que T005;
  - T005 va antes que T007, T009, T010, T020, T021 y T024;
  - T006 va antes que T007 y T007 antes que T008 y T009;
  - T011 va antes que T012;
  - T017 va antes que cualquier plantilla nueva.
- **Historias (F3–F7)**: dependen solo de F2, gracias a las fixtures T024 y T025.
- **Recordatorio (F8)** depende de F2. T072 se apoya en `reschedule.ts` de US4 (T059); si se hace antes, T059 debe incluir la puesta a `NULL` de `reminder_sent_at`.
- **Polish (F9)** va después de las historias que se quieran entregar.

### Dependencias reales entre historias

- **US2** amplía `book.ts`, `DetailsStep.tsx` y `pide-cita/page.tsx` de **US1**, así que va después
  de US1.
- **US4** usa `AppointmentList` de **US3** para mostrar las acciones (T049). Si se hace antes, las
  rutas de cancelar y cambiar se prueban por URL directa.
- **US5** reutiliza `cancel.ts` y `reschedule.ts` de **US4** (T058 y T059), y `SlotPicker` de US1.
- **US3** es independiente: sus citas vienen de las fixtures.

### Dentro de cada historia

Tests (que fallan) → consultas y dominio → `src/lib/booking/*` → componentes → páginas y acciones.

## Parallel Examples

```text
# F2: en cuanto T005 está aplicada
T011 availability.test · T013 assign-staff · T014 appointment-view · T015 booking-schemas · T016 rate-limit · T018 manage-link · T019 confirmation-ref · T022 notice · T023 styles

# US1: tests a la vez
T026 booking-flow · T027 booking-concurrency · T028 booking-limits · T029 appointment-emails · T030 us1-guest-booking.spec

# Con F2 terminada, en paralelo por personas o agentes
US1 (T026–T039) · US3 (T046–T052) · F8 T069–T071 (plantilla y tests del recordatorio)
```

## Implementation Strategy

1. **MVP** con F1, F2 y US1: la reserva de invitado con disponibilidad real, sin dobles reservas,
   con los correos y con todos los tests del flujo crítico (principio III) en verde. Ya se puede
   activar `reservas.href`.
2. **+ US2 y US3**: la reserva con cuenta y "Mis citas". Completan las historias P1.
3. **+ US4, US5 y el recordatorio (F8)**: cancelar, cambiar y recordar. El recordatorio es **obligatorio** antes de publicar (principio VIII). US5 es **obligatoria** antes de publicar, porque sin ella la
   clínica no puede liberar las franjas que piden por teléfono.
4. **+ Polish**: la retención (obligatoria antes de producción por RGPD), la validación del
   quickstart y la definición de "terminado".

## Notes

- Ninguna tarea añade datos de la clínica en `src/`. Los servicios, los profesionales y las reglas
  van en `content/petcare.yaml`.
- "Pide cita" y "Pedir cita" pasan **siempre** por `sectionHref('reservas')`.
- Lighthouse no aplica, porque la feature no toca la portada ni el catálogo.
- Los commits se hacen solo cuando el responsable lo pide.
