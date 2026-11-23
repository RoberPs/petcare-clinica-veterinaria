# Feature Specification: Web pública de la clínica veterinaria

**Feature Branch**: `001-public-clinic-website`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Web pública de la clínica veterinaria petcare. Los dueños de mascotas entienden qué ofrece la clínica, dónde está y cómo contactar. Uso sobre todo desde móvil. Referencia visual: design/index.html, tratamientos.html, la-clinica.html, contacto.html, faqs.html. […] Fuera de alcance: reservas, tienda, consejos de salud, boletín, cuentas, multidioma. Los enlaces a esas secciones llevan a una página «Próximamente» hasta que existan."

## Contexto

Primera entrega del producto: la web pública con la que un dueño de mascota entiende qué ofrece la
clínica, dónde está, cuándo abre y cómo contactar. La mayoría de las visitas llegan desde el móvil.

La clínica de demostración se llama **PetCare**. Ese nombre y todos los datos de la clínica
(dirección, teléfono, correo, horario, servicios, equipo, preguntas frecuentes, textos legales y
cifras) son **datos configurables**. Ninguno queda escrito en el producto, así que otra clínica
puede ponerlo en marcha solo con su configuración y sus datos (constitución, principio VIII).

**Referencias visuales** (estructura y contenido esperado; los textos de ejemplo no se publican):

| Pantalla | Referencia | Componentes de `design/styles.css` |
|---|---|---|
| Portada | `design/index.html` | `hero`, `hero__card`, `hero__media`, `band`, `cards`/`card`, `stats`/`stat`, `notice` |
| Tratamientos | `design/tratamientos.html` | `photo-hero`, `photo-hero__card`, `section`, `topic-tabs`, `link-card`, `band` |
| La clínica | `design/la-clinica.html` | `photo-hero`, `info-grid`/`info-card`, `team`/`member`, `map`, `band` |
| Contacto | `design/contacto.html` | `page-hero`, `breadcrumb`, `contact-grid`, `panel form`, `field`, `field-row`, `check`, `note`, `info-card`, `map` |
| Preguntas frecuentes | `design/faqs.html` | `page-hero`, `breadcrumb`, `faq`, `faq__item`, `cta-box` |
| Cabecera y pie | `design/layout.js` | `site-header`, `main-nav`, `header-cta`, `chip`, `btn--sky`, `btn--pink`, `site-footer`, `footer__grid` |
| Próximamente, páginas legales, página no encontrada | sin referencia: se componen con los componentes existentes (`page-hero`, `breadcrumb`, `section`, `cta-box`) | — |

De `design/index.html` **no** se incluye la sección de boletín, porque queda fuera de alcance.

## Clarifications

### Session 2026-11-10

- Q: ¿Esta feature incluye la gestión del contenido desde el panel de administración? → A: No. En esta feature todo el contenido se carga como **datos iniciales configurables**, con datos de ejemplo ficticios para la clínica de demostración, y el panel de administración llega en una feature posterior. El contenido de cada página se irá ampliando de forma iterativa. Es una excepción temporal al principio VIII (gestión sin tocar código desde el panel), que el plan debe justificar. Cambiar el contenido sigue sin requerir tocar las páginas: basta con modificar y volver a cargar los datos.
- Q: Con datos ficticios, ¿muestra la portada el bloque de cifras y los avisos de salud? → A: Las cifras de actividad de la clínica (pacientes, equipo, años…) se muestran con los valores ficticios configurados. Los avisos o afirmaciones sanitarias generales solo se muestran si tienen una fuente real verificable citada; si no, se ocultan.
- Q: ¿Se muestra un aviso visible de que PetCare es una clínica ficticia de demostración? → A: Sí. Una franja discreta en todas las páginas ("Web de demostración: PetCare es una clínica ficticia") que se activa o desactiva por configuración (activada en la demo).
- Q: ¿El visitante recibe un correo de acuse al enviar el formulario de contacto? → A: Sí. Además de la confirmación en pantalla, recibe un acuse breve con el nombre de la clínica, el plazo habitual de respuesta y el teléfono. El acuse no copia el texto del mensaje y se limita a uno por dirección de correo y hora.
- Q: En la demo, ¿adónde llegan de verdad los correos del formulario? → A: Los mensajes para la clínica se entregan a un buzón real configurable: la cuenta del responsable de la demo, o la bandeja del servicio de envío de correo (candidato: Brevo). Los acuses se entregan de verdad al visitante e incluyen el aviso de demostración cuando está activado.
- Q: ¿Quién figura como responsable del tratamiento en la política de privacidad y en el aviso legal de la demo? → A: El responsable real de la web de demostración (nombre o alias identificable y correo de contacto para ejercer los derechos), con la mención expresa de que PetCare es una clínica ficticia. No se inventan razón social ni NIF.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Portada con la propuesta de la clínica y accesos directos (Priority: P1)

Un dueño de mascota llega a la portada, normalmente desde el móvil. Entiende en pocos segundos qué
es la clínica y qué le ofrece, y tiene a mano las tres acciones principales ("Pide cita online",
"Contacto" y "Conoce la clínica"). Además, tres accesos rápidos lo llevan a productos, a
tratamientos y servicios y a consejos de salud.

**Why this priority**: es la puerta de entrada de casi todas las visitas. Sin ella, el visitante no
entiende la propuesta ni encuentra cómo contactar.

**Independent Test**: se abre la portada en un móvil y se pulsa cada uno de los seis accesos. Se
comprueba que cada uno lleva a su destino en un solo clic, a la sección real si existe o a
"Próximamente" si no.

**Acceptance Scenarios**:

1. **Given** un visitante en la portada, **When** la página termina de cargar, **Then** ve el
   titular y el texto de la propuesta de la clínica y los botones "Pide cita online", "Contacto" y
   "Conoce la clínica" sin hacer scroll en un móvil de 360 × 640 px.
2. **Given** un visitante en la portada, **When** pulsa "Contacto", **Then** llega a la página de
   contacto en un clic.
3. **Given** un visitante en la portada, **When** pulsa "Conoce la clínica", **Then** llega a la
   página de la clínica en un clic.
4. **Given** un visitante en la portada, **When** pulsa "Pide cita online", **Then** llega en un
   clic a la página "Próximamente" de reservas, que le ofrece llamar a la clínica o escribir desde
   contacto.
5. **Given** un visitante en la portada, **When** pulsa el acceso rápido "Tratamientos y
   servicios", **Then** llega a la página de tratamientos en un clic.
6. **Given** un visitante en la portada, **When** pulsa "Nuestros productos" o "Consejos de
   salud", **Then** llega en un clic a la página "Próximamente" de esa sección.
7. **Given** que la clínica no ha configurado cifras de actividad, **When** se muestra la portada,
   **Then** no aparece el bloque de cifras y no queda ningún hueco vacío en su lugar.
8. **Given** que la clínica ha configurado cifras de actividad (ficticias en la demo), **When** se
   muestra la portada, **Then** el bloque de cifras muestra exactamente esos valores.
9. **Given** un aviso de salud configurado sin fuente real verificable, **When** se muestra la
   portada, **Then** el aviso no aparece. **Given** un aviso con fuente, **Then** aparece junto a
   la cita de su fuente.

---

### User Story 2 - Cabecera y pie comunes con menú usable en móvil (Priority: P1)

En cualquier página, el visitante encuentra la misma cabecera y el mismo pie. En el móvil abre el
menú y llega a todas las secciones: Tratamientos, La clínica, Nuestros productos, Consejos de salud
y Preguntas frecuentes, además de "Pide cita" y "Contacto".

**Why this priority**: es la navegación de toda la web. Si el menú móvil falla, el visitante se
queda atrapado en la primera página que abre.

**Independent Test**: en cada página, con un ancho de 360 px, se abre el menú y se llega a cada
sección del menú usando solo el teclado y también solo con toques.

**Acceptance Scenarios**:

1. **Given** cualquier página pública, **When** se carga, **Then** muestra la cabecera y el pie
   comunes con el nombre de la clínica configurado, que lleva a la portada.
2. **Given** un visitante en un móvil (ancho inferior a 900 px), **When** abre el menú, **Then**
   ve las cinco secciones en este orden: Tratamientos, La clínica, Nuestros productos, Consejos de
   salud y Preguntas frecuentes, además de "Pide cita" y "Contacto", y llega a cada una con un
   toque.
3. **Given** el menú móvil abierto, **When** el visitante pulsa Escape o el botón de cerrar,
   **Then** el menú se cierra y el foco vuelve al botón que lo abrió.
4. **Given** un visitante en una sección, **When** mira el menú, **Then** esa sección aparece
   marcada como la página actual, de forma visible y anunciada a tecnologías de asistencia.
5. **Given** la cabecera, **When** el visitante pulsa "Mi cuenta" o el carrito, **Then** llega a
   la página "Próximamente" correspondiente.
6. **Given** el pie de cualquier página, **When** el visitante lo consulta, **Then** ve los datos
   de contacto de la clínica, enlaces a las secciones principales y los enlaces legales
   (User Story 8).
7. **Given** el aviso de demostración activado por configuración, **When** se carga cualquier
   página, **Then** se ve una franja discreta que indica que es una web de demostración y que la
   clínica es ficticia. **Given** el aviso desactivado, **Then** la franja no aparece.

---

### User Story 3 - Consultar tratamientos y servicios (Priority: P1)

El visitante consulta qué tratamientos y servicios ofrece la clínica. De cada uno ve el nombre y
una descripción que le ayuda a saber si es lo que necesita, y tiene a mano cómo pedir cita o
contactar.

**Why this priority**: "qué ofrece la clínica" es la primera razón de visita, junto con dónde
está.

**Independent Test**: se abre la página de tratamientos y se comprueba que lista todos los
servicios publicados, cada uno con nombre y descripción, y que el aviso final lleva a pedir cita.

**Acceptance Scenarios**:

1. **Given** servicios publicados, **When** el visitante abre Tratamientos, **Then** ve cada
   servicio con su nombre y su descripción, en el orden configurado.
2. **Given** un servicio despublicado, **When** el visitante abre Tratamientos, **Then** ese
   servicio no aparece.
3. **Given** que no hay ningún servicio publicado, **When** el visitante abre Tratamientos,
   **Then** ve un mensaje que lo invita a contactar con la clínica y no una lista vacía.
4. **Given** la página de tratamientos, **When** el visitante llega al final, **Then** encuentra
   una llamada a la acción para pedir cita, que lleva a "Próximamente" mientras no existan las
   reservas, y otra para contactar.

---

### User Story 4 - Conocer la clínica: dirección, horario, contacto, equipo y mapa (Priority: P2)

El visitante quiere saber dónde está la clínica, cuándo abre y quién le atenderá. Ve la dirección,
el horario, el teléfono y el correo, el equipo veterinario con foto, nombre y especialidad, y un
mapa de cómo llegar.

**Why this priority**: "dónde está" es el segundo objetivo de la web. Se puede entregar después de
la navegación y los servicios, porque el pie ya muestra los datos de contacto básicos.

**Independent Test**: se abre La clínica y se comprueba que muestra dirección, horario, teléfono,
correo y equipo (foto, nombre y especialidad de cada miembro), y que el mapa respeta las cookies.

**Acceptance Scenarios**:

1. **Given** los datos de la clínica configurados, **When** el visitante abre La clínica, **Then**
   ve la dirección, el horario de cada día de la semana, el teléfono y el correo.
2. **Given** el horario configurado, **When** el visitante consulta la página en un momento en que
   la clínica está cerrada (fuera de horario, un día de cierre o un cierre excepcional), **Then**
   ve "Cerrado ahora" junto al horario completo y cuándo vuelve a abrir.
3. **Given** el equipo publicado, **When** el visitante ve la sección de equipo, **Then** cada
   profesional aparece con foto, nombre y especialidad, y la foto tiene un texto alternativo con
   su nombre.
4. **Given** un profesional sin foto, **When** se muestra el equipo, **Then** aparece una imagen
   neutra de sustitución con el mismo tamaño y el resto de la tarjeta no se descoloca.
5. **Given** un visitante que no ha aceptado las cookies de terceros, **When** llega a la sección
   del mapa, **Then** no se carga el mapa externo. En su lugar ve la dirección, un enlace para
   abrirla en un servicio de mapas y la opción de aceptar para ver el mapa.
6. **Given** un visitante que ha aceptado las cookies de terceros, **When** llega a la sección del
   mapa, **Then** ve el mapa interactivo con la ubicación de la clínica.
7. **Given** un móvil, **When** el visitante pulsa el teléfono, **Then** se le ofrece llamar.
   **When** pulsa el correo, **Then** se abre su aplicación de correo.

---

### User Story 5 - Enviar un mensaje desde el formulario de contacto (Priority: P2)

El visitante escribe a la clínica con su nombre, su teléfono (opcional), su correo, el motivo y el
mensaje, y acepta la política de privacidad. Ve una confirmación clara, y la clínica recibe el
mensaje por correo.

**Why this priority**: es el único canal escrito de la web mientras no existan las reservas.
Aporta mucho valor, pero la web ya es útil sin él porque el teléfono y el correo se ven.

**Independent Test**: se envía un mensaje válido y se comprueba que aparece la confirmación, que el
buzón configurado de la clínica recibe el mensaje con todos los datos y que el mensaje queda
registrado una sola vez.

**Acceptance Scenarios**:

1. **Given** el formulario con nombre, correo válido, motivo, mensaje y privacidad aceptada,
   **When** el visitante lo envía, **Then** ve una confirmación que indica que el mensaje se ha
   recibido y en qué plazo suele responder la clínica, y la clínica recibe un correo con todos los
   datos enviados, el motivo y la fecha y hora.
2. **Given** un correo electrónico con formato inválido, **When** el visitante envía, **Then** el
   mensaje no se envía, aparece un error en español junto al campo de correo, se anuncia a
   tecnologías de asistencia y los demás datos escritos se conservan.
3. **Given** campos obligatorios vacíos o la privacidad sin aceptar, **When** el visitante envía,
   **Then** se le indica cada campo que falta junto al propio campo y el foco va al primer error.
4. **Given** un formulario válido, **When** el visitante pulsa enviar dos veces seguidas o recarga
   después de enviar, **Then** la clínica recibe un solo mensaje y el visitante ve una sola
   confirmación.
5. **Given** un fallo temporal al entregar el correo a la clínica, **When** el visitante envía un
   mensaje válido, **Then** el mensaje queda registrado, el visitante ve la confirmación y el
   correo a la clínica se reintenta hasta entregarse. Si los reintentos se agotan, se registra el
   fallo y el mensaje no se pierde.
6. **Given** que el mensaje no se ha podido registrar (por ejemplo, sin conexión), **When** el
   visitante envía, **Then** ve un error claro que le dice que no se ha enviado, que conserva lo
   que ha escrito y que le ofrece el teléfono como alternativa.
7. **Given** el envío en curso con una conexión lenta, **When** el visitante espera, **Then** el
   botón muestra que se está enviando y no admite un segundo envío.
8. **Given** el formulario, **When** el visitante lo revisa, **Then** el teléfono está marcado
   como opcional y cada dato pedido tiene una finalidad explicada en la política de privacidad.
9. **Given** un mensaje válido aceptado, **When** se registra, **Then** el visitante recibe en su
   correo un acuse breve con el nombre de la clínica, el plazo habitual de respuesta y el
   teléfono, sin el texto de su mensaje.
10. **Given** que ya se ha enviado un acuse a una dirección en la última hora, **When** llega otro
    mensaje válido con esa misma dirección, **Then** la clínica recibe el mensaje pero no se envía
    un segundo acuse.

---

### User Story 6 - Preguntas frecuentes agrupadas por tema (Priority: P2)

El visitante resuelve dudas habituales sin contactar. Las preguntas están agrupadas por tema
(Citas, Tienda y Tu mascota) y cada respuesta se despliega al pulsar la pregunta.

**Why this priority**: reduce llamadas y correos repetidos, pero no es imprescindible para
entender la clínica.

**Independent Test**: se abre Preguntas frecuentes y se comprueba que los grupos aparecen por tema
y que cada pregunta se despliega y se repliega con ratón, toque y teclado.

**Acceptance Scenarios**:

1. **Given** preguntas publicadas en los temas Citas, Tienda y Tu mascota, **When** el visitante
   abre la página, **Then** ve un grupo por tema con su título, y en cada grupo sus preguntas en el
   orden configurado.
2. **Given** una pregunta, **When** el visitante la activa con clic, toque, Enter o Espacio,
   **Then** su respuesta se despliega. **When** la activa de nuevo, **Then** se repliega.
3. **Given** un tema sin preguntas publicadas, **When** se muestra la página, **Then** ese tema no
   aparece.
4. **Given** el final de la página, **When** el visitante no ha encontrado su respuesta, **Then**
   tiene un acceso a Contacto.
5. **Given** una respuesta que menciona una sección no disponible (por ejemplo, la tienda), **When**
   el visitante pulsa el enlace, **Then** llega a "Próximamente".

---

### User Story 7 - Aceptar o rechazar cookies no esenciales (Priority: P2)

En su primera visita, el visitante decide si acepta o rechaza las cookies no esenciales y los
recursos de terceros, como el mapa. Rechazar le cuesta lo mismo que aceptar. Su elección se
recuerda y la puede cambiar cuando quiera.

**Why this priority**: es una obligación legal (RGPD/LOPDGDD) y una condición para cargar el mapa.
Va con P2 porque sin recursos de terceros no hay nada que consentir.

**Independent Test**: en una visita nueva se rechaza, se navega y se comprueba que no se carga
ningún recurso no esencial y que el aviso no vuelve a salir. Después se cambia la elección desde
el pie y se comprueba que se aplica.

**Acceptance Scenarios**:

1. **Given** un visitante sin elección guardada, **When** abre cualquier página, **Then** ve un
   aviso de cookies con "Aceptar" y "Rechazar" al mismo nivel, del mismo tamaño y con la misma
   prominencia, y un enlace a la política de cookies.
2. **Given** el aviso visible, **When** el visitante rechaza, **Then** no se carga ninguna cookie
   ni recurso no esencial, el aviso desaparece y no vuelve a salir en sus siguientes visitas
   mientras la elección siga vigente.
3. **Given** el aviso visible, **When** el visitante acepta, **Then** los recursos de terceros (por
   ejemplo, el mapa) se cargan sin recargar la página y la elección se recuerda.
4. **Given** una elección guardada, **When** el visitante pulsa "Configurar cookies" en el pie,
   **Then** puede cambiarla y el cambio se aplica de inmediato, incluida la retirada de un
   consentimiento dado antes.
5. **Given** que el visitante aún no ha decidido, **When** navega con teclado, **Then** el aviso
   es alcanzable y operable con teclado y no tapa el contenido de forma que impida usar la página.

---

### User Story 8 - Páginas legales desde el pie (Priority: P3)

Desde el pie de cualquier página, el visitante abre el aviso legal, la política de privacidad, la
política de cookies y los términos de uso.

**Why this priority**: es obligatorio antes de publicar, pero aporta poco valor directo al dueño de
la mascota.

**Independent Test**: desde el pie se abre cada una de las cuatro páginas y se comprueba que
muestran el texto legal configurado para la clínica.

**Acceptance Scenarios**:

1. **Given** cualquier página, **When** el visitante pulsa en el pie "Aviso legal", "Política de
   privacidad", "Política de cookies" o "Términos de uso", **Then** llega a la página
   correspondiente, con su título y la fecha de su última actualización.
2. **Given** los datos legales del titular configurados (titular, NIF y domicilio cuando
   existan, y correo de contacto), **When** se muestra el aviso legal, **Then** aparecen esos
   datos.
3. **Given** la demo, **When** el visitante abre el aviso legal o la política de privacidad,
   **Then** ve como responsable del tratamiento al responsable real de la web de demostración, con
   un correo para ejercer sus derechos, y una mención expresa de que PetCare es una clínica
   ficticia. No aparece ninguna razón social ni NIF inventados.
4. **Given** el formulario de contacto y el aviso de cookies, **When** el visitante pulsa sus
   enlaces a la política de privacidad o de cookies, **Then** llega a la misma página que desde el
   pie.

---

### Página "Próximamente" (transversal)

Los enlaces a secciones fuera de alcance (Pide cita/reservas, Nuestros productos/tienda, Carrito,
Consejos de salud y Mi cuenta) llevan a una página "Próximamente". Esa página dice qué sección
estará disponible y ofrece alternativas útiles: llamar, ir a Contacto o volver a la portada. Cuando
una sección exista, sus enlaces apuntarán a ella sin cambiar el resto de la web.

### Edge Cases

- **Correo inválido** en el formulario: se rechaza junto al campo y se conservan los datos (US5, escenario 2).
- **Formulario enviado dos veces** (doble clic, recarga o reenvío del navegador): se registra un solo mensaje y llega un solo correo (US5, escenario 4).
- **Envíos automatizados o en masa**: el formulario rechaza los envíos automatizados y limita los
  envíos repetidos desde un mismo origen, sin pedir pasos adicionales a un visitante normal.
  Cuando se supera el límite, se muestra un mensaje que invita a llamar.
- **Mensaje excesivamente largo o con contenido no textual**: se limita la longitud del mensaje
  (2.000 caracteres) y se muestra un contador. El contenido se trata siempre como texto, nunca se
  interpreta.
- **Navegación solo con teclado**: un enlace para saltar al contenido principal es lo primero
  que se enfoca. Menú, acordeones, aviso de cookies y formulario son operables con teclado, con
  foco visible y orden lógico, y el menú móvil abierto retiene el foco hasta cerrarse.
- **Conexión lenta**: el texto, la navegación y los datos de contacto se muestran antes que las
  imágenes. Las imágenes reservan su espacio y no desplazan el contenido. El formulario muestra
  que está enviando y no pierde datos si el envío falla.
- **Sin JavaScript o con fallo de un script**: la navegación, el contenido, las preguntas
  frecuentes y el envío del formulario siguen funcionando. Solo se pierde lo puramente
  decorativo.
- **Clínica cerrada** (fuera de horario, día de cierre semanal o cierre excepcional como un
  festivo): el horario completo sigue visible en La clínica, en Contacto y en el pie, junto con
  "Cerrado ahora" y cuándo vuelve a abrir. El formulario sigue disponible.
- **Horario con cierre excepcional** configurado: se muestra el aviso del cierre con sus fechas en
  La clínica y en Contacto.
- **Cifras y afirmaciones sanitarias**: las cifras de actividad de la clínica se muestran si están
  configuradas (en la demo, con valores ficticios). Los avisos de salud generales (como "el 80 % de
  los perros…") solo se muestran con una fuente real verificable citada; sin ella, no se
  muestran. Ningún texto de ejemplo de `design/` se publica.
- **Datos incompletos de la clínica** (por ejemplo, sin correo o sin mapa): el bloque que falta no
  se muestra y no se ven etiquetas vacías.
- **Enlace o dirección inexistente**: se muestra una página "No encontrada" con cabecera, pie y
  accesos a la portada y a Contacto.
- **Rotación de pantalla, zoom al 200 % y texto ampliado**: el contenido se adapta sin scroll
  horizontal y sin perder información.
- **Preferencia de movimiento reducido**: se desactivan las animaciones no esenciales.

## Requirements *(mandatory)*

### Functional Requirements

**Estructura y navegación**

- **FR-001**: La web MUST ofrecer estas páginas públicas: Portada, Tratamientos, La clínica,
  Contacto, Preguntas frecuentes, Próximamente (una por sección fuera de alcance), Aviso legal,
  Política de privacidad, Política de cookies, Términos de uso y No encontrada.
- **FR-002**: Todas las páginas MUST compartir la misma cabecera y el mismo pie.
- **FR-003**: La cabecera MUST mostrar, en este orden, el menú Tratamientos · La clínica ·
  Nuestros productos · Consejos de salud · Preguntas frecuentes, y a la derecha Mi cuenta · Pide
  cita · Contacto · Carrito, este último siempre al final.
- **FR-004**: Por debajo de 900 px de ancho, el menú MUST pasar a un menú desplegable que dé
  acceso a todas las entradas de FR-003, que se abra y cierre con toque, clic y teclado y que se
  cierre con Escape.
- **FR-005**: La entrada de menú de la página actual MUST indicarse visualmente y para tecnologías
  de asistencia.
- **FR-006**: Los enlaces a secciones fuera de alcance (reservas, tienda, carrito, consejos de
  salud y cuenta) MUST llevar a su página "Próximamente". Esa página MUST nombrar la sección y
  ofrecer el teléfono, el acceso a Contacto y la vuelta a la portada. Cambiar el destino de esos
  enlaces cuando la sección exista MUST ser un cambio de configuración, no de las páginas.
- **FR-007**: El pie MUST mostrar el nombre de la clínica, su teléfono, su correo y su dirección,
  enlaces a las secciones principales, los cuatro enlaces legales y un acceso a "Configurar
  cookies".
- **FR-007a**: Cuando el aviso de demostración está activado por configuración (activado en la
  demo), todas las páginas MUST mostrar una franja discreta y permanente con el texto "Web de
  demostración: PetCare es una clínica ficticia". El nombre que aparece en la franja es el nombre
  configurado de la clínica. La franja MUST cumplir el contraste AA y no tapar el contenido ni la
  navegación.
- **FR-008**: Las páginas de Contacto, Preguntas frecuentes y las legales MUST mostrar una ruta de
  navegación (migas) que empiece en la portada.

**Portada**

- **FR-009**: La portada MUST mostrar el titular y el texto de propuesta de la clínica (datos
  configurables), los botones "Pide cita online" (intención cita), "Contacto" (intención contacto)
  y "Conoce la clínica", y tres accesos rápidos: Nuestros productos, Tratamientos y servicios y
  Consejos de salud.
- **FR-010**: Cada acceso de FR-009 MUST llegar a su destino en un solo clic o toque.
- **FR-011**: La portada MUST mostrar el bloque de cifras de actividad de la clínica (pacientes,
  equipo, años…) solo cuando estén configuradas, y en la demo se configuran con valores ficticios.
  Cualquier aviso o afirmación sanitaria general MUST mostrarse solo si tiene configurada una
  fuente real verificable, que se cita junto al aviso. Sin dato o sin fuente, el bloque no se
  muestra.
- **FR-012**: La portada MUST NOT incluir el formulario de boletín de la referencia visual.

**Tratamientos**

- **FR-013**: La página de tratamientos MUST listar los servicios publicados, cada uno con nombre
  y descripción, en el orden configurado por la clínica.
- **FR-014**: Si no hay servicios publicados, la página MUST mostrar un mensaje que invite a
  contactar.
- **FR-015**: La página MUST terminar con llamadas a la acción para pedir cita y para contactar.

**La clínica**

- **FR-016**: La página de la clínica MUST mostrar la dirección, el horario por día de la semana
  (incluidos los días cerrados), el teléfono, el correo y el equipo veterinario publicado.
- **FR-017**: Cada profesional MUST mostrarse con foto (con texto alternativo), nombre y
  especialidad. Si no tiene foto, se muestra una imagen de sustitución.
- **FR-018**: La web MUST indicar "Abierto ahora" o "Cerrado ahora", y cuándo vuelve a abrir,
  según el horario semanal y los cierres excepcionales configurados en la zona horaria
  Europe/Madrid. La indicación aparece en La clínica, en Contacto y en el pie, siempre junto al
  horario completo.
- **FR-019**: La web MUST permitir configurar cierres excepcionales (por ejemplo, festivos) con
  fechas y motivo, y mostrarlos mientras estén vigentes o sean próximos.
- **FR-020**: El mapa interactivo de terceros MUST cargarse solo con el consentimiento del
  visitante. Sin consentimiento, se muestra la dirección, un enlace para abrirla en un servicio de
  mapas y la opción de dar consentimiento.
- **FR-021**: El teléfono MUST poder pulsarse para llamar y el correo MUST poder pulsarse para
  escribir.

**Contacto**

- **FR-022**: El formulario de contacto MUST pedir el nombre (obligatorio), el teléfono
  (opcional), el correo electrónico (obligatorio), el motivo (obligatorio, elegido de una lista
  configurable con, por defecto, Información general, Consulta sobre una cita, Pedido de la tienda
  y Otro), el mensaje (obligatorio, entre 10 y 2.000 caracteres) y la aceptación de la política de
  privacidad (obligatoria).
- **FR-023**: Cada dato del formulario MUST tener una finalidad declarada en la política de
  privacidad: el nombre y el correo para responder, el teléfono para devolver la llamada si el
  visitante lo prefiere, y el motivo para dirigir la consulta.
- **FR-024**: La web MUST validar el formulario antes de aceptarlo y repetir la validación al
  recibirlo. Los errores se muestran en español junto a cada campo, se anuncian a tecnologías de
  asistencia, el foco va al primer error y los datos escritos se conservan.
- **FR-025**: Al aceptar un mensaje válido, la web MUST registrarlo de forma persistente, mostrar
  una confirmación al visitante y enviar un correo al buzón configurado de la clínica con todos los
  datos, el motivo y la fecha y hora.
- **FR-025a**: Al aceptar un mensaje válido, la web MUST enviar también al correo del visitante
  un acuse breve con el nombre de la clínica, el plazo habitual de respuesta y el teléfono. El
  acuse MUST NOT incluir el texto del mensaje ni otros datos escritos por el visitante, y MUST
  limitarse a uno por dirección de correo y hora. Si falla el acuse, el mensaje sigue registrado y
  el correo a la clínica no se ve afectado.
- **FR-025b**: El buzón que recibe los mensajes MUST ser configuración. En la demo apunta a un
  buzón real del responsable de la demo, de modo que el envío funciona de punta a punta. Cuando el
  aviso de demostración está activado (FR-007a), el acuse al visitante MUST incluir que se trata
  de una web de demostración y de una clínica ficticia.
- **FR-026**: Un mismo envío repetido (doble clic, recarga o reintento) MUST registrarse y
  notificarse una sola vez.
- **FR-027**: Si falla la entrega del correo a la clínica, el mensaje MUST conservarse y el envío
  MUST reintentarse. Los fallos definitivos quedan registrados para su revisión.
- **FR-028**: El formulario MUST rechazar los envíos automatizados y limitar los envíos repetidos
  desde un mismo origen sin añadir pasos al visitante normal.
- **FR-029**: La web MUST guardar, junto a cada mensaje, la constancia de la aceptación de la
  privacidad (fecha y hora y versión de la política aceptada).
- **FR-030**: Los mensajes de contacto MUST conservarse un máximo de 12 meses y después borrarse
  automáticamente.
- **FR-031**: La página de contacto MUST mostrar también el teléfono destacado con el horario, la
  dirección, el correo y el mapa sujeto a consentimiento (FR-020).

**Preguntas frecuentes**

- **FR-032**: La página de preguntas frecuentes MUST agrupar las preguntas publicadas por tema
  (por defecto Citas, Tienda y Tu mascota), en el orden configurado de temas y preguntas, y ocultar
  los temas sin preguntas.
- **FR-033**: Cada pregunta MUST desplegar y replegar su respuesta con clic, toque y teclado, y
  funcionar también sin JavaScript.
- **FR-034**: La página MUST terminar con un acceso a Contacto.

**Cookies y consentimiento**

- **FR-035**: En la primera visita, la web MUST mostrar un aviso de cookies con "Aceptar" y
  "Rechazar" al mismo nivel, del mismo tamaño y con la misma prominencia, y un enlace a la
  política de cookies.
- **FR-036**: Antes de que el visitante acepte, la web MUST NOT cargar ninguna cookie ni recurso
  no esencial (mapas, analítica, fuentes o vídeos de terceros).
- **FR-037**: La elección MUST recordarse durante 12 meses. Pasado ese plazo, o si cambia la lista
  de recursos que requieren consentimiento, se pregunta de nuevo.
- **FR-038**: El visitante MUST poder revisar y cambiar o retirar su consentimiento en cualquier
  momento desde "Configurar cookies" en el pie, con efecto inmediato.

**Páginas legales**

- **FR-039**: La web MUST ofrecer el aviso legal, la política de privacidad, la política de
  cookies y los términos de uso, accesibles desde el pie de todas las páginas, cada una con su
  fecha de última actualización.
- **FR-040**: Los textos legales y los datos del titular y responsable del tratamiento (nombre o
  razón social, NIF y domicilio cuando existan, y correo para ejercer los derechos) MUST ser datos
  configurables por clínica, independientes de los datos públicos de la clínica.
- **FR-040a**: En la demo, el responsable del tratamiento MUST ser el responsable real de la web de
  demostración, con un correo de contacto real, y los textos legales MUST indicar expresamente
  que PetCare es una clínica ficticia. La web MUST NOT publicar razón social ni NIF inventados.

**Contenido, marca y configuración**

- **FR-041**: Todos los datos de la clínica (nombre, logotipo, titular y texto de portada,
  dirección, coordenadas del mapa, teléfono, correo, buzón de destino de los mensajes, horario,
  cierres, servicios, equipo, preguntas frecuentes, temas, motivos de contacto, cifras de
  actividad, avisos de salud y sus fuentes, textos legales, plazo de respuesta mostrado y
  activación del aviso de demostración) MUST ser configuración o datos, nunca
  valores fijos en las páginas.
- **FR-042**: Cambiar los datos de FR-041 MUST reflejarse en todas las páginas donde aparecen sin
  modificar las páginas.
- **FR-042a**: Los datos de FR-041 MUST poder cargarse y volver a cargarse con un procedimiento
  documentado y reproducible. La web MUST incluir un juego de datos de ejemplo **ficticios** para
  la clínica de demostración PetCare, redactados para este proyecto (no copiados de `design/` ni de
  terceros) y que no permitan confundirla con una clínica real.
- **FR-043**: La web MUST NOT publicar logotipos, imágenes, iconos ni textos de terceros (incluido
  el material de `design/reference/`), ni los textos, cifras y datos de ejemplo de `design/`.
- **FR-044**: La interfaz MUST usar solo los tokens de `design/tokens.css` y los componentes de
  `design/styles.css`, con los colores de cada llamada a la acción según su intención (cian para
  pedir cita y rosa para contacto).
- **FR-045**: Todo el texto visible, los mensajes de error, los correos y los metadatos de las
  páginas MUST estar en español de España.
- **FR-046**: Cada página MUST tener un título y una descripción propios para buscadores. Las
  páginas "Próximamente" y "No encontrada" MUST indicar que no se indexen.

**Accesibilidad y rendimiento**

- **FR-047**: Todas las páginas MUST cumplir WCAG 2.2 AA: operables con teclado, foco visible,
  enlace para saltar al contenido, etiquetas asociadas a los campos, contraste AA, objetivos
  táctiles de al menos 24 × 24 px y respeto de `prefers-reduced-motion`.
- **FR-048**: Las imágenes MUST declarar sus dimensiones, y las que quedan fuera de la primera
  pantalla se cargan de forma diferida para que la conexión lenta no desplace el contenido.
- **FR-049**: La navegación, el contenido y el envío del formulario MUST funcionar aunque falle o
  no se cargue el JavaScript.

### Key Entities

- **Clínica**: datos de identidad y contacto de la clínica: nombre, logotipo, titular y texto de
  propuesta de la portada, dirección y coordenadas, teléfono, correo público, buzón para los
  mensajes, plazo de respuesta mostrado, datos del titular y responsable del tratamiento (nombre o
  razón social, NIF y domicilio cuando existan, y correo para ejercer los derechos; en la demo, el
  responsable real de la web de demostración) y si se muestra el aviso de demostración. Hay una por instalación.
- **Horario semanal**: por cada día de la semana, cerrado o uno o varios tramos de apertura.
- **Cierre excepcional**: fechas de inicio y fin y motivo (por ejemplo, un festivo). Prevalece
  sobre el horario semanal.
- **Servicio**: nombre, descripción, orden y estado de publicación.
- **Profesional**: nombre, especialidad, foto con texto alternativo, orden y estado de
  publicación.
- **Tema de preguntas frecuentes**: nombre (Citas, Tienda, Tu mascota…) y orden.
- **Pregunta frecuente**: pregunta, respuesta, tema, orden y estado de publicación.
- **Cifra destacada**: cifra de actividad de la clínica, con valor, texto descriptivo y orden.
  Puede ser ficticia en la demo.
- **Aviso de salud**: texto de la afirmación sanitaria y fuente (referencia y enlace). Solo se
  publica si tiene fuente.
- **Motivo de contacto**: nombre y orden. Es la lista que se ofrece en el formulario.
- **Mensaje de contacto**: nombre, teléfono opcional, correo, motivo, mensaje, fecha y hora,
  constancia de la aceptación de la privacidad (versión y momento), estado de la entrega a la
  clínica, estado del acuse al visitante (enviado, omitido por límite o fallido) y fecha de
  borrado prevista.
- **Página legal**: tipo (aviso legal, privacidad, cookies o términos), texto, versión y fecha de
  última actualización.
- **Preferencia de cookies**: la elección del visitante (aceptadas o rechazadas por categoría), su
  fecha y la versión de la política. Se guarda en el dispositivo del visitante.
- **Sección próximamente**: sección fuera de alcance (reservas, tienda, carrito, consejos o
  cuenta) con su nombre y su destino actual.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En un móvil, un visitante nuevo encuentra el teléfono, la dirección y el horario de
  la clínica en menos de 30 segundos desde la portada en el 90 % de las pruebas con usuarios.
- **SC-002**: Los seis accesos de la portada y las cinco secciones del menú se alcanzan en un solo
  clic o toque, tanto con un ancho de 360 px como en escritorio (verificación 100 %).
- **SC-003**: El 100 % de los mensajes de contacto válidos aceptados llegan al buzón de la clínica
  o quedan registrados como pendientes de reintento. No se pierde ninguno y no se duplica ninguno.
- **SC-004**: Un visitante completa y envía el formulario de contacto en menos de 2 minutos desde
  el móvil.
- **SC-005**: Ninguna página carga recursos no esenciales antes de que el visitante acepte, y
  rechazar cuesta exactamente el mismo número de clics que aceptar.
- **SC-006**: Todas las páginas públicas pasan una revisión automática de accesibilidad sin
  errores de nivel A y AA, y todas las tareas de las historias de usuario se completan solo con
  teclado.
- **SC-007**: La portada obtiene al menos 90 en rendimiento en una auditoría de móvil, y las
  páginas públicas mantienen LCP ≤ 2,5 s, INP ≤ 200 ms y CLS ≤ 0,1 en el percentil 75.
- **SC-008**: Con una conexión 3G lenta simulada, el titular de la portada y los datos de
  contacto se pueden leer en menos de 4 segundos.
- **SC-009**: Poner la web en marcha para otra clínica (nombre, datos, horario, servicios, equipo,
  preguntas y textos legales) solo requiere configuración y carga de datos, sin cambiar las
  páginas, y se puede hacer siguiendo un procedimiento documentado.
- **SC-010**: No se publica ningún texto, cifra, dato ni recurso de ejemplo de `design/` ni de
  terceros (verificable comparando el contenido publicado con `design/`).

## Assumptions

- **Nombre de la clínica**: "PetCare" es el nombre de la clínica ficticia de demostración y es un
  dato configurable. Se asume que no se presenta como una clínica real existente (principio II).
  Antes de publicar, conviene comprobar que el nombre no coincide con una clínica real de la zona.
- **Sin panel de administración** en esta feature: el contenido se mantiene como datos iniciales
  configurables que se editan y se vuelven a cargar. La gestión desde el panel (principio VIII)
  queda para una feature posterior, y la consulta de los mensajes recibidos se hace por ahora desde
  el buzón de correo de la clínica.
- **Datos de ejemplo ficticios**: la demo se publica con contenido inventado para PetCare
  (servicios, equipo, preguntas frecuentes, horario y textos). Se irá ampliando página a página.
- **Una sola clínica** por instalación. La web no contempla varias sedes.
- **Tratamientos sin página de detalle**: cada servicio se muestra con nombre y descripción en la
  lista. Las páginas de detalle por servicio quedan para una feature posterior.
- **Pide cita** apunta a "Próximamente" porque las reservas están fuera de alcance. Mientras tanto,
  la página ofrece llamar o escribir.
- **Mi cuenta y el carrito** se mantienen en la cabecera para respetar el orden del design system
  y llevan a "Próximamente".
- **Respuesta de la clínica**: la web no gestiona la respuesta. La clínica responde desde su propio
  correo y el plazo mostrado es un dato configurable.
- **Plazos de conservación**: 12 meses para los mensajes de contacto y 12 meses de validez para la
  elección de cookies, siguiendo las prácticas habituales y la guía de la AEPD. La política de
  privacidad de cada clínica puede ajustarlos.
- **Textos legales**: en la demo, los redacta el responsable de la web de demostración, que figura
  como responsable del tratamiento. En una clínica real, la clínica aporta los suyos. El producto los muestra y los versiona, pero no
  da asesoramiento legal.
- **Cifras y afirmaciones sanitarias**: en la demo, las cifras de actividad son ficticias. Las
  afirmaciones sanitarias necesitan una fuente real [TBD] y, hasta tenerla, no se muestran.
- **Imágenes**: las fotos del equipo, de la portada y de la clínica las aporta la clínica. Los
  marcadores de posición de `design/` (emojis, degradados y SVG) no se publican.
- **Mapa**: se usa un servicio de mapas de terceros sujeto a consentimiento. Sin consentimiento,
  basta con la dirección y un enlace externo.
- **Envío de correo**: se dispone de un servicio de envío de correo transaccional configurable por
  clínica. Para la demo se usa Brevo (decidido en `/speckit-plan`, ver `research.md`, R7). Las
  credenciales nunca van en el repositorio.
- **Idioma**: solo español. El multidioma está fuera de alcance.
- **Fuera de alcance**: reservas, tienda y carrito, consejos de salud, boletín, cuentas de usuario,
  multidioma y panel de administración.
