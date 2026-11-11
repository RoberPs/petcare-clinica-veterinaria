# Feature Specification: Cuentas de cliente y mascotas

**Feature Branch**: `002-client-accounts-pets`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Cuentas de cliente y mascotas. Un dueño se registra, entra en su área personal y gestiona sus datos y los de sus mascotas. Referencia visual: design/login.html, registro.html, cuenta.html. […] Casos límite: correo ya registrado, enlace de verificación o recuperación caducado, intento de ver datos de otro cliente, cliente sin mascotas, contraseñas que no coinciden. Fuera de alcance: citas, pedidos, historial clínico, login social, doble factor. Las secciones «Mis citas» y «Mis pedidos» se rellenan en sus features."

## Contexto

Segunda entrega del producto. Un dueño de mascota crea su cuenta, verifica su correo, entra en su
área personal y gestiona sus datos y los de sus mascotas. Esta área es la base sobre la que las
features de citas y de tienda añadirán "Mis citas" y "Mis pedidos".

Como en la feature 001, los textos que dependen de la clínica (nombre, especies atendidas, textos
legales, remitente de los correos) son **datos configurables**, y el aviso de demostración se
aplica también a las páginas y correos de esta feature cuando está activado. Las maquetas
`design/login.html`, `design/registro.html` y `design/cuenta.html` dan la estructura; sus textos y
ejemplos (nombres, mascotas, pedidos) no se publican.

## Clarifications

### Session 2026-11-11

- Q: Cuando un cliente elimina su cuenta, ¿se borra en el acto o hay un periodo de gracia? → A: Borrado inmediato y definitivo tras confirmar con la contraseña; no hay periodo de gracia ni forma de recuperar la cuenta.
- Q: Si el dueño no sabe cuándo nació su mascota, ¿cómo la registra? → A: La fecha de nacimiento es obligatoria; si no se conoce con exactitud se introduce una aproximada, y así se explica junto al campo. No existe "Edad desconocida".
- Q: Al abrir el enlace de verificación, ¿el cliente entra ya en su área o pasa por "Iniciar sesión"? → A: Solo se verifica la cuenta y se lleva a "Iniciar sesión" con un mensaje de éxito y el correo ya escrito; nunca se inicia sesión automáticamente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear una cuenta y verificar el correo (Priority: P1)

Un visitante abre "Crear cuenta", rellena nombre, apellidos, correo, teléfono (opcional),
contraseña y su repetición, acepta la política de privacidad y los términos de uso y envía el
formulario. Recibe un correo con un enlace de verificación. Hasta que lo abre no puede entrar en el
área de cliente.

**Why this priority**: sin cuenta no existe nada más en esta feature, y la verificación garantiza
que el correo pertenece a quien se registra (necesario para recuperar la contraseña y para los
correos de citas y pedidos futuros).

**Independent Test**: registrar una cuenta nueva, comprobar que no se puede entrar antes de
verificar, abrir el enlace del correo y comprobar que después sí se puede entrar.

**Acceptance Scenarios**:

1. **Given** el formulario de registro con todos los campos obligatorios válidos y la casilla de
   privacidad y términos marcada, **When** el visitante lo envía, **Then** ve una página que le
   pide revisar su correo y recibe un correo con un enlace de verificación.
2. **Given** una cuenta sin verificar, **When** su titular intenta iniciar sesión con la contraseña
   correcta, **Then** no accede al área de cliente y ve un mensaje que le pide verificar el correo,
   con la opción de reenviar el enlace.
3. **Given** un enlace de verificación vigente, **When** el titular lo abre y pulsa "Confirmar mi
   correo", **Then** la cuenta queda verificada y llega a "Iniciar sesión" con un mensaje de éxito y su correo ya escrito en
   el campo; la verificación nunca inicia sesión por sí sola.
4. **Given** el formulario con las dos contraseñas distintas, **When** se envía, **Then** no se
   crea la cuenta y se muestra el error junto al campo "Repetir contraseña", conservando el resto
   de datos escritos (salvo las contraseñas).
5. **Given** el formulario sin la casilla de privacidad y términos marcada, **When** se envía,
   **Then** no se crea la cuenta y se indica junto a la casilla que es obligatoria.
6. **Given** un correo que ya tiene cuenta, **When** alguien se registra con él, **Then** ve la
   misma página de "revisa tu correo" que en un registro nuevo, no se crea una segunda cuenta y el
   titular de ese correo recibe un aviso de que alguien intentó registrarse, con un enlace para
   iniciar sesión o recuperar la contraseña.
7. **Given** un enlace de verificación caducado o ya usado, **When** se abre, **Then** se muestra
   una página que lo explica y permite pedir un enlace nuevo.

---

### User Story 2 - Iniciar y cerrar sesión con "Recordarme" (Priority: P1)

Un cliente verificado entra con su correo y su contraseña, opcionalmente marca "Recordarme" y
llega a su área personal. Desde cualquier página del área puede cerrar sesión.

**Why this priority**: es la puerta de entrada al área privada y la frontera que protege los datos
de cada cliente.

**Independent Test**: iniciar sesión con y sin "Recordarme", cerrar el navegador, volver a abrirlo y
comprobar la duración de la sesión; cerrar sesión y comprobar que las páginas privadas ya no se
muestran.

**Acceptance Scenarios**:

1. **Given** una cuenta verificada, **When** el cliente introduce su correo y su contraseña
   correctos, **Then** entra en el resumen de su área personal.
2. **Given** un correo o una contraseña incorrectos, **When** se intenta entrar, **Then** se muestra
   un único mensaje genérico ("Correo o contraseña incorrectos") que no revela si el correo existe.
3. **Given** que el cliente marcó "Recordarme", **When** cierra el navegador y vuelve dentro de los
   30 días siguientes, **Then** sigue con la sesión iniciada.
4. **Given** que el cliente no marcó "Recordarme", **When** cierra el navegador y vuelve, **Then**
   tiene que iniciar sesión de nuevo.
5. **Given** un cliente con sesión iniciada, **When** pulsa "Cerrar sesión", **Then** vuelve a la
   portada con un mensaje de confirmación y, si intenta abrir cualquier página privada (también con
   el botón "atrás" o con una dirección guardada), se le pide iniciar sesión.
6. **Given** un visitante sin sesión, **When** abre una página privada, **Then** se le lleva a
   "Iniciar sesión" y, tras entrar, vuelve a la página que pidió.
7. **Given** varios intentos fallidos seguidos sobre la misma cuenta o desde el mismo origen,
   **When** se supera el límite, **Then** se bloquean temporalmente nuevos intentos con un mensaje
   que indica cuándo volver a probar.
8. **Given** "Mi cuenta" en la cabecera, **When** lo pulsa un visitante sin sesión, **Then** llega a
   "Iniciar sesión"; **When** lo pulsa un cliente con sesión, **Then** llega a su resumen.

---

### User Story 3 - Gestionar mis mascotas (Priority: P1)

El cliente añade una mascota con su nombre, su especie y su fecha de nacimiento, la edita o la
elimina. Cada mascota se muestra con su edad.

**Why this priority**: las mascotas son el dato central de la relación con la clínica y la base de
las citas futuras.

**Independent Test**: con una cuenta verificada, añadir dos mascotas, editar una, eliminar otra y
comprobar la lista después de cada acción.

**Acceptance Scenarios**:

1. **Given** el formulario "Añadir mascota" con nombre, especie y fecha de nacimiento válidos,
   **When** el cliente lo envía, **Then** vuelve a "Mis mascotas", ve la nueva mascota en la lista
   con su especie y su edad, y un mensaje de confirmación.
2. **Given** una mascota nacida hace 4 años y 3 meses, **When** se muestra, **Then** su edad aparece
   como "4 años"; **Given** una de 1 año, **Then** "1 año"; **Given** una de menos de un año,
   **Then** se muestra en meses ("5 meses", "1 mes") o "Menos de 1 mes".
3. **Given** una mascota existente, **When** el cliente edita sus datos y guarda, **Then** la lista
   muestra los datos nuevos en cuanto vuelve a ella.
4. **Given** una mascota existente, **When** el cliente pide eliminarla, **Then** se le pide
   confirmación nombrando a la mascota y, al confirmar, desaparece de la lista.
5. **Given** una fecha de nacimiento futura, vacía o con un formato no válido, **When** se envía el
   formulario, **Then** no se guarda y el error aparece junto al campo.
6. **Given** un cliente sin mascotas, **When** abre "Mis mascotas" o el resumen, **Then** ve un
   estado vacío que lo explica y un botón para añadir la primera.
7. **Given** la mascota de otro cliente, **When** alguien intenta verla, editarla o eliminarla (por
   ejemplo, cambiando su identificador en la dirección o en el formulario), **Then** la acción se
   rechaza igual que si la mascota no existiera y no se revela ningún dato.

---

### User Story 4 - Resumen del área personal (Priority: P2)

Al entrar, el cliente ve un saludo con su nombre, sus mascotas y accesos a "Mis mascotas",
"Mis citas", "Mis pedidos" y "Datos personales", además de "Cerrar sesión".

**Why this priority**: orienta al cliente, pero las acciones esenciales ya existen sin él.

**Independent Test**: entrar con una cuenta con y sin mascotas y comprobar el contenido del resumen
y el destino de cada acceso.

**Acceptance Scenarios**:

1. **Given** un cliente con mascotas, **When** abre su área, **Then** ve "Hola, <nombre>", sus
   mascotas con especie y edad, y el menú del área (Resumen, Mis mascotas, Mis citas, Mis pedidos,
   Datos personales, Cerrar sesión), con la sección actual marcada.
2. **Given** que las citas y la tienda aún no existen, **When** el cliente pulsa "Mis citas",
   "Mis pedidos" o "Pedir cita" en una mascota, **Then** llega a la página "Próximamente" de esa
   sección, como en la feature 001.
3. **Given** un cliente sin mascotas, **When** abre el resumen, **Then** ve el estado vacío de
   mascotas con el botón para añadir la primera.

---

### User Story 5 - Recuperar la contraseña (Priority: P2)

Un cliente que no recuerda su contraseña la pide desde "¿Olvidaste tu contraseña?", recibe un
enlace por correo y elige una nueva.

**Why this priority**: sin ella, una contraseña olvidada deja la cuenta inservible; no bloquea el
uso inicial.

**Independent Test**: pedir la recuperación, abrir el enlace, fijar una contraseña nueva, entrar con
ella y comprobar que la antigua ya no funciona.

**Acceptance Scenarios**:

1. **Given** el formulario de recuperación, **When** se introduce cualquier correo, **Then** se
   muestra siempre el mismo mensaje ("Si existe una cuenta con ese correo, te hemos enviado un
   enlace") y solo se envía el correo si la cuenta existe.
2. **Given** un enlace de recuperación vigente, **When** el cliente escribe y repite una contraseña
   nueva válida, **Then** la contraseña cambia, el enlace deja de servir, se cierran todas las
   sesiones abiertas de esa cuenta y el cliente recibe un correo que le avisa del cambio.
3. **Given** un enlace de recuperación caducado o ya usado, **When** se abre, **Then** se explica y
   se ofrece pedir uno nuevo.
4. **Given** una cuenta sin verificar, **When** su titular completa la recuperación, **Then** la
   cuenta queda también verificada, porque ha demostrado controlar el correo.

---

### User Story 6 - Editar mis datos personales (Priority: P2)

En "Datos personales" el cliente cambia su nombre, apellidos, teléfono y dirección postal, su
preferencia de recibir consejos y novedades, y su contraseña.

**Why this priority**: mantener los datos al día es un derecho (rectificación) y será necesario
para citas y envíos, pero no bloquea el uso básico.

**Independent Test**: cambiar cada dato, guardar y comprobar que persiste tras cerrar y abrir
sesión.

**Acceptance Scenarios**:

1. **Given** "Datos personales" con los datos actuales, **When** el cliente cambia nombre,
   apellidos, teléfono o dirección y guarda, **Then** ve un mensaje de confirmación y los datos
   nuevos, también en el saludo del resumen.
2. **Given** un teléfono o un código postal con formato no válido, **When** se guarda, **Then** no se
   guarda nada y el error aparece junto al campo.
3. **Given** el apartado de contraseña, **When** el cliente escribe la actual correctamente y una
   nueva repetida, **Then** la contraseña cambia, se cierran sus demás sesiones y recibe un correo
   de aviso; **When** la actual es incorrecta, **Then** no cambia y el error aparece junto al campo.
4. **Given** el correo de la cuenta, **When** el cliente abre "Datos personales", **Then** lo ve en
   modo de solo lectura (cambiarlo queda fuera de alcance).

---

### User Story 7 - Descargar mis datos y eliminar mi cuenta (Priority: P2)

Desde "Datos personales" el cliente descarga un archivo con todos sus datos y puede eliminar su
cuenta de forma definitiva.

**Why this priority**: son derechos RGPD (portabilidad y supresión) exigidos por la constitución,
pero no forman parte del uso diario.

**Independent Test**: descargar el archivo y comprobar su contenido; eliminar la cuenta y comprobar
que no se puede entrar ni acceder a ninguno de sus datos.

**Acceptance Scenarios**:

1. **Given** un cliente con sesión, **When** pulsa "Descargar mis datos", **Then** recibe un archivo
   legible por máquina con sus datos de cuenta, su dirección, sus preferencias, sus consentimientos
   (con fecha) y sus mascotas, y nada de otros clientes.
2. **Given** un cliente con sesión, **When** pide eliminar su cuenta, **Then** se le explica qué se
   borra, se le pide su contraseña para confirmar y, al confirmar, la cuenta y sus mascotas se
   eliminan, se cierran todas sus sesiones, vuelve a la portada con un mensaje y recibe un correo
   que confirma la eliminación.
3. **Given** una cuenta eliminada, **When** alguien intenta entrar con sus credenciales o abrir un
   enlace de verificación o recuperación emitido antes, **Then** se comporta como si la cuenta no
   existiera.
4. **Given** una cuenta eliminada, **When** se registra de nuevo alguien con el mismo correo,
   **Then** se crea una cuenta nueva sin ningún dato de la anterior.
5. **Given** una contraseña de confirmación incorrecta, **When** se pide eliminar la cuenta,
   **Then** no se elimina nada y el error aparece junto al campo.

---

### User Story 8 - Preferencia de consejos y novedades (Priority: P3)

Al registrarse, el visitante puede marcar, de forma opcional, que quiere recibir consejos de salud
y novedades por correo. Puede cambiarlo después en "Datos personales".

**Why this priority**: prepara el boletín futuro; no aporta valor hasta que exista ese envío.

**Independent Test**: registrarse con y sin la casilla, comprobar el estado en "Datos personales" y
cambiarlo.

**Acceptance Scenarios**:

1. **Given** el formulario de registro, **When** se carga, **Then** la casilla de consejos y
   novedades aparece desmarcada y separada de la de privacidad y términos.
2. **Given** que el visitante la marcó al registrarse, **When** abre "Datos personales", **Then** la
   ve activada; **When** la desactiva y guarda, **Then** queda desactivada y se registra la fecha
   del cambio.

---

### Edge Cases

- **Correo ya registrado**: misma respuesta que un registro nuevo y aviso al titular (US1-6). Si la
  cuenta existente está sin verificar, se le reenvía el enlace de verificación en lugar del aviso.
- **Correos en mayúsculas o con espacios**: se comparan sin distinguir mayúsculas y sin espacios al
  principio o al final; "Ana@Correo.es" y "ana@correo.es" son la misma cuenta.
- **Enlace de verificación o de recuperación caducado, usado o manipulado**: página explicativa con
  opción de pedir otro; nunca un error genérico.
- **Varios enlaces pedidos seguidos**: solo vale el más reciente de cada tipo.
- **Reenvíos y peticiones repetidas**: el reenvío de verificación y la recuperación se limitan por
  correo y por origen para evitar abusos (ver FR-033).
- **Intento de ver datos de otro cliente**: cualquier identificador ajeno se trata como inexistente
  (US3-7); el intento se registra sin datos personales.
- **Cliente sin mascotas**: estado vacío con acción para añadir (US3-6, US4-3).
- **Contraseñas que no coinciden**: error junto al campo de repetición (US1-4, US5, US6).
- **Contraseña demasiado corta o muy común**: se rechaza con un mensaje que explica el requisito.
- **Doble envío de un formulario** (doble clic, recarga o "atrás"): no crea dos cuentas ni dos
  mascotas; la segunda petición recibe el mismo resultado que la primera.
- **Sesión caducada mientras se rellena un formulario**: al enviarlo se pide iniciar sesión y, tras
  entrar, se vuelve al formulario (los datos escritos pueden perderse; se avisa).
- **Mascota eliminada en otra pestaña**: editarla después responde que ya no existe.
- **Límite de mascotas**: una cuenta tiene como máximo 30 mascotas; al llegar se indica el límite.
- **Cuenta no verificada que nunca se verifica**: se elimina automáticamente a los 7 días.
- **Fallo al enviar un correo** (verificación, recuperación, avisos): el registro o la petición se
  guardan igualmente y el correo se reintenta; el usuario puede pedir el reenvío.
- **Sin JavaScript**: todos los flujos funcionan (registro, inicio y cierre de sesión, mascotas,
  datos personales, descarga y eliminación).

## Requirements *(mandatory)*

### Functional Requirements

#### Registro y verificación

- **FR-001**: El sistema MUST permitir crear una cuenta con nombre, apellidos, correo electrónico,
  teléfono (opcional), contraseña y repetición de la contraseña, y la aceptación obligatoria de la
  política de privacidad y de los términos de uso en una sola casilla con enlaces a ambos textos.
- **FR-002**: Finalidad de cada campo (minimización, principio IV): nombre y apellidos para
  identificar al cliente en la clínica; correo para acceder, verificar la cuenta y recibir avisos
  de la cuenta; teléfono (opcional) para que la clínica pueda llamarle sobre sus citas o pedidos;
  contraseña para proteger el acceso; dirección (opcional, solo en "Datos personales") para los
  envíos de la tienda futura.
- **FR-003**: El sistema MUST validar en el servidor: nombre y apellidos de 1 a 80 caracteres;
  correo con formato válido y como máximo 254 caracteres; teléfono, si se da, con un formato
  telefónico válido (con o sin prefijo internacional); contraseña de 10 a 128 caracteres, que no
  esté en una lista de contraseñas comunes ni coincida con el correo; y repetición idéntica.
- **FR-004**: El sistema MUST tratar el correo sin distinguir mayúsculas y sin espacios en los
  extremos, y MUST impedir dos cuentas con el mismo correo.
- **FR-005**: Ante un correo ya registrado, el sistema MUST responder igual que ante un registro
  nuevo y MUST enviar al titular un aviso (o un nuevo enlace de verificación si la cuenta sigue
  sin verificar). La respuesta MUST NOT revelar si el correo existe.
- **FR-006**: El sistema MUST enviar un correo de verificación con un enlace de un solo uso que
  caduca a las 24 horas. Pedir un enlace nuevo invalida los anteriores. Abrir el enlace no gasta
  nada por sí solo: la verificación se completa al pulsar "Confirmar mi correo" en la página del
  enlace, para que los programas que revisan los enlaces de los correos no lo consuman.
- **FR-007**: Una cuenta sin verificar MUST NOT poder acceder al área de cliente. Al intentar
  entrar con la contraseña correcta se MUST mostrar que falta verificar y ofrecer el reenvío.
- **FR-008**: Las cuentas sin verificar MUST eliminarse automáticamente a los 7 días de su
  creación.
- **FR-009**: El sistema MUST registrar la aceptación de la política de privacidad y los términos
  con su fecha y la versión vigente de los textos.

#### Sesión

- **FR-010**: El sistema MUST permitir iniciar sesión con correo y contraseña. Los errores de
  credenciales MUST mostrar un único mensaje genérico.
- **FR-011**: Sin "Recordarme", la sesión MUST terminar al cerrar el navegador, tras 2 horas sin
  actividad o, como mucho, a las 12 horas de iniciarla. Con "Recordarme", la sesión MUST durar hasta 30 días.
- **FR-012**: "Cerrar sesión" MUST invalidar la sesión en el servidor, de modo que ninguna página
  privada sea accesible después, ni desde el historial del navegador.
- **FR-013**: Las páginas privadas MUST NOT quedar almacenadas en cachés compartidas ni en la caché
  del navegador de forma que se puedan ver tras cerrar sesión.
- **FR-014**: Un visitante sin sesión que abre una página privada MUST ser llevado a "Iniciar
  sesión" y, tras entrar, a la página que pidió (solo si es una página de la propia web).
- **FR-015**: El sistema MUST limitar los intentos fallidos de inicio de sesión: como máximo 5 por
  cuenta cada 15 minutos y 20 por origen cada 15 minutos; al superarlos, se bloquean nuevos
  intentos temporalmente y se indica cuándo volver a probar.
- **FR-016**: Cambiar o recuperar la contraseña y eliminar la cuenta MUST cerrar todas las demás
  sesiones de esa cuenta.
- **FR-017**: "Mi cuenta" en la cabecera MUST llevar a "Iniciar sesión" sin sesión y al resumen con
  sesión. Deja de llevar a "Próximamente".

#### Recuperación de contraseña

- **FR-018**: El sistema MUST permitir pedir la recuperación indicando el correo, con una respuesta
  idéntica exista o no la cuenta.
- **FR-019**: El enlace de recuperación MUST ser de un solo uso, caducar a la hora y quedar
  invalidado al pedir otro o al cambiar la contraseña.
- **FR-020**: Tras recuperar o cambiar la contraseña, el sistema MUST enviar un correo de aviso al
  titular, sin incluir la contraseña.
- **FR-021**: Completar la recuperación MUST dejar verificada una cuenta que no lo estuviera.

#### Mascotas

- **FR-022**: El cliente MUST poder añadir, editar y eliminar sus mascotas con nombre (1 a 40
  caracteres), especie y fecha de nacimiento.
- **FR-023**: La especie MUST elegirse de la lista de especies atendidas configurada por la
  clínica, más la opción "Otra". No hay especies escritas en el producto.
- **FR-024**: La fecha de nacimiento MUST ser obligatoria, no futura y no anterior a 40 años. Si el
  dueño no la conoce con exactitud, indica una aproximada (se explica junto al campo). Toda
  mascota tiene, por tanto, una edad que mostrar.
- **FR-025**: La edad MUST calcularse en la zona horaria de la clínica a partir de la fecha de
  nacimiento y mostrarse en años cumplidos ("1 año", "4 años"); por debajo de un año, en meses
  ("1 mes", "5 meses") o "Menos de 1 mes".
- **FR-026**: Tras añadir, editar o eliminar, el cliente MUST volver a la lista con el cambio ya
  reflejado y un mensaje de confirmación.
- **FR-027**: Eliminar una mascota MUST pedir confirmación nombrando a la mascota.
- **FR-028**: Una cuenta MUST tener como máximo 30 mascotas.
- **FR-029**: La lista MUST ordenarse por nombre y mostrar un estado vacío con acción para añadir
  cuando no haya mascotas.

#### Área personal y datos personales

- **FR-030**: El área de cliente MUST tener un menú con Resumen, Mis mascotas, Mis citas, Mis
  pedidos, Datos personales y Cerrar sesión, con la sección actual marcada de forma accesible.
- **FR-031**: El resumen MUST mostrar el saludo con el nombre, las mascotas (con especie y edad) y
  los accesos a las demás secciones. "Mis citas", "Mis pedidos" y "Pedir cita" MUST llevar a la
  página "Próximamente" de su sección hasta que existan sus features.
- **FR-032**: En "Datos personales" el cliente MUST poder cambiar nombre, apellidos, teléfono,
  dirección postal (calle y número, código postal, localidad y provincia, todos opcionales pero
  con código postal y localidad juntos si se da alguno), la preferencia de consejos y novedades y
  su contraseña (con la actual). El correo se muestra en modo de solo lectura.

#### Abuso, autorización y privacidad

- **FR-033**: El sistema MUST limitar por correo y por origen el registro, el reenvío de
  verificación y la recuperación: como máximo 3 correos de cada tipo por dirección y hora, y 10
  peticiones por origen cada 10 minutos.
- **FR-034**: Cada petición al área de cliente MUST comprobar en el servidor que el recurso
  pertenece al cliente con sesión. Un recurso ajeno MUST responder como inexistente.
- **FR-035**: Todos los formularios que cambian datos MUST estar protegidos frente a peticiones
  falsificadas desde otros sitios y frente a envíos duplicados.
- **FR-036**: Las contraseñas MUST guardarse solo como hash robusto con sal; nunca se envían por
  correo ni aparecen en registros.
- **FR-037**: Los registros del sistema MUST NOT contener correos, nombres, teléfonos, direcciones,
  datos de mascotas ni contraseñas; solo identificadores y códigos de evento (inicio de sesión,
  bloqueo, intento de acceso ajeno…).

#### Portabilidad y supresión

- **FR-038**: "Descargar mis datos" MUST entregar un archivo legible por máquina con los datos de
  la cuenta, la dirección, las preferencias, los consentimientos con sus fechas y las mascotas.
- **FR-039**: Eliminar la cuenta MUST pedir la contraseña, borrar de forma definitiva la cuenta,
  sus datos personales, sus mascotas, sus sesiones y sus enlaces pendientes en el mismo momento
  (sin periodo de gracia ni posibilidad de recuperarla), y enviar un correo de confirmación. Después, ningún dato personal de la cuenta MUST ser accesible desde la web.
- **FR-040**: Tras la eliminación, el correo MUST quedar libre para un registro nuevo.

#### Preferencia de comunicaciones

- **FR-041**: La casilla de consejos y novedades MUST ser opcional, estar desmarcada por defecto y
  separada de la aceptación de privacidad y términos. El sistema MUST guardar su estado y la fecha
  de cada cambio. Esta feature no envía boletines.

#### Correos, accesibilidad y diseño

- **FR-042**: Los correos de la cuenta (verificación, aviso de registro duplicado, recuperación,
  aviso de cambio de contraseña y confirmación de eliminación) MUST salir con el nombre de la
  clínica configurado, en español, sin datos de la mascota ni otros datos que no hagan falta, e
  incluir el aviso de demostración cuando esté activado.
- **FR-043**: El envío de correos MUST ser fiable: si falla, se reintenta sin bloquear al usuario,
  como en la feature 001.
- **FR-044**: Todas las páginas de esta feature MUST funcionar sin JavaScript, cumplir WCAG 2.2 AA
  (errores asociados a su campo, foco en el resumen de errores, foco visible, teclado) y usar solo
  los componentes y tokens del design system, siguiendo la estructura de las maquetas de
  referencia.
- **FR-045**: Las páginas de "Iniciar sesión", "Crear cuenta" y recuperación MUST NOT indexarse en
  buscadores, y las del área de cliente MUST NOT ser indexables.

### Key Entities

- **Cuenta de cliente**: persona registrada. Nombre, apellidos, correo (único), teléfono
  (opcional), dirección postal (opcional), hash de la contraseña, estado de verificación, fecha de
  alta, preferencia de consejos y novedades con su fecha de cambio.
- **Consentimiento**: aceptación de la política de privacidad y los términos (versión y fecha) y
  cambios de la preferencia de comunicaciones. Pertenece a una cuenta.
- **Sesión**: acceso iniciado por una cuenta, con su duración ("Recordarme" o no) y su última
  actividad. Se puede invalidar en el servidor.
- **Enlace de un solo uso**: de verificación o de recuperación. Pertenece a una cuenta, tiene tipo,
  caducidad y estado (vigente, usado, invalidado). Solo se guarda de forma que no permita
  reconstruir el enlace.
- **Mascota**: pertenece a una única cuenta. Nombre, especie y fecha de nacimiento.
- **Especie atendida**: dato configurable de la clínica (nombre visible y orden), usado en el
  formulario de mascotas.
- **Intento de acceso**: registro mínimo para limitar intentos (cuenta u origen, momento,
  resultado), sin datos personales en claro, que se purga cuando deja de ser útil.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante completa el registro en menos de 2 minutos desde el móvil, y el correo
  de verificación llega en menos de 1 minuto en el 95 % de los casos.
- **SC-002**: Un cliente añade su primera mascota en menos de 1 minuto desde que entra en su área.
- **SC-003**: El 100 % de los intentos automatizados de leer, editar o eliminar datos de otro
  cliente se rechazan sin revelar ningún dato.
- **SC-004**: Tras cerrar sesión o eliminar la cuenta, el 100 % de las páginas privadas probadas
  piden iniciar sesión, también al volver con el botón "atrás".
- **SC-005**: Las respuestas de registro, inicio de sesión y recuperación no permiten distinguir si
  un correo tiene cuenta (mismo mensaje y misma página en todos los casos).
- **SC-006**: El 100 % de los enlaces caducados, usados o manipulados muestran una página
  explicativa con la opción de pedir otro.
- **SC-007**: Todos los flujos de la feature se completan solo con teclado y sin JavaScript, y las
  páginas no tienen errores de accesibilidad en la comprobación automática.
- **SC-008**: El archivo de datos descargado contiene el 100 % de los datos que la cuenta tiene
  guardados y ninguno de otra cuenta.

## Assumptions

- **Mi cuenta en la cabecera**: pasa de "Próximamente" a "Iniciar sesión" o al resumen (FR-017).
  "Mis citas", "Mis pedidos" y "Pedir cita" siguen llevando a "Próximamente" (patrón de la feature
  001) hasta que existan sus features. El bloque "Últimos pedidos" de la maqueta no se muestra.
- **Verificación**: al abrir el enlace, la cuenta queda verificada y se lleva al cliente a "Iniciar
  sesión" con un mensaje y su correo ya escrito; no se inicia sesión automáticamente en ningún
  caso, para que un enlace reenviado o abierto en otro dispositivo no dé acceso por sí solo.
- **Cambio de correo**: fuera de alcance; requiere reverificación y se abordará más adelante.
- **Cambio de contraseña desde el área**: se incluye en "Datos personales" porque un producto real
  lo necesita (principio VIII), aunque la descripción solo pedía la recuperación.
- **Eliminación inmediata y definitiva**: no hay periodo de gracia ni papelera. Como aún no hay
  citas ni pedidos, no hay datos que conservar por obligación legal; las features de citas y
  pedidos definirán qué se anonimiza y qué se conserva.
- **Formato de descarga**: un único archivo estructurado y estándar, con nombres de campo claros.
- **Especies**: se cargan con el resto de los datos configurables de la clínica; la clínica de
  demostración trae una lista de ejemplo.
- **Sin panel de administración**: la clínica no gestiona cuentas en esta feature; continúa la
  excepción temporal al principio VIII ya registrada en la feature 001.
- **Sin login social, doble factor, historial clínico, foto de mascota, raza, sexo ni peso**: fuera
  de alcance; la ficha de mascota se ampliará cuando lo requiera la feature de citas.
- **Boletín**: solo se guarda la preferencia; el envío de consejos y novedades es otra feature.
- **Plazos**: verificación 24 h, recuperación 1 h, "Recordarme" 30 días, sesión normal 2 h de
  inactividad con un tope de 12 h y purga de cuentas sin verificar a los 7 días. Son valores por defecto razonables
  que pueden ajustarse por configuración.
- **Dependencias**: reutiliza de la feature 001 la cabecera y el pie, la página "Próximamente", el
  aviso de demostración, la bandeja de salida de correos, el límite por origen (incluido el
  agrupamiento IPv6) y la obtención de la IP real del visitante.
