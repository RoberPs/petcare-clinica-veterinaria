# Feature Specification: Consejos de salud y boletín

**Feature Branch**: `006-health-tips-newsletter`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Consejos de salud y boletín. Un visitante lee artículos y noticias sobre el cuidado de su mascota y puede suscribirse al boletín. Referencia visual: design/consejos.html, articulo.html, index.html (bloque de boletín). User stories: P1 listado de artículos y noticias con categoría (perro, gato, otros animales), imagen y título; P1 leer un artículo con migas de pan, categoría, preámbulo, imagen, secciones y bloque final que lleva a pedir cita; P2 filtrar por categoría y buscar por texto, indicando cuando no hay resultados; P2 suscribirse al boletín con el correo y aceptando su política, con correo de confirmación y baja desde cualquier envío; P3 el cliente que marcó novedades al registrarse figura como suscrito. Casos límite: correo ya suscrito, enlace de confirmación caducado, búsqueda sin resultados, artículo sin imagen. Fuera de alcance: gestión de artículos desde el panel de administración, comentarios, envío de campañas."

Sexta entrega del producto. Sustituye la página provisional de "Consejos de salud" por una sección
real de artículos y noticias, y pone en marcha la lista del boletín con doble confirmación. La
preferencia de "consejos y novedades" de la feature 002 pasa a formar parte de esa misma lista.

## Clarifications

### Session 2026-11-16

- Q: ¿Las noticias tienen que llevar también una categoría de animal, o pueden no tenerla? → A: Los
  artículos llevan siempre categoría; las noticias pueden no llevarla y se muestran como "General";
  el filtro por especie no las incluye.
- Q: Si alguien se suscribe con un correo ya confirmado, ¿se le envía algún correo? → A: No; la
  pantalla muestra el mismo mensaje de siempre y no se envía nada.
- Q: Tras una baja, ¿qué se conserva del suscriptor? → A: Se borra el correo y se conserva solo una
  constancia anónima (huella no reversible del correo, fechas y versión de la política) durante
  3 años.
- Q: ¿Cómo se presentan los resultados al filtrar o buscar, y cómo se paginan los dos bloques? →
  A: Sin filtro ni búsqueda: "Artículos" paginado de 12 en 12 y "Noticias" con las 3 últimas y un
  enlace "Ver todas las noticias". Con filtro o búsqueda: una sola lista combinada, ordenada por
  fecha, con cada tarjeta marcada como "Artículo" o "Noticia" y paginada de 12 en 12.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el listado de artículos y noticias (Priority: P1)

El visitante entra en "Consejos de salud" desde la cabecera o la portada y ve, por un lado, los
artículos y, por otro, las noticias. Cada elemento muestra su imagen, su categoría (perro, gato u
otros animales) y su título, y lleva a su página.

**Why this priority**: es la puerta de entrada al contenido; sin ella la sección no existe.

**Independent Test**: cargar contenido de ejemplo, abrir la sección y comprobar que aparecen todos
los artículos y noticias publicados, ordenados del más reciente al más antiguo, con su categoría,
imagen y título, y que cada uno abre su página.

**Acceptance Scenarios**:

1. **Given** artículos y noticias publicados, **When** el visitante abre "Consejos de salud",
   **Then** ve el bloque "Artículos" (12 por página) y el bloque "Noticias" (las 3 últimas y un
   enlace "Ver todas las noticias"), ordenados por fecha de publicación descendente, y cada
   tarjeta muestra imagen, categoría (o "General" en una noticia sin categoría) y título.
2. **Given** el enlace "Consejos de salud" de la cabecera y de la portada, **When** el visitante lo
   sigue, **Then** llega a esta sección y no a la página de "próximamente".
3. **Given** más de 12 artículos, **When** el visitante llega al final del bloque, **Then** puede
   pasar a la página siguiente; **When** pulsa "Ver todas las noticias", **Then** ve todas las
   noticias, paginadas de 12 en 12.
4. **Given** un elemento con fecha de publicación futura o despublicado, **When** se carga el
   listado, **Then** no aparece.
5. **Given** que no hay ningún elemento publicado de un tipo, **When** se carga la sección,
   **Then** ese bloque muestra un mensaje de vacío en lugar de una rejilla en blanco.

---

### User Story 2 - Leer un artículo (Priority: P1)

El visitante abre un artículo o una noticia y lo lee completo: migas de pan, categoría, título,
fecha, preámbulo, imagen principal, cuerpo organizado en secciones y, al final, un bloque que le
invita a pedir cita.

**Why this priority**: es el valor principal de la sección y su conexión con el negocio (la cita).

**Independent Test**: abrir un artículo de ejemplo y comprobar cada parte de la página, que las
migas llevan al listado y que el bloque final lleva a pedir cita.

**Acceptance Scenarios**:

1. **Given** un artículo publicado, **When** el visitante lo abre, **Then** ve las migas de pan
   (Inicio › Consejos de salud › título), la categoría, el título, la fecha de publicación, el
   preámbulo, la imagen con texto alternativo y el cuerpo con sus encabezados de sección.
2. **Given** la página de un artículo, **When** el visitante llega al final, **Then** ve un bloque
   que le propone ponerse en contacto con un veterinario y un botón "Pide cita" que lleva al flujo
   de reserva.
3. **Given** la categoría mostrada en el artículo, **When** el visitante la pulsa, **Then** vuelve
   al listado filtrado por esa categoría.
4. **Given** una dirección de artículo que no existe o no está publicado, **When** se abre,
   **Then** se muestra la página de "no encontrado" con su código de error correspondiente.
5. **Given** un artículo, **When** se comparte su enlace o lo indexa un buscador, **Then** tiene
   título, descripción e imagen propios en sus metadatos.

---

### User Story 3 - Filtrar por categoría y buscar (Priority: P2)

El visitante acota el listado por categoría (perro, gato, otros animales) y busca por texto entre
los artículos y noticias.

**Why this priority**: mejora la navegación cuando hay mucho contenido, pero el listado ya es útil
sin ella.

**Independent Test**: filtrar por cada categoría, buscar un término presente y uno ausente, y
comprobar los resultados y el mensaje de "sin resultados", también sin JavaScript.

**Acceptance Scenarios**:

1. **Given** el listado, **When** el visitante elige una categoría, **Then** solo ve los
   elementos de esa categoría (las noticias "General" no se incluyen), la categoría elegida queda
   marcada como activa y la dirección de la página lo refleja, de modo que se puede compartir.
2. **Given** un filtro o una búsqueda activos, **When** se muestran los resultados, **Then**
   aparecen en una sola lista ordenada por fecha, con cada tarjeta marcada como "Artículo" o
   "Noticia" y paginada de 12 en 12 sin perder el criterio.
3. **Given** el buscador, **When** el visitante busca un texto, **Then** ve los elementos cuyo
   título, preámbulo o cuerpo lo contienen, sin distinguir mayúsculas, minúsculas ni tildes.
4. **Given** una categoría elegida y un texto buscado, **When** se combinan, **Then** se aplican
   las dos condiciones a la vez.
5. **Given** una búsqueda o un filtro sin coincidencias, **When** se muestra el resultado,
   **Then** aparece un mensaje que indica que no hay resultados para ese criterio y un enlace para
   quitar el filtro y la búsqueda.
6. **Given** que el visitante no tiene JavaScript, **When** filtra o busca, **Then** obtiene el
   mismo resultado.

---

### User Story 4 - Suscribirse al boletín (Priority: P2)

El visitante escribe su correo en el bloque del boletín (portada y sección de consejos), acepta la
política del boletín y recibe un correo para confirmar la suscripción. Solo queda suscrito al
abrir el enlace. Desde cualquier correo del boletín puede darse de baja.

**Why this priority**: crea la lista de suscriptores con consentimiento demostrable, pero el
contenido se puede leer sin ella.

**Independent Test**: suscribirse con un correo nuevo, comprobar el correo de confirmación, abrir
el enlace, comprobar el estado "confirmado" y darse de baja desde el enlace del correo.

**Acceptance Scenarios**:

1. **Given** el bloque del boletín, **When** se carga, **Then** muestra el campo de correo, una
   casilla desmarcada de aceptación de la política del boletín con enlace a ella y el botón
   "Suscribirme".
2. **Given** un correo válido y la casilla marcada, **When** el visitante envía el formulario,
   **Then** ve un mensaje que le pide revisar su correo y recibe un correo con un enlace de
   confirmación.
3. **Given** el correo de confirmación, **When** el visitante abre el enlace dentro de su plazo,
   **Then** la suscripción queda confirmada, ve una página de confirmación y queda registrada la
   fecha y la versión de la política aceptada.
4. **Given** un correo vacío, con formato no válido o la casilla sin marcar, **When** se envía,
   **Then** no se suscribe nada y el error aparece junto al campo correspondiente.
5. **Given** cualquier correo enviado a un suscriptor (incluido el de confirmación), **When** pulsa
   el enlace de baja, **Then** llega a una página que le permite confirmar la baja con un solo
   botón, sin iniciar sesión, y tras confirmarla deja de figurar como suscrito.
6. **Given** un suscriptor que se ha dado de baja, **When** vuelve a abrir el enlace de baja,
   **Then** ve que ya no está suscrito, sin error.

---

### User Story 5 - Cliente con "consejos y novedades" (Priority: P3)

El cliente que marcó "consejos y novedades" al registrarse (o después en "Datos personales") figura
como suscrito al boletín, y la preferencia de su cuenta y su estado en el boletín van siempre a la
par.

**Why this priority**: une la preferencia de la feature 002 con la lista real, pero solo afecta a
clientes registrados que lo pidieron.

**Independent Test**: registrar y verificar una cuenta con la casilla marcada, comprobar que figura
como suscrito; darse de baja desde un correo y comprobar que la preferencia aparece desactivada en
"Datos personales", y al revés.

**Acceptance Scenarios**:

1. **Given** un cliente que marcó la casilla al registrarse, **When** verifica su correo, **Then**
   figura como suscrito confirmado sin pasar por otra confirmación, porque la verificación ya
   acredita que el correo es suyo.
2. **Given** un cliente suscrito, **When** desactiva la preferencia en "Datos personales", **Then**
   deja de figurar como suscrito; **When** la activa de nuevo, **Then** vuelve a figurar.
3. **Given** un cliente suscrito, **When** se da de baja desde el enlace de un correo, **Then** la
   preferencia de su cuenta aparece desactivada, con la fecha del cambio.
4. **Given** un visitante que confirmó la suscripción con el mismo correo de una cuenta existente,
   **When** abre "Datos personales", **Then** ve la preferencia activada.
5. **Given** un cliente suscrito, **When** elimina su cuenta, **Then** deja de figurar como
   suscrito y su correo sale de la lista.

---

### Edge Cases

- **Correo ya suscrito y confirmado**: el formulario muestra el mismo mensaje que con un correo
  nuevo, para no revelar quién está suscrito; no se crea un segundo registro ni se envía ningún
  correo.
- **Correo con suscripción pendiente**: se envía un nuevo enlace de confirmación y el anterior deja
  de valer; no se duplica el registro.
- **Enlace de confirmación caducado, sustituido o no válido**: se muestra una misma página que
  explica que el enlace ya no sirve y permite pedir uno nuevo; no se confirma nada.
- **Enlace de confirmación o de baja manipulado**: se trata como no válido, sin dar detalles.
- **Enlace de confirmación abierto dos veces**: la segunda vez se informa de que la suscripción ya
  está confirmada, sin error.
- **Reenvíos repetidos del formulario**: un doble envío no genera dos correos; hay un límite de
  envíos por origen y de correos de confirmación por dirección.
- **Búsqueda sin resultados o con solo espacios**: con resultados vacíos se muestra el mensaje de
  "sin resultados"; una búsqueda vacía o de solo espacios equivale a no buscar.
- **Búsqueda con texto muy largo o caracteres especiales**: se recorta a una longitud máxima y se
  trata como texto literal.
- **Categoría inexistente en la dirección**: se ignora el filtro y se muestra el listado completo.
- **Página de resultados fuera de rango**: se muestra la última página válida o el mensaje de vacío.
- **Artículo sin imagen**: la tarjeta y la página del artículo muestran un marcador neutro del
  sistema de diseño, sin imagen rota ni hueco, y los metadatos para compartir usan la imagen por
  defecto de la clínica.
- **Noticia sin categoría**: se muestra como "General" y no aparece al filtrar por especie.
- **Artículo sin secciones** (solo preámbulo y texto): se muestra sin encabezados vacíos.
- **Cuenta sin verificar con la casilla marcada**: no figura como suscrita hasta que verifica el
  correo.
- **Suscripciones pendientes que nunca se confirman**: se eliminan pasado un plazo.

## Requirements *(mandatory)*

### Functional Requirements

**Contenido y listado**

- **FR-001**: El sistema MUST mostrar una sección "Consejos de salud" con dos bloques, "Artículos" y
  "Noticias", con solo los elementos publicados y con fecha de publicación pasada, ordenados por
  fecha de publicación descendente. "Noticias" muestra las 3 últimas y un enlace "Ver todas las
  noticias" al listado completo de noticias.
- **FR-002**: Cada tarjeta MUST mostrar imagen (o marcador si no tiene), categoría (o "General" si
  es una noticia sin categoría) y título, y enlazar a su página.
- **FR-003**: El bloque "Artículos", el listado completo de noticias y los resultados de filtro o
  búsqueda MUST paginarse de 12 en 12, conservando filtro y búsqueda entre páginas.
- **FR-004**: Las categorías (por defecto perro, gato y otros animales) y su orden MUST ser datos
  configurables por clínica, no valores fijos en el código. Cada artículo tiene exactamente una
  categoría; cada noticia tiene una o ninguna, y sin ella se muestra como "General".
- **FR-005**: Los enlaces "Consejos de salud" de la cabecera, la portada y el pie MUST llevar a la
  sección real.

**Página del artículo**

- **FR-006**: La página de un artículo o noticia MUST mostrar migas de pan, categoría (enlazada al
  listado filtrado), título, fecha de publicación, preámbulo, imagen con texto alternativo, cuerpo
  con secciones y un bloque final con un botón "Pide cita" que lleva al flujo de reserva.
- **FR-007**: El cuerpo MUST admitir encabezados de sección, párrafos, listas, énfasis y enlaces,
  y MUST NOT interpretar HTML incrustado.
- **FR-008**: Cada artículo MUST tener una dirección estable y legible basada en su título; una
  dirección inexistente o no publicada MUST responder "no encontrado".
- **FR-009**: Cada artículo MUST tener título, descripción e imagen propios para buscadores y redes,
  y figurar en el mapa del sitio mientras esté publicado.

**Filtro y búsqueda**

- **FR-010**: El visitante MUST poder filtrar por categoría y buscar por texto en título,
  preámbulo y cuerpo, sin distinguir mayúsculas, minúsculas ni tildes, combinando ambas
  condiciones. Con filtro o búsqueda activos, los resultados MUST mostrarse en una sola lista
  ordenada por fecha, con cada tarjeta marcada como "Artículo" o "Noticia"; las noticias sin
  categoría no aparecen al filtrar por categoría.
- **FR-011**: El filtro y la búsqueda MUST reflejarse en la dirección de la página y funcionar sin
  JavaScript.
- **FR-012**: Sin coincidencias, el sistema MUST mostrar un mensaje de "sin resultados" que nombre
  el criterio y ofrezca quitarlo; ese mensaje MUST anunciarse a los lectores de pantalla.
- **FR-013**: La búsqueda MUST limitarse a 100 caracteres y tratar la entrada como texto literal.

**Boletín**

- **FR-014**: El bloque del boletín MUST aparecer en la portada y en la sección de consejos, con
  campo de correo, casilla obligatoria y desmarcada de aceptación de la política del boletín
  (enlazada) y botón "Suscribirme". Solo se pide el correo: es el único dato necesario para enviar
  el boletín.
- **FR-015**: La suscripción MUST requerir doble confirmación: el alta queda pendiente hasta abrir
  el enlace del correo de confirmación, que caduca a los 7 días y queda anulado al pedir uno nuevo.
- **FR-016**: La respuesta del formulario MUST ser idéntica tanto si el correo es nuevo, como si
  está pendiente o ya confirmado (a un correo ya confirmado no se le envía nada), y un reenvío del mismo formulario MUST devolver la misma
  confirmación sin duplicar correos.
- **FR-017**: El formulario MUST limitar los envíos por origen y los correos de confirmación a uno
  por dirección y hora.
- **FR-018**: El sistema MUST registrar por cada suscripción la fecha de alta, la de confirmación,
  la versión de la política aceptada, el origen (formulario o cuenta de cliente) y la fecha de baja.
- **FR-019**: Todo correo enviado a un suscriptor, incluido el de confirmación, MUST incluir un
  enlace de baja personal que no exija iniciar sesión, y la baja MUST hacerse efectiva al
  confirmarla con un solo botón, también sin JavaScript. Los correos MUST declarar además la baja
  de un clic para los gestores de correo que la admiten.
- **FR-020**: Los enlaces de confirmación y de baja MUST ser imposibles de adivinar o falsificar;
  uno no válido MUST mostrar una página explicativa sin detalles internos.
- **FR-021**: Tras una baja, el correo MUST borrarse y dejar de figurar en la lista de envío; solo se
  conserva durante 3 años una constancia anónima (huella no reversible del correo, fechas y versión
  de la política) para acreditar el consentimiento y la baja. Volver a suscribirse exige una nueva
  confirmación.
- **FR-022**: Las suscripciones que no se confirmen en 30 días MUST eliminarse.
- **FR-023**: La política del boletín MUST ser un texto legal configurable por clínica y estar
  publicada antes de que el formulario pueda usarse; la política de privacidad MUST mencionar el
  boletín como finalidad.

**Cuentas de cliente**

- **FR-024**: Un cliente con la preferencia "consejos y novedades" activada y el correo verificado
  MUST figurar como suscrito confirmado, con origen "cuenta de cliente", sin un segundo correo de
  confirmación.
- **FR-025**: La preferencia de la cuenta y el estado en el boletín MUST mantenerse sincronizados en
  ambos sentidos (cambio en "Datos personales", baja desde un correo, confirmación desde el
  formulario con el correo de una cuenta), registrando la fecha de cada cambio.
- **FR-026**: Si el cliente cambia el correo de su cuenta, la suscripción MUST pasar al correo nuevo
  una vez verificado. Si elimina la cuenta, su suscripción MUST eliminarse.
- **FR-027**: La exportación de datos de la cuenta MUST incluir el estado de la suscripción y sus
  fechas.
- **FR-028**: Los clientes que ya tenían la preferencia activada antes de esta feature,
  con el correo verificado, MUST figurar como suscritos al ponerla en marcha.

**Transversales**

- **FR-029**: Todo el contenido (artículos, noticias, categorías, imágenes, textos del bloque del
  boletín y política) MUST cargarse como datos de la clínica; las páginas leen solo de los datos
  persistidos.
- **FR-030**: Las páginas y formularios de esta feature MUST cumplir WCAG 2.2 AA (teclado, foco
  visible, errores junto al campo y anunciados) y funcionar sin JavaScript.
- **FR-031**: Ninguna página de esta feature MUST cargar recursos de terceros; las imágenes de los
  artículos se sirven desde la propia web.
- **FR-032**: Los registros de actividad MUST NOT contener el correo de los suscriptores ni el texto
  buscado completo asociado a una persona; solo identificadores y códigos.
- **FR-033**: El contenido de demostración MUST ser original y prudente: no copia textos ni imágenes
  de las maquetas ni de terceros y recuerda consultar con un veterinario ante cualquier síntoma.

### Key Entities

- **Categoría de contenido**: clave, nombre visible y orden. Configurable por clínica.
- **Publicación** (artículo o noticia): tipo, dirección legible, título, preámbulo, cuerpo con
  secciones, imagen opcional con texto alternativo, categoría, fecha de publicación, estado
  publicado/no publicado, descripción para buscadores. La categoría es obligatoria en los
  artículos y opcional en las noticias.
- **Constancia de baja**: huella no reversible del correo, fechas de alta, confirmación y baja y
  versión de la política; se borra a los 3 años.
- **Suscripción al boletín**: solo las vivas. Correo, estado (pendiente o confirmada), origen
  (formulario o cuenta de cliente), cuenta de cliente vinculada si la hay, fechas de alta y
  confirmación, versión de la política aceptada y el enlace de confirmación con su caducidad (de un
  solo uso). Al darse de baja se borra y queda la constancia de baja.
- **Política del boletín**: texto legal versionado de la clínica.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante llega desde la portada a un artículo concreto en 3 clics o menos.
- **SC-002**: El 100 % de las búsquedas y filtros probados devuelven exactamente los elementos
  esperados, con y sin JavaScript, y muestran el mensaje de "sin resultados" cuando corresponde.
- **SC-003**: Un visitante completa la suscripción (formulario y confirmación) en menos de 2
  minutos, y el correo de confirmación llega en menos de 1 minuto en condiciones normales.
- **SC-004**: El 100 % de los correos enviados a suscriptores incluyen un enlace de baja que
  funciona sin iniciar sesión, y la baja surte efecto de inmediato.
- **SC-005**: En el 100 % de los casos probados, la respuesta al suscribirse no permite saber si un
  correo ya estaba suscrito.
- **SC-006**: La preferencia de la cuenta y el estado en el boletín coinciden en el 100 % de los
  cambios probados, en ambos sentidos.
- **SC-007**: El listado y la página de artículo obtienen 90 o más en rendimiento móvil y no
  presentan errores de accesibilidad automáticos.
- **SC-008**: Poner en marcha el contenido de otra clínica solo requiere cambiar sus datos, sin
  tocar código.

## Assumptions

- **Sin panel de administración**: se mantiene la excepción temporal al principio VIII. Artículos,
  noticias, categorías y política se cargan desde el archivo de contenido de la clínica con la
  carga de contenido existente; el panel lo gestionará en su feature.
- **Artículos y noticias** comparten estructura y página de detalle; solo se distinguen por el tipo,
  que decide en qué bloque del listado aparecen.
- **Categorías independientes de las especies** de las mascotas, aunque por defecto coincidan con
  perro, gato y otros animales.
- **Sin envío de campañas**: esta feature crea y mantiene la lista con consentimiento, la
  confirmación y la baja. El único correo de esta feature (la confirmación) ya lleva el enlace de
  baja, y cualquier envío futuro reutilizará el mismo mecanismo.
- **Plazos**: enlace de confirmación válido 7 días; suscripciones pendientes eliminadas a los
  30 días. Son valores habituales y configurables.
- **Correos** salen por la bandeja de salida y el proveedor de correo existentes, con sus
  reintentos.
- **Sin contenido relacionado, autoría ni tiempo de lectura**: no se piden; se pueden añadir más
  adelante.
- **Fuera de alcance**: panel de administración de artículos, comentarios, envío de campañas,
  segmentación de suscriptores y estadísticas de apertura.
