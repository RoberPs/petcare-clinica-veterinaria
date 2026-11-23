# Feature Specification: Panel de administración de la agenda

**Feature Branch**: `007-admin-agenda-panel`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Panel de administración de la agenda. El personal con rol de
administrador gestiona veterinarios, servicios, horarios y citas. El panel no tiene páginas en
design/; sigue la misma identidad visual. P1: acceso con rol admin (un cliente normal no puede
entrar); ver las citas del día y de la semana por veterinario; definir servicios (nombre,
duración, activo) y el horario de cada veterinario (los cambios determinan las franjas que ven los
clientes). P2: cancelar o mover una cita (el cliente recibe un correo); bloquear franjas
(vacaciones, descansos). Casos límite: bloquear una franja con citas ya reservadas, veterinario sin
horario, servicio desactivado con citas futuras. Fuera de alcance: historial clínico, facturación,
informes."

## Clarifications

### Session 2026-11-23

- Q: ¿Qué pasa con las citas confirmadas dentro de un bloqueo nuevo? → A: El panel las muestra y
  el administrador elige cancelarlas todas (con correo a cada cliente) o mantenerlas marcadas
  "Fuera de horario".
- Q: ¿"Gestionar veterinarios" incluye la ficha pública del equipo? → A: No; solo los datos de
  agenda (nombre, servicios, reservable, orden y horario). La ficha pública sigue en los datos de
  la clínica.
- Q: ¿El administrador puede crear citas desde el panel? → A: No; queda fuera de alcance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Acceder al panel con una cuenta de administrador (Priority: P1)

Una persona del personal de la clínica inicia sesión con su cuenta, que tiene el rol de
administrador, y entra en el panel. Un cliente normal, o alguien sin sesión, no puede ver ninguna
pantalla del panel ni ejecutar ninguna de sus acciones.

**Why this priority**: sin un acceso restringido y comprobado no se puede publicar ninguna otra
historia; el panel muestra datos personales de todos los clientes.

**Independent Test**: se da el rol de administrador a una cuenta, se inicia sesión y se entra en
el panel; con una cuenta de cliente y sin sesión se intenta abrir cada dirección del panel y
enviar cada una de sus acciones, y todas se rechazan.

**Acceptance Scenarios**:

1. **Given** una cuenta con rol de administrador, **When** inicia sesión y abre el panel, **Then**
   ve la agenda del día y la navegación del panel.
2. **Given** una cuenta de cliente sin rol de administrador, **When** abre cualquier dirección del
   panel o envía cualquier acción del panel, **Then** recibe la misma respuesta que ante una página
   que no existe y no se ejecuta ninguna acción.
3. **Given** un visitante sin sesión, **When** abre una dirección del panel, **Then** se le pide
   iniciar sesión y, tras hacerlo con una cuenta de administrador, vuelve a la página que pedía.
4. **Given** un administrador con la sesión abierta, **When** se le retira el rol, **Then** su
   siguiente petición al panel se rechaza sin esperar a que caduque la sesión.
5. **Given** un administrador en el panel, **When** busca el enlace al panel, **Then** lo
   encuentra en "Mi cuenta"; los clientes no ven ese enlace.

---

### User Story 2 - Ver la agenda del día y de la semana por veterinario (Priority: P1)

El administrador consulta las citas del día o de la semana, en columnas o bloques por veterinario,
y puede filtrar por un veterinario concreto. Cada cita muestra la hora, el servicio, la mascota y
quién la reservó, y da acceso a su detalle.

**Why this priority**: es la herramienta diaria de la recepción; sin ella la clínica sigue
dependiendo de los correos de cada reserva.

**Independent Test**: con citas de varios veterinarios en varios días, se abre la vista de día y
la de semana, se navega a la semana siguiente y a la anterior, se filtra por un veterinario y se
comprueba que aparecen exactamente las citas esperadas.

**Acceptance Scenarios**:

1. **Given** citas confirmadas hoy para dos veterinarios, **When** el administrador abre la vista
   de día, **Then** ve las citas de cada veterinario por separado, ordenadas por hora, con hora de
   inicio y fin, servicio, nombre y especie de la mascota y nombre del responsable.
2. **Given** la vista de semana, **When** el administrador la abre, **Then** ve de lunes a domingo
   las citas de cada veterinario, con la fecha de cada día y la semana actual por defecto.
3. **Given** cualquier vista, **When** el administrador va al día o a la semana anterior o
   siguiente, o elige una fecha, **Then** la vista muestra ese periodo.
4. **Given** un filtro por veterinario, **When** se aplica, **Then** solo se ven las citas de ese
   veterinario y el filtro se conserva al cambiar de día o de semana.
5. **Given** una cita en la agenda, **When** el administrador abre su detalle, **Then** ve
   servicio, veterinario, fecha y hora, estado, motivo, mascota, datos de contacto del responsable
   (de la cuenta o del invitado) y su historial de cambios (creada, movida, cancelada y por quién).
6. **Given** un día sin citas, **When** se abre, **Then** se indica claramente que no hay citas, y
   los bloqueos y los tramos sin horario se distinguen de los huecos libres.
7. **Given** citas canceladas en el periodo, **When** el administrador lo elige, **Then** puede
   mostrarlas u ocultarlas (ocultas por defecto).

---

### User Story 3 - Definir servicios y horarios de cada veterinario (Priority: P1)

El administrador crea y edita los servicios reservables (nombre, duración, activo, orden y qué
veterinarios los atienden), da de alta y edita veterinarios reservables y define el horario
semanal de cada uno. Los cambios se reflejan al momento en las franjas que ven los clientes al
reservar.

**Why this priority**: es lo que hace la agenda adaptable sin tocar código (principio VIII) y lo
que exige la aceptación de la historia: los cambios determinan las franjas que ve el cliente.

**Independent Test**: se crea un servicio de 45 minutos, se asigna a un veterinario con horario de
martes de 10:00 a 13:00 y se comprueba en la reserva pública que ese servicio ofrece solo franjas
de ese veterinario ese día que caben enteras en el tramo; luego se desactiva el servicio y deja de
ofrecerse.

**Acceptance Scenarios**:

1. **Given** el administrador crea un servicio con nombre, duración y activo, **When** lo guarda
   y lo asigna a un veterinario, **Then** el servicio aparece en el selector de la reserva pública
   y sus franjas tienen esa duración.
2. **Given** un servicio con citas futuras, **When** el administrador cambia su duración, **Then**
   las reservas nuevas usan la nueva duración y las citas ya reservadas conservan su hora de fin.
3. **Given** un servicio activo, **When** el administrador lo desactiva, **Then** deja de ofrecerse
   en la reserva pública en el acto; antes de confirmar, el panel indica cuántas citas futuras
   tiene y que esas citas se mantienen.
4. **Given** un veterinario, **When** el administrador define su horario semanal con uno o varios
   tramos por día (por ejemplo, de 9:00 a 14:00 y de 16:00 a 20:00), **Then** la reserva pública
   solo ofrece para él franjas dentro de esos tramos y dentro del horario de la clínica, menos
   cierres, bloqueos y citas ya reservadas.
5. **Given** un horario con datos incorrectos (fin antes del inicio, tramos solapados del mismo
   día), **When** se guarda, **Then** se rechaza con el error junto al campo y no se guarda nada.
6. **Given** un horario de veterinario que se sale del horario de la clínica, **When** se guarda,
   **Then** se guarda, se avisa de que la parte fuera del horario de la clínica no se ofrecerá y
   esa parte no aparece en la reserva pública.
7. **Given** un cambio de horario que deja fuera citas ya reservadas, **When** se guarda, **Then**
   las citas se mantienen, el panel indica cuántas quedan fuera del nuevo horario y en la agenda
   se marcan como "Fuera de horario".
8. **Given** un veterinario sin horario definido, **When** un cliente reserva, **Then** ese
   veterinario no ofrece franjas ni aparece como opción para ningún servicio, y en el panel figura
   con el aviso "Sin horario: no recibe reservas".
9. **Given** el administrador marca un veterinario como no reservable, **When** un cliente reserva,
   **Then** ese veterinario no se ofrece y "Sin preferencia" no se le asigna; sus citas futuras se
   mantienen.

---

### User Story 4 - Cancelar o mover una cita (Priority: P2)

El administrador cancela una cita o la mueve a otra fecha, hora o veterinario. El responsable de
la cita, sea cliente con cuenta o invitado, recibe un correo con el cambio.

**Why this priority**: sustituye al enlace firmado de los correos de la feature 003 como forma
normal de gestionar las llamadas de los clientes, pero la agenda ya tiene valor sin ello.

**Independent Test**: se cancela una cita desde su detalle y se comprueba que la franja queda
libre en la reserva pública y que el responsable recibe el correo de cancelación; se mueve otra y
se comprueba la franja nueva, la antigua libre y el correo con la nueva hora.

**Acceptance Scenarios**:

1. **Given** una cita confirmada y futura, **When** el administrador la cancela y lo confirma,
   **Then** la cita pasa a "Cancelada" con origen "clínica", la franja queda libre al momento y el
   responsable recibe un correo de cancelación con servicio, mascota, fecha y hora, la nota
   opcional del administrador y cómo pedir otra cita.
2. **Given** una cita confirmada y futura, **When** el administrador elige otra fecha, hora o
   veterinario que atienda el servicio y lo confirma, **Then** la cita se mueve, la franja antigua
   queda libre, la nueva queda ocupada y el responsable recibe un correo con la hora anterior y la
   nueva.
3. **Given** la pantalla de mover una cita, **When** el administrador elige fecha y veterinario,
   **Then** solo se ofrecen franjas libres en las que cabe la duración de la cita; el administrador
   no queda limitado por la antelación mínima, el horizonte de reserva ni el plazo de cambio de los
   clientes.
4. **Given** dos personas que ocupan la misma franja a la vez (un administrador moviendo y un
   cliente reservando), **When** ambas confirman, **Then** solo una lo consigue y la otra ve que la
   franja ya no está libre, sin perder lo que había elegido.
5. **Given** una cita ya cancelada o ya pasada, **When** el administrador intenta cancelarla o
   moverla, **Then** el panel no lo permite y lo explica.
6. **Given** un cambio de cita, **When** se confirma, **Then** el recordatorio se ajusta a la nueva
   hora (o se anula si se cancela), igual que en la feature 003.

---

### User Story 5 - Bloquear franjas: vacaciones y descansos (Priority: P2)

El administrador bloquea un periodo de un veterinario (vacaciones, formación, un descanso
puntual) o de toda la clínica, con un motivo interno. Las franjas bloqueadas dejan de ofrecerse.

**Why this priority**: es necesario para que la agenda refleje la realidad, pero se puede
aproximar provisionalmente cambiando el horario.

**Independent Test**: se bloquea a un veterinario del lunes al viernes de la semana siguiente y se
comprueba que la reserva pública no le ofrece ninguna franja esos días; se borra el bloqueo y las
franjas vuelven.

**Acceptance Scenarios**:

1. **Given** un veterinario, **When** el administrador crea un bloqueo con inicio, fin y motivo
   interno, **Then** la reserva pública deja de ofrecer franjas de ese veterinario que se solapen
   con el bloqueo, y el bloqueo se ve en la agenda.
2. **Given** un bloqueo de toda la clínica, **When** se crea, **Then** ningún veterinario ofrece
   franjas en ese periodo.
3. **Given** un bloqueo que se repite (por ejemplo, un descanso cada día de 11:00 a 11:30), **When**
   el administrador lo crea como repetido en ciertos días de la semana durante un periodo, **Then**
   se aplica en cada uno de esos días.
4. **Given** un bloqueo existente, **When** el administrador lo edita o lo borra, **Then** las
   franjas afectadas vuelven a calcularse en el acto.
5. **Given** un periodo con citas ya reservadas, **When** el administrador intenta bloquearlo,
   **Then** el panel muestra las citas afectadas y pide elegir entre cancelarlas todas (cada
   responsable recibe el correo de cancelación) o mantenerlas; las que se mantienen se marcan
   "Fuera de horario" en la agenda y el bloqueo se aplica solo a reservas nuevas.
6. **Given** un bloqueo con fin anterior al inicio o en el pasado, **When** se guarda, **Then** se
   rechaza con el error junto al campo.

---

### Edge Cases

- **Bloquear una franja con citas ya reservadas**: antes de confirmar, el panel muestra la lista
  de citas afectadas y el administrador elige cancelarlas todas (con correo) o mantenerlas
  marcadas "Fuera de horario" (US5, escenario 5). Mantenerlas permite luego moverlas una a una.
- **Veterinario sin horario**: no recibe reservas ni se le asigna con "Sin preferencia"; el panel
  lo avisa en la lista de veterinarios y en la agenda. Un servicio cuyos veterinarios no tienen
  horario no ofrece franjas y en la reserva pública se indica que no hay disponibilidad, no un
  error.
- **Servicio desactivado con citas futuras**: las citas se mantienen y se atienden; se ven en la
  agenda con su servicio marcado como inactivo, se pueden cancelar o mover (a franjas del mismo
  servicio, aunque esté inactivo) y el cliente puede seguir cancelándolas desde su cuenta. Los
  servicios no se borran, solo se desactivan, para conservar el historial.
- **Último servicio activo o último veterinario reservable**: se puede desactivar; la reserva
  pública muestra que ahora no hay citas online disponibles y remite al contacto.
- **Duración que no encaja en ningún tramo**: el servicio se guarda, pero el panel avisa de que con
  los horarios actuales no ofrecerá ninguna franja.
- **Cambio de duración o de horario con la reserva en curso**: si un cliente tenía la página de
  franjas abierta, al confirmar se vuelve a comprobar la disponibilidad con los datos vigentes
  (como en la feature 003).
- **Mover a un veterinario que no atiende el servicio**: no se ofrece; si llega igualmente, se
  rechaza en el servidor.
- **Cita de un invitado anonimizada**: se ve en la agenda sin datos personales y no admite cambios
  porque ya es pasada.
- **Fallo al enviar el correo al cliente**: la cancelación o el cambio se aplican igualmente y el
  correo se reintenta con la bandeja de salida existente.
- **Reenvío o doble clic** en cancelar, mover, guardar un servicio, un horario o un bloqueo: no
  duplica nada ni envía dos correos.
- **Dos administradores editan lo mismo a la vez**: gana el último cambio guardado, salvo en las
  citas, donde la regla de no solapamiento impide que ambos ocupen la misma franja; si la cita ya
  cambió desde que se abrió, se avisa y se muestra su estado actual.
- **Administrador que elimina su propia cuenta**: se permite como a cualquier cliente; si es el
  último administrador, el panel queda sin acceso hasta asignar otro con la herramienta de
  operación.
- **Cambio de hora (horario de verano o invierno)**: los horarios y bloqueos se interpretan en
  `Europe/Madrid`; una franja que no existe o se repite ese día se trata igual que en la reserva
  pública de la feature 003.

## Requirements *(mandatory)*

### Functional Requirements

**Acceso y seguridad**

- **FR-001**: El panel MUST usar las cuentas existentes de la feature 002; el acceso exige una
  sesión iniciada de una cuenta verificada con rol de administrador.
- **FR-002**: El rol de administrador MUST comprobarse en el servidor en cada petición del panel,
  tanto al mostrar pantallas como al ejecutar acciones, con el estado actual del rol (retirarlo
  surte efecto en la siguiente petición).
- **FR-003**: Una cuenta sin rol de administrador MUST recibir la misma respuesta que ante una
  página inexistente en cualquier dirección o acción del panel; un visitante sin sesión MUST ser
  llevado a iniciar sesión y volver después a la página pedida.
- **FR-004**: El rol de administrador MUST asignarse y retirarse solo con una herramienta de
  operación del servidor (no desde la web), que deja constancia de quién y cuándo.
- **FR-005**: Las acciones del panel MUST protegerse contra CSRF y las páginas del panel MUST no
  indexarse en buscadores.
- **FR-006**: Toda acción del panel que modifique datos (servicios, veterinarios, horarios,
  bloqueos y citas) MUST registrar quién la hizo, cuándo, sobre qué elemento y qué cambió; este
  registro se consulta en el detalle de cada cita. Los registros técnicos (logs) MUST no contener
  correos, teléfonos, nombres, motivos ni notas.

**Agenda**

- **FR-007**: El panel MUST ofrecer una vista de día y una vista de semana (de lunes a domingo),
  agrupadas por veterinario, con navegación al periodo anterior, al siguiente, a hoy y a una fecha
  elegida.
- **FR-008**: La agenda MUST poder filtrarse por veterinario y mostrar u ocultar las citas
  canceladas (ocultas por defecto); los filtros MUST conservarse al navegar.
- **FR-009**: Cada cita de la agenda MUST mostrar hora de inicio y fin, servicio, nombre y especie
  de la mascota, nombre del responsable y estado ("Confirmada", "Cancelada", "Realizada"), más la
  marca "Fuera de horario" cuando ya no cabe en el horario o choca con un bloqueo, y "Servicio
  inactivo" cuando corresponda.
- **FR-010**: El detalle de una cita MUST mostrar además el motivo, el origen (cuenta o invitado),
  el teléfono y el correo del responsable y el historial de cambios.
- **FR-011**: La agenda MUST mostrar los bloqueos y distinguir los tramos sin horario de los huecos
  libres.

**Servicios**

- **FR-012**: El administrador MUST poder crear y editar servicios reservables con: nombre visible
  (2 a 60 caracteres, único entre los servicios), duración en minutos (múltiplo de 5, de 5 a 480),
  activo o inactivo, orden en el selector y veterinarios que lo atienden.
- **FR-013**: Los servicios MUST no borrarse; solo se desactivan. Un servicio inactivo deja de
  ofrecerse en la reserva pública en el acto y sus citas futuras se mantienen.
- **FR-014**: Antes de desactivar un servicio o de cambiar su duración, el panel MUST indicar
  cuántas citas futuras tiene y que se mantienen tal como están.

**Veterinarios y horarios**

- **FR-015**: El administrador MUST poder dar de alta y editar veterinarios reservables con:
  nombre visible, servicios que atiende, reservable sí o no y orden en el selector. La ficha
  pública del equipo (foto, especialidad, presentación) MUST no editarse desde el panel en esta
  feature.
- **FR-016**: Cada veterinario MUST tener un horario semanal propio con cero a tres tramos por día
  de la semana (hora de inicio y fin en `Europe/Madrid`, en múltiplos de 5 minutos); los tramos de
  un mismo día MUST no solaparse y el fin MUST ser posterior al inicio. El límite de tres tramos
  permite un formulario de filas fijas que funciona sin JavaScript.
- **FR-017**: La disponibilidad pública de la feature 003 MUST calcularse a partir de la
  intersección del horario del veterinario con el horario y los cierres de la clínica, menos los
  bloqueos y las citas activas, con la cuadrícula, la antelación mínima y el horizonte vigentes.
  Un veterinario sin tramos MUST no ofrecer franjas ni asignarse con "Sin preferencia".
- **FR-018**: Todo cambio de servicios, veterinarios, horarios o bloqueos MUST reflejarse en la
  siguiente consulta de franjas de la reserva pública, sin esperas ni recargas de datos.
- **FR-019**: Al guardar un horario o un bloqueo, el panel MUST avisar si deja citas futuras fuera
  y cuántas; las citas no se modifican solas.

**Citas**

- **FR-020**: El administrador MUST poder cancelar una cita confirmada y futura, con confirmación
  previa y una nota opcional para el cliente (hasta 300 caracteres, sin datos de salud). La cita
  queda cancelada con origen "clínica" y la franja libre en el acto.
- **FR-021**: El administrador MUST poder mover una cita confirmada y futura a otra fecha, hora o
  veterinario que atienda su servicio, eligiendo entre las franjas libres donde cabe la duración
  de la cita. No le aplican la antelación mínima, el horizonte ni el plazo de cambio de los
  clientes, pero sí el horario, los cierres, los bloqueos y la regla de no solapamiento.
- **FR-022**: Cancelar o mover MUST generar un correo al responsable (cuenta o invitado) con los
  datos de la cita, la nota opcional y, al mover, la hora anterior y la nueva; el envío MUST no
  condicionar la acción y se reintenta con la bandeja de salida.
- **FR-023**: Cancelar y mover MUST ser idempotentes: un reenvío no duplica la acción ni el correo.
  Si la cita cambió desde que se abrió la pantalla, MUST avisarse y mostrarse su estado actual.
- **FR-024**: Los recordatorios MUST ajustarse a la nueva hora al mover y anularse al cancelar,
  como en la feature 003. El enlace de gestión firmado de los correos a la clínica (feature 003)
  MUST seguir funcionando.
- **FR-025**: El panel MUST no crear citas; las reservas por teléfono o en mostrador se hacen con
  la reserva pública de la feature 003.

**Bloqueos**

- **FR-026**: El administrador MUST poder crear, editar y borrar bloqueos de un veterinario o de
  toda la clínica, con fecha y hora de inicio y fin y un motivo interno (hasta 120 caracteres, que
  no ven los clientes).
- **FR-027**: Un bloqueo MUST poder ser puntual o repetirse en días de la semana elegidos dentro
  de un periodo (por ejemplo, de 11:00 a 11:30 de lunes a viernes durante tres meses).
- **FR-028**: Un bloqueo que se solapa con citas confirmadas MUST mostrar esas citas antes de
  confirmarse y pedir al administrador que elija entre cancelarlas todas, con el correo de FR-022
  a cada responsable y en una sola acción idempotente, o mantenerlas marcadas "Fuera de horario".

**Interfaz**

- **FR-029**: El panel MUST componerse solo con los tokens y componentes del design system
  (principio I), aunque no tenga páginas en `design/`. No hay página de referencia en `design/`.
  - **Componentes existentes que se usan**: `.account-grid`, `.side-nav`, `.tabs`,
    `table.orders--stack`, `.badge`, `.badge--urgent`, `.badge--muted`, `.notice`, `.status-ok`,
    `.btn`, `.btn--ghost` y `.btn--mint`.
  - **Componentes nuevos** en `design/styles.css`, solo con tokens: `.admin-toolbar`,
    `.agenda-day`, `.agenda-week`, `.agenda-slot` (con `--cancelled`, `--block` y `--off`) y
    `.schedule-grid`.
  - **Colores de los botones**: cancelar y borrar usan `.btn--ghost`, nunca los colores de "pedir
    cita" ni de "contacto"; guardar usa marino y la confirmación de éxito, menta.
- **FR-030**: Todo el panel MUST funcionar sin JavaScript, con teclado, foco visible, errores junto
  al campo anunciados por ARIA y en anchos de móvil (desde 320 px), cumpliendo WCAG 2.2 AA.
- **FR-031**: Todos los textos del panel, los errores y los correos MUST estar en español de
  España, con fechas y horas en formato español y `Europe/Madrid`.

### Key Entities

- **Rol de administrador**: atributo de una cuenta de la feature 002 que da acceso al panel;
  incluye cuándo y con qué herramienta se asignó o retiró.
- **Servicio reservable** (ya existe, feature 003): se amplía con su gestión desde el panel; nombre,
  duración, activo, orden y veterinarios que lo atienden.
- **Veterinario reservable** (ya existe, feature 003): miembro del equipo que atiende citas;
  nombre visible, servicios, reservable, orden y horario semanal.
- **Tramo de horario**: día de la semana, hora de inicio y hora de fin de un veterinario.
- **Bloqueo**: veterinario o toda la clínica, inicio y fin, repetición opcional (días de la semana
  y periodo), motivo interno y autor.
- **Cita** (ya existe, feature 003): se le añaden el historial de cambios del panel, la nota de la
  clínica al cancelar y el autor de cada cambio.
- **Registro de acciones del panel**: quién, cuándo, qué elemento y qué cambió.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las direcciones y acciones del panel rechazan a clientes sin rol y a
  visitantes sin sesión, comprobado por tests automáticos sobre cada una.
- **SC-002**: Un administrador encuentra una cita concreta de la semana en curso en menos de 30
  segundos desde que entra en el panel.
- **SC-003**: Un cambio de servicio, horario o bloqueo se ve en la reserva pública en la siguiente
  consulta, en el 100 % de los casos probados.
- **SC-004**: Cancelar o mover una cita lleva menos de 1 minuto y el responsable recibe el correo
  en menos de 5 minutos en el 95 % de los casos.
- **SC-005**: Ninguna operación del panel produce dos citas solapadas del mismo veterinario,
  también con acciones simultáneas de clientes y administradores.
- **SC-006**: Una clínica nueva configura sus servicios, veterinarios y horarios desde el panel,
  sin tocar código ni archivos de datos, en menos de 30 minutos.
- **SC-007**: El panel no tiene errores de accesibilidad automáticos y se completa con teclado y
  sin JavaScript en todas sus pantallas.

## Assumptions

- **Un único rol**: solo existe "administrador", con acceso a todo el panel; los roles de
  recepción o de veterinario con permisos reducidos quedan fuera de alcance.
- **Asignación del rol por herramienta de operación**: igual que la gestión de pedidos de la
  feature 005 (`npm run orders`), el rol se asigna y retira desde el servidor; no hay invitaciones
  ni gestión de usuarios en el panel.
- **Sesión del administrador**: se reutilizan la sesión, el inicio de sesión y la limitación de
  intentos de la feature 002; el doble factor queda fuera de alcance.
- **Horario de la clínica y cierres**: el horario público y los cierres excepcionales de la feature
  001 siguen cargándose con los datos de la clínica y siguen siendo el marco exterior de la
  disponibilidad; su edición desde el panel, junto con las reglas de reserva (cuadrícula,
  antelación, horizonte y plazos), llegará en otra feature del panel. Se mantiene para ellos la
  excepción temporal al principio VIII.
- **Datos iniciales y el panel**: tras esta feature, servicios, veterinarios, horarios y bloqueos
  se gestionan en el panel. La carga de datos de la clínica los crea si no existen, pero no
  sobrescribe los cambios hechos desde el panel.
- **Migración de horarios**: al activar la feature, cada veterinario reservable recibe como horario
  inicial el horario semanal de la clínica, para que la reserva pública no cambie hasta que el
  administrador lo ajuste.
- **Las citas existentes no se reprograman solas** ante cambios de horario, servicios o bloqueos
  (se mantiene la decisión de la feature 003); el panel solo avisa y marca.
- **Correo del cliente**: se reutilizan la bandeja de salida y los reintentos existentes; no se
  avisa al cliente de cambios de horario o de servicio que no tocan su cita.
- **Fuera de alcance**: historial clínico, facturación, informes y estadísticas, gestión de
  clientes y mascotas desde el panel, crear citas desde el panel, edición de la ficha pública del
  equipo, marcar citas como "no presentado", lista de espera,
  notificaciones al veterinario, exportación de la agenda a calendarios externos y gestión del
  catálogo, pedidos, artículos o preguntas frecuentes (otras features del panel).
