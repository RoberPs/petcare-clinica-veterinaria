# Feature Specification: Reserva de citas online

**Feature Branch**: `003-online-appointment-booking`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Reserva de citas online, con o sin cuenta. Un visitante o cliente reserva una cita para su mascota eligiendo servicio, veterinario (o "sin preferencia") y franja horaria libre. Referencia visual: design/cita.html, cuenta.html. Servicios reservables: consulta general, vacunación, revisión dental, cirugía, dermatología, otro. Duración de cada uno y de las franjas: [TBD]. Veterinarios: los del diseño más "sin preferencia". […] Casos límite: dos personas eligen la misma franja a la vez, día sin disponibilidad, fecha pasada, franja deshabilitada por ocupación, invitado que usa el correo de una cuenta existente [TBD: ¿se asocia a la cuenta?], cancelación fuera de plazo. Fuera de alcance: urgencias, pago de la cita, teleconsulta, recordatorios por SMS o WhatsApp, lista de espera."

## Contexto

Las features 001 (web pública) y 002 (cuentas de cliente y mascotas) ya están implementadas. Hoy
"Pide cita", "Pedir cita" en cada mascota y "Mis citas" llevan a "Próximamente". Esta feature
convierte esos accesos en una reserva real: disponibilidad calculada a partir del horario de la
clínica, sus cierres, la duración de cada servicio y la agenda de cada profesional, sin
solapamientos ni dobles reservas (principio VIII).

Como en las features anteriores, todo lo que depende de la clínica (servicios reservables, su
duración, profesionales que atienden cada servicio, horario, cierres, teléfono y plazos) son datos
configurables. Los nombres de veterinarios y los servicios de la maqueta `design/cita.html` no se
publican: los profesionales salen del equipo de la clínica y los servicios, de su configuración.

## Clarifications

### Session 2026-11-11

- Q: Sin panel de administración, ¿cómo libera la clínica una franja cuando un invitado o un
  cliente fuera de plazo llama para cancelar o cambiar? → A: Cada correo que recibe la clínica
  trae un enlace firmado para cancelar o cambiar esa cita.
- Q: Si un invitado reserva con el correo de una cuenta existente, ¿se asocia la cita a la
  cuenta? → A: No se asocia nunca; el correo le sugiere iniciar sesión la próxima vez.
- Q: ¿Plazo de cancelación y cambio y duraciones de la demo? → A: 24 horas; Consulta general 30
  min, Vacunación 15, Revisión dental 30, Cirugía 60, Dermatología 30 y Otro 30 (configurables).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reservar una cita como invitado (Priority: P1)

Un visitante sin cuenta entra en "Pide cita" y, en pasos sucesivos, elige el servicio y el
profesional (o "Sin preferencia"), indica el nombre y la especie de su mascota, elige fecha y una
hora libre y completa sus datos (nombre y apellidos, teléfono, correo), un motivo opcional y la
aceptación de la política de privacidad. Durante todo el proceso ve un resumen de la cita. Al
confirmar ve una pantalla de confirmación y recibe un correo con los detalles y con la forma de
cancelar o cambiar la cita (llamando a la clínica).

**Why this priority**: es el recorrido principal de la feature y un flujo crítico de la
constitución (principio III); sin él no hay reserva online.

**Independent Test**: sin iniciar sesión, reservar una cita en una franja libre y comprobar la
pantalla de confirmación, el correo recibido y que esa franja deja de ofrecerse a otro visitante.

**Acceptance Scenarios**:

1. **Given** un servicio y un profesional elegidos, **When** el visitante elige una fecha, **Then**
   solo ve las horas en las que ese profesional (o, con "Sin preferencia", al menos un profesional
   que atienda ese servicio) tiene libre la duración completa del servicio dentro del horario de la
   clínica.
2. **Given** cualquier paso del proceso, **When** el visitante avanza o vuelve atrás, **Then** el
   resumen muestra el servicio, el profesional, la mascota, la fecha y la hora elegidos hasta ese
   momento, y "—" en lo que falta.
3. **Given** todos los datos válidos y la privacidad aceptada, **When** confirma, **Then** la cita
   queda reservada, ve la confirmación con servicio, profesional asignado, mascota, fecha, hora y
   dirección de la clínica, y recibe un correo de confirmación con esos datos, el teléfono de la
   clínica y la indicación de que para cancelar o cambiar la cita debe llamar.
4. **Given** "Sin preferencia", **When** confirma, **Then** el sistema asigna un profesional libre
   que atiende ese servicio y la confirmación y el correo muestran su nombre.
5. **Given** un campo obligatorio vacío o no válido, o la privacidad sin aceptar, **When**
   confirma, **Then** no se reserva nada, el error aparece junto al campo y se conserva lo ya
   escrito.
6. **Given** una confirmación ya enviada, **When** el visitante recarga la página o reenvía el
   formulario, **Then** no se crea una segunda cita y ve la misma confirmación.
7. **Given** un navegador sin JavaScript, **When** el visitante hace la reserva completa, **Then**
   puede terminarla con el mismo resultado.
8. **Given** una cita confirmada con más de 24 horas de antelación, **When** faltan 24 horas para
   la cita, **Then** el responsable recibe un correo de recordatorio con los datos de la cita y
   cómo cancelarla o cambiarla.

---

### User Story 2 - Reservar una cita con sesión iniciada (Priority: P1)

Un cliente con sesión entra en "Pide cita" (desde la cabecera o desde "Pedir cita" en una de sus
mascotas). Elige una de sus mascotas guardadas o añade otra; su nombre, su correo y su teléfono (si
lo tiene guardado) ya están rellenados. La cita queda asociada a su cuenta.

**Why this priority**: es el valor principal de tener cuenta y lo que convierte el botón "Pedir
cita" de cada mascota en una acción real.

**Independent Test**: con una cuenta con dos mascotas, pulsar "Pedir cita" en una, completar la
reserva y comprobar que la mascota venía elegida, que los datos personales venían rellenados y que
la cita aparece en "Mis citas".

**Acceptance Scenarios**:

1. **Given** un cliente con sesión, **When** abre "Pide cita", **Then** ve un selector con sus
   mascotas (nombre y especie) y la opción "Otra mascota…", y sus datos personales rellenados.
2. **Given** "Pedir cita" pulsado en una mascota concreta, **When** se abre la reserva, **Then**
   esa mascota está ya elegida.
3. **Given** "Otra mascota…", **When** el cliente indica sus datos y confirma la cita, **Then** la
   mascota se guarda en su cuenta y la cita queda asociada a ella.
4. **Given** un cliente sin teléfono guardado, **When** reserva, **Then** debe indicar un teléfono
   para esa cita.
5. **Given** la cita confirmada, **When** el cliente abre "Mis citas", **Then** la ve como cita
   futura; el correo de confirmación indica que puede cancelarla o cambiarla desde "Mis citas".
6. **Given** un cliente que intenta reservar para una mascota que no es suya (por ejemplo,
   manipulando el formulario), **When** confirma, **Then** no se reserva nada y se responde como si
   la mascota no existiera.

---

### User Story 3 - Ver mis citas (Priority: P1)

En el área de cliente, "Mis citas" muestra las citas futuras (de la más próxima a la más lejana) y
las pasadas (de la más reciente a la más antigua), cada una con mascota, servicio, profesional,
fecha, hora y estado. El resumen de la cuenta muestra la próxima cita.

**Why this priority**: sin esta vista el cliente no puede comprobar lo que ha reservado ni acceder
a cancelar o cambiar.

**Independent Test**: con una cuenta con una cita futura, una pasada y una cancelada, abrir "Mis
citas" y comprobar el orden, los datos y los estados.

**Acceptance Scenarios**:

1. **Given** un cliente con citas, **When** abre "Mis citas", **Then** ve dos bloques, "Próximas" y
   "Anteriores", con mascota, servicio, profesional, fecha, hora y estado de cada cita.
2. **Given** un cliente sin citas, **When** abre "Mis citas", **Then** ve un mensaje vacío con un
   acceso a "Pide cita".
3. **Given** las citas de otro cliente, **When** alguien intenta verlas (por ejemplo, cambiando un
   identificador en la dirección), **Then** se responde como si no existieran.
4. **Given** una mascota eliminada que tenía citas pasadas, **When** el cliente abre "Mis citas",
   **Then** esas citas siguen visibles con el nombre que tenía la mascota.

---

### User Story 4 - Cancelar o cambiar una cita desde la cuenta (Priority: P2)

Desde "Mis citas", el cliente cancela una cita futura o la cambia a otra fecha, hora o profesional
del mismo servicio, siempre que falte al menos el plazo mínimo configurado. La franja anterior
vuelve a quedar libre. Recibe un correo con el cambio o la cancelación.

**Why this priority**: evita llamadas y huecos vacíos en la agenda, pero la reserva funciona sin
ello.

**Independent Test**: cancelar una cita futura y comprobar que su franja vuelve a ofrecerse;
cambiar otra a una nueva hora y comprobar que la antigua queda libre y la nueva ocupada.

**Acceptance Scenarios**:

1. **Given** una cita futura dentro de plazo, **When** el cliente la cancela y lo confirma, **Then**
   pasa a "Cancelada", su franja vuelve a estar disponible y recibe un correo de cancelación.
2. **Given** una cita futura dentro de plazo, **When** el cliente elige una nueva franja libre y
   confirma el cambio, **Then** la cita queda en la nueva franja, la anterior vuelve a estar
   disponible y recibe un correo con la nueva fecha y hora.
3. **Given** un cambio en curso, **When** la nueva franja se ocupa antes de confirmar, **Then** la
   cita conserva su franja original y el cliente ve un aviso con las horas libres actualizadas.
4. **Given** una cita fuera de plazo, **When** el cliente la mira en "Mis citas", **Then** no ve
   las acciones de cancelar ni cambiar, sino un texto que indica que debe llamar a la clínica, con
   su teléfono.
5. **Given** una cita que entra en el periodo fuera de plazo mientras el cliente la cancela,
   **When** confirma, **Then** no se cancela y ve el mismo aviso de llamar a la clínica.

---

### User Story 5 - Invitado que necesita cancelar o cambiar su cita (Priority: P2)

El invitado no tiene acceso a "Mis citas". Su correo de confirmación le indica que, para cancelar o
cambiar la cita, debe llamar a la clínica, y le muestra el teléfono y el plazo recomendado. La
clínica atiende la llamada y usa el enlace de gestión de su propio correo de esa cita (FR-027).

**Why this priority**: completa el recorrido del invitado; depende de cómo gestione la clínica su
agenda.

**Independent Test**: reservar como invitado y comprobar que el correo contiene el teléfono de la
clínica y las instrucciones; seguir el procedimiento acordado para cancelar y comprobar que la
franja vuelve a estar libre.

**Acceptance Scenarios**:

1. **Given** una cita de invitado confirmada, **When** el invitado lee el correo, **Then** ve el
   teléfono de la clínica y que cancelar o cambiar se hace llamando.
2. **Given** el enlace de gestión del correo de la clínica, **When** el personal lo abre y confirma
   la cancelación, **Then** la cita pasa a "Cancelada" (por la clínica), la franja vuelve a quedar
   libre y el invitado recibe un correo de cancelación.
3. **Given** el mismo enlace, **When** el personal elige una nueva franja libre y confirma el
   cambio, **Then** la cita se mueve de forma atómica y el invitado recibe un correo con la nueva
   fecha y hora.
4. **Given** un enlace manipulado, caducado o de una cita ya cancelada o pasada, **When** alguien lo
   abre, **Then** no se muestra ningún dato de la cita y se indica que el enlace no es válido.

---

### Edge Cases

- **Dos personas eligen la misma franja a la vez**: solo una reserva se confirma. La otra no se
  crea, sus datos se conservan y ve un aviso con las horas libres actualizadas de ese día.
- **Día sin disponibilidad** (cerrado, festivo, cierre configurado o todas las franjas ocupadas):
  se indica que no hay horas libres ese día y se ofrece el siguiente día con disponibilidad.
- **Fecha pasada o fuera del horizonte de reserva**: no se puede elegir; si llega igualmente (por
  ejemplo, manipulando el formulario), se rechaza con un error junto al campo de fecha.
- **Hora de hoy ya pasada o demasiado cercana**: no se ofrecen franjas que empiecen antes de la
  antelación mínima.
- **Franja ocupada**: no se ofrece como seleccionable. Si se muestra (porque el visitante cargó la
  página antes de que se ocupara), al confirmar se trata como el caso de dos personas a la vez.
- **"Sin preferencia" con varios profesionales libres**: se asigna al profesional libre con menos
  citas ese día; en caso de empate, por el orden configurado del equipo.
- **Profesional que no atiende el servicio elegido**: no aparece en el selector; si llega
  igualmente, se rechaza.
- **Servicio más largo que el hueco disponible**: la franja solo se ofrece si cabe completa antes
  del cierre de ese tramo del horario y sin solaparse con otra cita del mismo profesional.
- **Invitado que usa el correo de una cuenta existente**: la cita se reserva como invitado y no se
  asocia nunca a la cuenta, ni ahora ni después; no aparece en "Mis citas". El correo de
  confirmación es el de invitado y añade una sugerencia de iniciar sesión la próxima vez. La
  respuesta en pantalla es idéntica tenga o no cuenta ese correo, para no revelar qué correos
  están registrados.
- **Cancelación o cambio fuera de plazo**: se rechaza en el servidor aunque el cliente la intente
  desde una página antigua; se le indica que llame a la clínica.
- **Cita ya cancelada o ya pasada**: no admite cancelar ni cambiar; el intento responde con un aviso.
- **Abuso del formulario de invitado**: se limita el número de reservas por origen en un periodo, y
  el número de citas futuras activas por correo; superado el límite, se indica que llame a la
  clínica.
- **Cliente que elimina su cuenta con citas futuras**: esas citas se cancelan y sus franjas
  quedan libres; se avisa de ello antes de confirmar la eliminación.
- **Mascota eliminada con citas futuras**: se avisa antes de eliminarla; al confirmarlo, sus citas
  futuras se cancelan y sus franjas quedan libres.
- **Cambio de horario o cierre nuevo que afecta a citas ya reservadas**: las citas existentes no se
  borran solas; la clínica decide qué hacer con ellas.
- **Fallo al enviar el correo**: la cita queda reservada igualmente y el correo se reintenta; la
  pantalla de confirmación es la prueba inmediata de la reserva.
- **Recordatorio y cambios**: una cita cambiada después de enviar el recordatorio recibe otro para
  la nueva hora; una cita cancelada no recibe recordatorio; una cita reservada para dentro de
  menos de 24 horas no lo recibe (basta la confirmación).

## Requirements *(mandatory)*

### Functional Requirements

#### Catálogo reservable y disponibilidad

- **FR-001**: Los servicios reservables, su nombre visible, su duración y su orden MUST ser datos
  configurables de la clínica. La opción "Otro" MUST existir como servicio reservable configurable
  más. No hay servicios escritos en el producto.
- **FR-002**: Los profesionales reservables MUST ser miembros del equipo de la clínica marcados
  como reservables, con la lista de servicios que atiende cada uno. El selector MUST mostrar solo
  los que atienden el servicio elegido, más "Sin preferencia" (opción por defecto).
- **FR-003**: La disponibilidad MUST calcularse a partir del horario semanal y los cierres de la
  clínica (los mismos que muestra la web pública), la duración del servicio y las citas activas
  del profesional. Una franja solo se ofrece si la duración completa del servicio cabe en un tramo
  del horario y no se solapa con otra cita activa del mismo profesional.
- **FR-004**: Las horas de inicio MUST seguir una cuadrícula configurable (por defecto, cada 30
  minutos desde la apertura de cada tramo).
- **FR-005**: Solo MUST ofrecerse fechas entre hoy y el horizonte de reserva configurado, y franjas
  que empiecen al menos con la antelación mínima configurada. Fechas y horas MUST mostrarse y
  calcularse en la zona horaria de la clínica.
- **FR-006**: Las franjas no disponibles MUST no ser seleccionables; el visitante MUST ver solo las
  horas realmente libres del día elegido, y un mensaje con el siguiente día disponible cuando no
  haya ninguna.
- **FR-007**: El sistema MUST impedir que un mismo profesional tenga dos citas activas solapadas,
  también cuando dos reservas o cambios se confirman a la vez. Las citas canceladas no ocupan
  franja.

#### Reserva

- **FR-008**: La reserva MUST hacerse en pasos (servicio y profesional, mascota, fecha y hora, tus
  datos) con un resumen siempre visible que refleje lo elegido y permita volver a cada paso sin
  perder lo ya indicado.
- **FR-009**: El invitado MUST indicar: nombre de la mascota (1 a 40 caracteres) y especie (de la
  lista de especies atendidas, más "Otra"); nombre y apellidos; teléfono; correo; motivo opcional
  (hasta 500 caracteres); y la aceptación de la política de privacidad, que no puede venir marcada.
  Finalidades: nombre y especie para preparar la consulta; nombre, teléfono y correo para
  identificar al responsable, confirmar la cita y avisarle de cambios; motivo para que el
  profesional se prepare.
- **FR-010**: El campo de motivo MUST advertir que no se incluyan datos de salud de personas ni
  otros datos personales innecesarios.
- **FR-011**: El cliente con sesión MUST elegir entre sus mascotas o "Otra mascota…". Una mascota
  nueva MUST pedir los mismos datos que "Añadir mascota" (feature 002) y guardarse en su cuenta al
  confirmar la cita. El nombre y el correo MUST venir de la cuenta; el teléfono, de la cuenta si lo
  tiene, y si no, MUST pedirse para la cita.
- **FR-012**: La cita de un cliente con sesión MUST quedar asociada a su cuenta y a su mascota.
- **FR-013**: Toda entrada MUST validarse en el servidor, incluida la comprobación de que la
  mascota pertenece a la cuenta, de que el profesional atiende el servicio y de que la franja
  sigue libre. Los errores MUST mostrarse junto al campo y conservar lo ya escrito.
- **FR-014**: Reenviar o recargar una confirmación MUST no crear otra cita y MUST mostrar la misma
  confirmación.
- **FR-015**: Con "Sin preferencia", el sistema MUST asignar al confirmar un profesional libre que
  atienda el servicio, según la regla de los casos límite.
- **FR-016**: La reserva MUST limitarse por origen (mismo criterio que el formulario de contacto),
  y a un máximo configurable de citas futuras activas: por correo para invitados (por defecto, 3)
  y por cuenta para clientes (por defecto, 9).
- **FR-017**: Al confirmar, el visitante MUST ver una página de confirmación con servicio,
  profesional, mascota, fecha, hora y dirección de la clínica.

#### Correos

- **FR-018**: Toda cita confirmada, cambiada o cancelada MUST generar un correo al responsable con
  servicio, profesional, mascota, fecha, hora y dirección de la clínica, y uno a la clínica en su
  buzón configurado. El correo al responsable no repite el motivo.
- **FR-019**: El correo de confirmación de un invitado MUST indicar que para cancelar o cambiar la
  cita debe llamar a la clínica, con su teléfono y el plazo recomendado. El de un cliente MUST
  indicar que puede hacerlo desde "Mis citas", hasta el plazo configurado, con un enlace.
- **FR-020**: El envío de correos MUST no condicionar la reserva: si falla, la cita sigue reservada
  y el correo se reintenta (mecanismo de la feature 001).
- **FR-034**: Cada cita confirmada MUST generar un único correo de recordatorio al responsable,
  con la antelación configurada (por defecto, 24 horas antes; 0 lo desactiva). El recordatorio
  incluye los datos de la cita y cómo cancelarla o cambiarla (variante de invitado o de cliente,
  como FR-019). No se envía si la cita se reservó con menos antelación que la configurada, ni si
  está cancelada. Si la cita cambia, el recordatorio se vuelve a programar para la nueva hora.

#### Mis citas, cancelación y cambio

- **FR-021**: "Mis citas" MUST listar las citas de la cuenta en "Próximas" y "Anteriores", con
  mascota, servicio, profesional, fecha, hora y estado, y un estado vacío con acceso a "Pide cita".
  El resumen de la cuenta MUST mostrar la próxima cita.
- **FR-022**: Los estados visibles MUST ser "Confirmada", "Cancelada" y "Realizada" (cita
  confirmada cuya hora ya ha pasado).
- **FR-023**: El cliente MUST poder cancelar o cambiar una cita propia confirmada y futura mientras
  falte al menos el plazo configurado (por defecto, 24 horas). Fuera de plazo, MUST mostrarse el
  teléfono de la clínica en lugar de las acciones, y el servidor MUST rechazar el intento.
- **FR-024**: Cambiar una cita MUST permitir elegir otra fecha, hora y profesional del mismo
  servicio. El cambio MUST ser atómico: la nueva franja se ocupa y la anterior se libera a la vez;
  si la nueva ya no está libre, la cita no cambia.
- **FR-025**: Cancelar MUST pedir confirmación y liberar la franja en el acto.
- **FR-026**: Cada cliente MUST acceder únicamente a sus propias citas; las ajenas MUST responder
  como inexistentes.
- **FR-027**: Cada correo de cita que recibe la clínica MUST incluir un enlace de gestión firmado,
  válido solo para esa cita y hasta su hora de inicio, que permite al personal cancelarla o
  cambiarla (a otra franja libre del mismo servicio) sin aplicar el plazo de 24 horas. El enlace
  MUST no enviarse nunca al responsable de la cita, abrir primero una página de confirmación (no
  actuar al abrirse), dejar de funcionar cuando la cita se cancela o pasa, y registrar en el
  sistema cada uso (solo con identificadores). La cancelación queda marcada como "por la clínica"
  y el responsable recibe el correo correspondiente.

#### Integración con la web y con la cuenta

- **FR-028**: "Pide cita" de la cabecera y del pie, los CTA de cita de la web pública, "Mis citas"
  del área de cliente y "Pedir cita" de cada mascota MUST llevar a las nuevas páginas en lugar de a
  "Próximamente".
- **FR-029**: La descarga de datos de la feature 002 MUST incluir las citas del cliente. Eliminar
  la cuenta MUST cancelar sus citas futuras (liberando las franjas) y desvincular de la persona las
  pasadas; lo mismo al eliminar una mascota con citas futuras, previo aviso.
- **FR-030**: Los datos personales de las citas de invitado MUST anonimizarse cuando hayan pasado
  12 meses desde la fecha de la cita (valor configurable).
- **FR-031**: Todo el recorrido MUST funcionar sin JavaScript, con teclado, con foco visible y con
  errores asociados a su campo, cumpliendo WCAG 2.2 AA; con JavaScript puede mejorarse la
  experiencia (por ejemplo, actualizar horas y resumen sin recargar) sin cambiar el resultado.
- **FR-032**: Los botones de pedir y confirmar cita MUST usar el color de intención "pedir cita"
  (cian); los de cancelar, el de acción neutra.
- **FR-033**: Los registros del sistema MUST no contener correos, teléfonos, nombres ni el motivo;
  solo identificadores y códigos de error.

### Key Entities

- **Servicio reservable**: servicio de la clínica que se puede reservar online. Nombre visible,
  duración, orden y si está activo.
- **Profesional reservable**: miembro del equipo que atiende citas; servicios que atiende y orden.
- **Cita**: servicio, profesional asignado, fecha y hora de inicio y fin (en la zona horaria de la
  clínica), estado (confirmada o cancelada; "realizada" se deduce), motivo opcional, quién la
  reservó (cuenta y mascota, o datos de invitado: nombre, teléfono, correo, nombre y especie de la
  mascota), origen de la cancelación (cliente o clínica) y marcas de tiempo.
- **Reglas de reserva**: cuadrícula de horas, antelación mínima, horizonte de reserva, plazo de
  cancelación y cambio, límites de citas activas por correo y por cuenta, antelación del
  recordatorio y plazo de anonimización. Datos
  configurables de la clínica.
- **Horario y cierres**: ya existen (feature 001) y se reutilizan.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante completa una reserva como invitado en menos de 3 minutos, y un cliente
  con sesión, en menos de 1 minuto y medio.
- **SC-002**: En pruebas de concurrencia con 20 intentos simultáneos sobre la misma franja, se
  confirma exactamente una cita y los demás reciben el aviso de franja ocupada.
- **SC-003**: El 100 % de las horas ofrecidas son reservables en el momento de mostrarse (ninguna
  fuera del horario, en un cierre, en el pasado o solapada).
- **SC-004**: Tras cancelar o cambiar una cita, la franja liberada vuelve a ofrecerse en la
  siguiente consulta de disponibilidad.
- **SC-005**: El 100 % de las citas confirmadas genera el correo al responsable y a la clínica; el
  95 % llega en menos de 1 minuto con el proveedor funcionando.
- **SC-006**: El recorrido completo de reserva, "Mis citas", cancelación y cambio pasa la revisión
  automática de accesibilidad sin errores y se completa solo con teclado y sin JavaScript.
- **SC-007**: Ningún intento de ver, cancelar o cambiar una cita ajena tiene éxito en las pruebas
  de acceso, y ningún enlace de gestión manipulado, caducado o de otra cita permite actuar ni ver
  datos.

## Assumptions

- **Servicios de la clínica de demo**: se cargan como reservables Consulta general (30 min),
  Vacunación (15 min), Revisión dental (30 min), Cirugía (60 min), Dermatología (30 min) y Otro
  (30 min). Se relacionan con los servicios ya publicados cuando corresponda. Son valores de
  ejemplo configurables.
- **Profesionales de la clínica de demo**: los tres veterinarios del equipo cargado en la feature
  001 son reservables; el auxiliar no. La cirugía solo la atiende el profesional de cirugía y la
  dermatología y la revisión dental, la profesional de esa especialidad; el resto lo atienden
  todos. Los nombres de la maqueta no se usan.
- **Reglas por defecto**: cuadrícula de 30 minutos, antelación mínima de 2 horas, horizonte de 60
  días, plazo de cancelación y cambio de 24 horas, 3 citas futuras activas por correo (invitados)
  y 9 por cuenta (clientes), recordatorio 24 horas antes y anonimización a los 12 meses.
- **Una cita, una mascota**: para varias mascotas se hacen varias citas.
- **Recordatorio solo por correo**: se incluye el recordatorio por correo que exige el principio
  VIII (FR-034); los recordatorios por SMS o WhatsApp están fuera de alcance.
- **Sin panel de administración**: continúa la excepción temporal al principio VIII de la feature
  001; la configuración de servicios, profesionales y reglas se carga con los datos de la clínica.
- **Citas existentes ante cambios de horario**: no se reprograman solas.
- **Fuera de alcance**: urgencias, pago de la cita, teleconsulta, recordatorios por SMS o
  WhatsApp, lista de espera, marcar citas como "no presentado" y gestión de agenda por la clínica
  más allá del enlace de gestión de FR-027 (la agenda completa llegará con el panel de
  administración).
- **Riesgo aceptado del enlace de gestión**: quien tenga acceso al buzón de la clínica, o a un
  correo reenviado, puede cancelar o cambiar esa cita. Se mitiga con el alcance de una sola cita,
  la caducidad, la página de confirmación y el registro de usos.
