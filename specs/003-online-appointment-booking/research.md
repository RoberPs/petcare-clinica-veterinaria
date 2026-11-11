# Research: Reserva de citas online

Decisiones **B1–B17** de la feature 003. Siguen vigentes las R1–R17 (001) y A1–A14 (002); aquí
solo se anota lo nuevo o lo que cambia.

## B1. Configuración reservable separada del catálogo público

- **Decision**: tablas nuevas `booking_services` (nombre, duración, orden, publicado y enlace
  opcional a un `services` público) y `booking_service_staff` (qué miembro del equipo atiende qué
  servicio), más el singleton `booking_settings` con las reglas. Se cargan desde un bloque
  `booking:` en `content/<clinica>.yaml`. Un miembro del equipo es reservable si atiende al menos
  un servicio.
- **Rationale**: los servicios reservables ("Vacunación", "Otro") no coinciden uno a uno con los 8
  tratamientos publicados. Mezclarlos en `services` obligaría a publicar "Otro" como tratamiento o
  a llenar la tabla de columnas nulas.
- **Alternatives considered**: columnas `bookable` y `duration_minutes` en `services` (no admite
  "Otro" ni nombres distintos); reglas en `clinic` (mezcla datos de contacto con reglas de agenda).

## B2. Sin dobles reservas: restricción de exclusión y bloqueo por día

- **Decision**: `appointments` tiene una restricción `EXCLUDE USING gist (team_member_id WITH =,
  tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status = 'confirmed')`, con la extensión
  `btree_gist`. Además, cada reserva y cada cambio toma `pg_advisory_xact_lock` sobre la clave
  `booking:<AAAA-MM-DD>` del día afectado (dos en un cambio de día, en orden), vuelve a calcular la
  disponibilidad dentro de la transacción e inserta. Un `23P01` (exclusión violada) se traduce a
  `slot_taken`.
- **Rationale**: la restricción hace imposible el solape aunque haya un fallo de lógica (SC-002); el
  bloqueo por día serializa la asignación de "Sin preferencia" para que el reparto por carga sea
  correcto. El volumen de una clínica (decenas de citas al día) hace que el bloqueo no sea un
  cuello de botella.
- **Alternatives considered**: solo el bloqueo (sin defensa en la base de datos); solo la
  restricción (la asignación por carga podría elegir mal bajo concurrencia); tabla de huecos
  pre-generados (hay que regenerarla al cambiar horario, duración o cuadrícula).
- **Nota**: `btree_gist` es una extensión *trusted* desde PostgreSQL 13, la crea el dueño de la
  base de datos sin superusuario. Drizzle no modela `EXCLUDE`, así que va en SQL dentro de la
  migración `0002_appointments` y se comprueba con un test de integración.

## B3. Cálculo de disponibilidad en `src/domain/`

- **Decision**: función pura `availableSlots({ date, service, staff, weeklyHours, closures, busy,
  rules, now })` en `src/domain/availability.ts`. Recorre cada tramo del horario del día en pasos
  de `slot_step_minutes` desde la apertura; un inicio vale si `inicio + duración ≤ cierre del
  tramo`, si respeta la antelación mínima y el horizonte, y si al menos un profesional elegible no
  tiene un intervalo ocupado que se solape. Devuelve, por hora, la lista de profesionales libres.
  `nextAvailableDate` busca el siguiente día con huecos hasta el horizonte.
- **Rationale**: se prueba sin base de datos (DST, cierres, último hueco del tramo) y es la misma
  función que se usa al mostrar y al confirmar.
- **Alternatives considered**: calcularlo en SQL con `generate_series` (difícil de probar y de
  mantener alineado con la vista).
- **Horas y DST**: los inicios se generan en hora local de `Europe/Madrid` con Temporal y se
  convierten a instantes. El horario de la clínica nunca cae en la franja del cambio de hora, y si
  cayera, `disambiguation: 'reject'` descarta el inicio inexistente.

## B4. Asignación de "Sin preferencia"

- **Decision**: entre los profesionales libres en esa hora, el que tenga menos citas confirmadas
  ese día; empate por `team_members.position`. Se decide dentro de la transacción de B2.
- **Rationale**: reparte la carga y es determinista para los tests.
- **Alternatives considered**: aleatorio (no reproducible); siempre el primero (sobrecarga).

## B5. Flujo en tres pasos que funciona sin JavaScript

- **Hora ocupada al confirmar**: la acción **no redirige**. Devuelve el estado `slot_taken` con
  los datos del paso 3 y vuelve a pintar ese paso con un `SlotPicker` dentro, con las horas
  recalculadas de la misma fecha y el aviso `hora-ocupada`. El visitante elige otra hora y
  confirma sin volver a escribir nada, también sin JavaScript. Una redirección perdería los datos,
  y meterlos en la URL expondría datos personales.
- **Decision**: una sola ruta `/pide-cita`. Los pasos 1 (servicio y profesional) y 2 (fecha y hora)
  son formularios **GET**: su estado viaja en la query (`servicio`, `profesional`, `fecha`, `hora`,
  `mascota`) y el servidor pinta el paso que toca y el resumen. El paso 3 (mascota y tus datos) es
  un **POST** con Server Action y PRG. Las horas son `input type="radio"` con aspecto `.slot`.
  Con JavaScript se puede mejorar (enviar el GET al cambiar la fecha), pero no es necesario.
- **Rationale**: coincide con los tres pasos de `design/cita.html`; ningún dato personal viaja en
  la URL (los datos de la mascota del invitado van en el paso 3); los enlaces "Cambiar" del
  resumen son enlaces GET normales.
- **Alternatives considered**: un único formulario largo (la lista de horas depende del servicio y
  la fecha, sin JS habría que recargar igual); asistente con estado en cookie (más complejo y
  frágil con varias pestañas).
- **Sin retención de franja**: no se reserva la hora al elegirla; se comprueba al confirmar (casos
  límite de la spec).

## B6. Idempotencia y página de confirmación

- **Decision**: el paso 3 lleva el token firmado de la 001 (`createSubmissionToken`), y
  `appointments.submission_id` es `UNIQUE`, como `contact_messages`. Un reenvío devuelve la cita
  ya creada. La confirmación es `/pide-cita/confirmada?ref=<firmado>`, con el id de la cita y una
  caducidad de 2 h firmados con `FORM_SECRET`. Pasado ese tiempo, la página dice que la cita está
  confirmada y remite al correo (o a "Mis citas"), sin datos.
- **Rationale**: sigue el patrón probado del contacto; la URL de confirmación no da acceso
  indefinido a los datos de la cita.
- **Alternatives considered**: `processed_submissions` (innecesario si la cita ya tiene la columna
  única); cookie flash (se pierde al recargar).

## B7. Enlace de gestión para la clínica (FR-027)

- **Decision**: token **sin estado**: `sign({ a: appointmentId, v: manage_version, p: 'clinic' })`
  con HMAC-SHA256 y una clave derivada `hmac(FORM_SECRET, 'appointment-manage')`. Ruta
  `/gestion-cita/[token]`: el GET muestra la cita y las acciones; cancelar y cambiar son POST con
  confirmación. Es válido mientras la cita esté confirmada, sea futura y `manage_version`
  coincida; cada cambio o cancelación incrementa `manage_version`, así que solo funciona el enlace
  del último correo. Cada uso se registra con el id de la cita y el resultado. La página lleva
  `noindex`, `no-store` y `Referrer-Policy: no-referrer`.
- **Rationale**: no hace falta guardar tokens ni purgarlos; caduca solo cuando la cita se cancela o
  pasa; invalidar enlaces antiguos es gratis con la versión.
- **Alternatives considered**: tokens aleatorios con hash en `account_tokens` (más tablas y purgas
  para lo mismo); enlace en el correo del cliente (descartado en la clarificación).

## B8. Correos de cita

- **Decision**: nuevos `outbox_kind`: `appointment_confirmed`, `appointment_changed`,
  `appointment_cancelled` (al responsable) y `clinic_appointment` (a `clinic.inbox_email`, con la
  acción nueva/cambiada/cancelada). Se encolan en la misma transacción que la cita con un
  `enqueueEmail` generalizado a partir de `enqueueAccountEmail` (payload ya renderizado, A8) y se
  intenta el envío al terminar con `after()`. No se suman a `LIMITED_KINDS`: el límite lo pone la
  reserva (B9). El correo al responsable no incluye el motivo; el de la clínica sí, junto al
  enlace de gestión (no en las cancelaciones). Se añade la columna `appointment_id` (FK `SET
  NULL`) a `email_outbox` para trazar y para purgar.
- **Rationale**: reutiliza la bandeja de salida y los reintentos de la 001.
- **Alternatives considered**: archivo `.ics` adjunto (útil pero fuera del alcance pedido; se puede
  añadir sin cambiar el modelo).

## B9. Anti-abuso de la reserva

- **Decision**: política `booking_origin` (5 cada 10 minutos por origen, como el contacto) para
  invitados y clientes; honeypot `web` y antigüedad mínima del token (3 s) como en la 001. Máximo de
  citas futuras confirmadas por `contact_email_normalized` (invitados) y por `customer_id`
  (clientes): `max_active_per_email` (3) para invitados y `max_active_per_customer` (9) para
  clientes, ambos configurables (FR-016). Se cuenta dentro de la transacción, bajo el bloqueo de
  B2.
- **Rationale**: un formulario público que ocupa agenda real es un vector de abuso evidente.
- **Alternatives considered**: CAPTCHA (recurso de terceros antes del consentimiento, prohibido).

## B10. Estados de la cita

- **Decision**: `status` ∈ {`confirmed`, `cancelled`} y `cancelled_by` ∈ {`customer`, `clinic`,
  `system`}. "Realizada" se deduce (`confirmed` y `ends_at ≤ ahora`); no hay tarea programada que
  cambie estados.
- **Rationale**: lo mínimo que exige la spec; "no presentado" está fuera de alcance.

## B11. Datos copiados en la cita

- **Decision**: la cita guarda una copia de `pet_name`, `pet_species_label`, `contact_name`,
  `contact_email` y `contact_phone`, también para clientes. `pet_id` y `customer_id` son FK con
  `ON DELETE SET NULL`.
- **Rationale**: "Mis citas" muestra el nombre que tenía la mascota (US3), los correos de cambio y
  los de la clínica no dependen de que la ficha siga igual, y la cita sobrevive a borrar especies.

## B12. Eliminar mascota o cuenta, y retención

- **Decision**:
  - **Eliminar mascota**: antes se avisa si tiene citas futuras; al confirmar, en la misma
    transacción, sus citas futuras pasan a `cancelled` (`customer`) con correo a la clínica, y luego
    se borra la mascota.
  - **Eliminar cuenta**: igual con todas las citas futuras (`cancelled_by = system`, correo a la
    clínica, no al cliente, que ya recibe el de cuenta eliminada); después todas sus citas se
    anonimizan (`contact_*` y `reason` a `NULL`, `anonymized_at`) y el borrado de `customers` pone
    `customer_id` a `NULL`.
  - **Retención**: `purgeExpired` anonimiza las citas de invitado cuya `starts_at` tenga más de
    `retention_months` (12). Los correos de cita no pendientes se purgan a las 24 h, como los de
    cuenta.
- **Rationale**: FR-029 y FR-030; la clínica conserva la ocupación histórica sin datos personales.

## B13. Plazo de cancelación y cambio

- **Decision**: el cliente puede actuar si `starts_at − ahora ≥ change_cutoff_hours` (24 h),
  comprobado en la vista y otra vez en la transacción con `SELECT … FOR UPDATE`. El enlace de la
  clínica no aplica el plazo. El cambio actualiza la misma fila (servicio fijo, nuevos profesional,
  inicio y fin) e incrementa `manage_version`: la franja antigua queda libre en el mismo `UPDATE`
  y la restricción de exclusión protege la nueva.

## B14. Enlaces de la web

- **Decision**: `reservas.href = /pide-cita` en el YAML (sin tocar `sectionHref`). `AccountNav`
  pasa a recibir `/mi-cuenta/citas` cuando `reservas` tiene `href`, y `/proximamente/reservas`
  si no. "Pedir cita" de una mascota enlaza a `/pide-cita?mascota=<id>`. El resumen de la cuenta
  añade "Tu próxima cita".
- **Rationale**: una clínica que no quiera reserva online la desactiva con `href: null`.

## B15. Cambios de configuración con citas existentes

- **Decision**: la carga de contenido nunca toca `appointments`. Un servicio reservable o un
  profesional que desaparece del YAML queda `published=false` (no se ofrece) y sus citas siguen;
  `booking_services` y `team_members` usan `ON DELETE RESTRICT` desde `appointments`. Un cierre
  nuevo deja de ofrecer horas, pero las citas ya reservadas se mantienen (spec).

## B16. Pruebas

- **Decision**:
  - **Unitarias**: `availability` (tramos, último hueco, cierres, antelación, horizonte, DST,
    profesionales), `assignStaff`, `canCustomerChange`, `booking-schemas`, firma de confirmación y
    de gestión, plantillas de correo.
  - **Integración**: 20 reservas simultáneas a la misma hora → 1 confirmada; restricción de
    exclusión; idempotencia; límites; IDOR en "Mis citas"; cancelación y cambio (dentro y fuera de
    plazo); enlace de gestión (versión, caducidad, manipulación); eliminación de mascota y de
    cuenta; anonimización; carga de `booking:`.
  - **E2E** (`mobile-360`, `desktop`, `no-js`) con axe: US1–US5. Reloj fijo con `x-test-now`.
- **Rationale**: la reserva es un flujo crítico (principio III).

## B17. Recordatorio por correo (FR-034, principio VIII)

- **Decision**: `enqueueDueReminders(db, now)` en `src/lib/booking/reminders.ts` se ejecuta al
  principio de cada pasada de `npm run email:dispatch`, que ya tiene su temporizador en systemd.
  En una transacción, selecciona las citas `confirmed` con `reminder_sent_at IS NULL`, `starts_at`
  entre `now` y `now + reminder_hours_before` y `created_at ≤ starts_at − reminder_hours_before`
  (`FOR UPDATE SKIP LOCKED`). Para cada una, encola `appointment_reminder` y marca
  `reminder_sent_at` en la misma transacción. El cambio de una cita pone `reminder_sent_at` a
  `NULL` y la cancelación hace que no cumpla el filtro. `reminder_hours_before = 0` lo desactiva.
- **Rationale**: no hace falta un temporizador nuevo; con el temporizador de la bandeja (cada
  pocos minutos) el recordatorio sale con un margen de pocos minutos. Marcar y encolar en la misma
  transacción evita duplicados aunque haya dos pasadas a la vez.
- **Alternatives considered**: encolar el recordatorio al reservar con `next_attempt_at` futuro
  (hay que rehacerlo en cada cambio y cancelación, y queda HTML desfasado en la bandeja); un
  temporizador propio (más despliegue para lo mismo).
