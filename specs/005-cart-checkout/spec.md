# Feature Specification: Carrito de la compra y pago

**Feature Branch**: `005-cart-checkout`

**Created**: 2026-11-12

**Status**: Draft

**Input**: User description: "Carrito de la compra y pago. Un visitante o cliente añade productos del catálogo, paga y consulta sus pedidos. Referencia visual: design/carrito.html, checkout.html, producto.html, cuenta.html. User stories: P1 añadir desde el listado y la ficha («Añadir» y «Añadir al carrito») con contador en la cabecera; el carrito se conserva al recargar. P1 en el carrito cambiar cantidades, eliminar productos y ver subtotal, envío y total con IVA, y volver a seguir comprando. P1 checkout con dirección de envío (nombre, apellidos, dirección, código postal, ciudad), método de envío y pago con tarjeta; al pagar, confirmación y correo con el resumen. P1 envío a domicilio (24-48 h) o recogida en la clínica, ambos gratuitos; zonas y condiciones del envío [TBD]. P2 «Mis pedidos» y últimos pedidos en el resumen del área de cliente. P2 compra sin cuenta dejando correo y dirección. P2 «Pago en clínica», con el pedido pendiente de pago. P2 «Comprar ahora» desde la ficha. P3 código de descuento en el carrito [TBD: códigos y tipo]. P3 pago con Bizum [TBD: viabilidad en modo de pruebas]. Casos límite: stock insuficiente al pagar, pago rechazado, cierre del navegador a mitad del pago, cantidad mayor al stock, carrito vacío, dirección fuera de las zonas de envío, código de descuento inválido. Fuera de alcance: devoluciones, facturas PDF, suscripciones. Los pagos funcionan solo en modo de pruebas."

## Contexto

Las features 001 a 004 están implementadas. El catálogo (004) ya muestra productos, precios con IVA
y stock, pero no permite comprar: no hay botones de compra y el enlace "Carrito" de la cabecera
lleva a "Próximamente". Esta feature completa la tienda: carrito, checkout, pago (solo en modo de
pruebas, principio VII), pedidos con su ciclo de vida, correos transaccionales y "Mis pedidos" en
el área de cliente (002).

Como en las features anteriores, todo lo propio de la clínica es dato o configuración: opciones de
envío y sus zonas, métodos de pago activos, códigos de descuento, plazos y textos legales de venta.
Mientras no exista el panel de administración, se mantiene la excepción temporal al principio VIII:
la configuración se carga desde el archivo de contenido y los cambios de estado de los pedidos que
hoy haría el panel se hacen con una herramienta de línea de órdenes documentada. Los productos,
importes y textos de las maquetas no se publican.

La clínica es ficticia: los pedidos son reales en el sistema, pero ningún pago cobra dinero y
ningún producto se envía. La interfaz lo dice con claridad.

## Clarifications

### Session 2026-11-12

- Q: ¿A qué zonas se envía en la demo? → A: A toda España (cualquier código postal español
  válido). Las zonas siguen siendo configurables por clínica.
- Q: ¿Qué tipo y condiciones tienen los códigos de descuento? → A: Porcentaje o importe fijo, con
  fechas de vigencia, importe mínimo opcional y límite de usos opcional.
- Q: ¿Se incluye Bizum? → A: No en esta feature. Solo tarjeta y pago en clínica. Bizum queda
  previsto como método configurable para una feature posterior.
- Q: ¿Puede el comprador cancelar él mismo un pedido? → A: Sí, solo los "Pendiente de pago"
  (tarjeta o pago en clínica). Los pagados solo los cancela la clínica.
- Q: ¿Qué pasa con un pedido pendiente si el comprador vuelve a finalizar la compra desde el mismo
  carrito? → A: Si el contenido no ha cambiado, se reutiliza el mismo pedido. Si ha cambiado, el
  anterior se cancela, se libera su stock y se crea uno nuevo.
- Q: ¿Cuánto tiempo funciona el enlace privado de un pedido de invitado? → A: 90 días desde el
  último cambio de estado. Después muestra un aviso de enlace caducado con el contacto de la
  clínica.
- Q: ¿Se puede aplicar un código de descuento en "Comprar ahora"? → A: No. El código solo se
  aplica en el carrito; la compra directa no tiene campo de descuento.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Añadir productos al carrito (Priority: P1)

Un visitante o cliente añade un producto desde el listado ("Añadir") o desde la ficha, eligiendo
la cantidad ("Añadir al carrito"). La cabecera muestra cuántas unidades lleva en el carrito. Si
recarga la página, cierra la pestaña o vuelve otro día, el carrito sigue ahí.

**Why this priority**: sin carrito no hay compra. Es la base de todo lo demás.

**Independent Test**: añadir dos productos (uno desde el listado y otro desde la ficha con
cantidad 2), recargar y comprobar que el contador muestra 3 y que el carrito conserva ambas líneas.
Repetir sin JavaScript.

**Acceptance Scenarios**:

1. **Given** un producto en stock en el listado, **When** el visitante pulsa "Añadir", **Then** se
   añade 1 unidad, el contador de la cabecera aumenta y se le confirma de forma visible y anunciada
   ("Añadido al carrito"), sin perder su posición, filtros ni búsqueda en el listado.
2. **Given** la ficha de un producto en stock, **When** elige 2 unidades y pulsa "Añadir al
   carrito", **Then** el carrito suma 2 unidades de ese producto (o las acumula si ya estaba).
3. **Given** un carrito con productos, **When** recarga la página o vuelve días después con el
   mismo navegador, **Then** el carrito y el contador se conservan.
4. **Given** un cliente con productos en el carrito antes de iniciar sesión, **When** inicia
   sesión, **Then** su carrito de invitado se une al carrito de su cuenta, sumando cantidades sin
   superar el stock, y lo ve también en otro dispositivo donde haya iniciado sesión.
5. **Given** un producto agotado, **When** aparece en el listado o la ficha, **Then** no muestra
   ninguna acción de compra, como ya establece la feature 004.
6. **Given** que intenta añadir más unidades de las que hay en stock, **When** envía la acción,
   **Then** se añaden solo las disponibles y se le explica el límite ("Solo quedan N unidades").

---

### User Story 2 - Revisar el carrito (Priority: P1)

En la página del carrito, el comprador ve cada producto con su foto, nombre, categoría y mascota,
cantidad y precio. Cambia cantidades, elimina líneas y ve el resumen: subtotal, envío, total con
IVA incluido. Desde ahí sigue comprando o pasa a finalizar la compra.

**Why this priority**: es el paso obligado entre elegir y pagar, y donde se corrigen errores.

**Independent Test**: con un carrito de dos productos, subir la cantidad de uno, eliminar el otro y
comprobar que las cifras del resumen coinciden con los precios del catálogo.

**Acceptance Scenarios**:

1. **Given** un carrito con productos, **When** abre "Carrito", **Then** ve cada línea (foto,
   nombre, "Categoría · Mascota", selector de cantidad, importe de la línea y "Eliminar") y el
   resumen con subtotal, envío ("Gratis" mientras ambos métodos lo sean), total e indicación "IVA
   incluido" con el importe de IVA que contiene.
2. **Given** una línea, **When** cambia la cantidad o pulsa "Eliminar", **Then** la línea, el
   contador y el resumen se actualizan, también sin JavaScript.
3. **Given** el carrito, **When** pulsa "Seguir comprando", **Then** vuelve al listado.
4. **Given** un carrito vacío, **When** abre "Carrito", **Then** ve un mensaje de carrito vacío con
   un enlace al listado y no puede finalizar la compra.
5. **Given** un producto del carrito que ha cambiado de precio, se ha agotado o ha dejado de
   publicarse desde que lo añadió, **When** abre el carrito, **Then** se le avisa junto a la línea:
   el precio se actualiza al actual, la cantidad se ajusta al stock y las líneas no disponibles se
   marcan y no cuentan en el total.

---

### User Story 3 - Finalizar la compra y pagar con tarjeta (Priority: P1)

El comprador pulsa "Finalizar compra", rellena los datos de envío (nombre, apellidos, dirección,
código postal, ciudad), elige el método de envío y paga con tarjeta en la pasarela externa, en modo
de pruebas. Al volver, ve la confirmación del pedido con su número y recibe un correo con el
resumen.

**Why this priority**: es el objetivo de la tienda y un flujo crítico del principio III.

**Independent Test**: con un carrito, completar el checkout con una tarjeta de pruebas que se
acepta y comprobar el pedido "Pagado", el stock descontado, la página de confirmación y el correo.
Repetir con una tarjeta de pruebas que se rechaza.

**Acceptance Scenarios**:

1. **Given** un carrito con productos disponibles, **When** pulsa "Finalizar compra", **Then** ve
   los pasos "1 Carrito · 2 Datos y pago · 3 Confirmación", el formulario de datos, los métodos de
   envío y de pago y el resumen "Tu pedido" con líneas, envío y total.
2. **Given** el formulario, **When** lo envía con campos vacíos o inválidos, **Then** cada error
   aparece en español junto a su campo, anunciado, y conserva lo ya escrito.
3. **Given** datos válidos y "Tarjeta", **When** pulsa "Confirmar pedido", **Then** se crea el
   pedido "Pendiente de pago", se reservan sus unidades y se le lleva a la pasarela externa. En
   ningún momento la web propia pide ni recibe datos de tarjeta.
4. **Given** que paga con éxito, **When** la pasarela confirma el pago al servidor, **Then** el
   pedido pasa a "Pagado", el carrito se vacía, ve la confirmación ("Pedido PC-… confirmado") con
   el resumen y recibe un correo con el resumen del pedido.
5. **Given** que la pasarela rechaza el pago o el comprador lo cancela, **When** vuelve a la web,
   **Then** ve un mensaje claro, el pedido sigue "Pendiente de pago" con las unidades reservadas y
   puede reintentar el pago o volver al carrito, que conserva sus productos.
6. **Given** que la confirmación llega a la vez por el regreso del navegador y por el aviso de la
   pasarela, o llega repetida, **When** se procesa, **Then** el pedido se marca pagado una sola vez,
   el stock se descuenta una sola vez y se envía un solo correo.
7. **Given** cualquier página del checkout, **When** se muestra, **Then** indica de forma visible
   que es una tienda de demostración: los pagos son de prueba, no se cobra nada y no se envía nada.

---

### User Story 4 - Elegir envío a domicilio o recogida en la clínica (Priority: P1)

El comprador elige entre envío a domicilio (24-48 h) y recogida en la clínica, ambos gratuitos en
la demo. Si recoge en la clínica, no tiene que dar una dirección de envío.

**Why this priority**: sin método de envío el pedido no puede completarse.

**Independent Test**: hacer un pedido con cada método y comprobar los campos pedidos, el coste y
cómo se reflejan en la confirmación, el correo y "Mis pedidos".

**Acceptance Scenarios**:

1. **Given** el checkout, **When** se muestran los métodos de envío, **Then** cada uno indica su
   nombre, su plazo o condición y su coste ("Gratis"), tomados de la configuración de la clínica.
2. **Given** "Envío a domicilio", **When** introduce un código postal fuera de las zonas de envío
   configuradas, **Then** se le avisa junto al campo de que no se envía a esa zona y se le ofrece la
   recogida en la clínica.
3. **Given** "Recogida en la clínica", **When** completa el checkout, **Then** solo se le piden
   nombre, apellidos y correo, y la confirmación y el correo muestran la dirección y el horario de
   la clínica.

---

### User Story 5 - Consultar mis pedidos (Priority: P2)

El cliente con sesión ve en su área "Mis pedidos" (lista de pedidos con número, fecha, estado y
total, y el detalle de cada uno) y, en el resumen, el bloque "Últimos pedidos".

**Why this priority**: da seguimiento tras la compra, pero la compra funciona sin ello.

**Independent Test**: con un cliente con 4 pedidos en distintos estados, comprobar la lista, el
detalle, el bloque del resumen y que otro cliente no puede ver ninguno.

**Acceptance Scenarios**:

1. **Given** un cliente con pedidos, **When** abre "Mis pedidos", **Then** ve sus pedidos del más
   reciente al más antiguo con número, fecha, estado y total, y puede abrir el detalle (líneas,
   envío, dirección, método de pago e historial de estados).
2. **Given** el resumen del área, **When** el cliente tiene pedidos, **Then** ve "Últimos pedidos"
   con los 3 más recientes y un enlace a "Mis pedidos". Si no tiene, el bloque invita a visitar la
   tienda.
3. **Given** el número o la dirección de un pedido de otro cliente, **When** intenta abrirlo,
   **Then** obtiene "no encontrado", sin revelar que existe.
4. **Given** un pedido "Pendiente de pago" con tarjeta y aún dentro de plazo, **When** abre su
   detalle, **Then** puede reintentar el pago.
5. **Given** un pedido propio "Pendiente de pago" (con tarjeta o con pago en clínica), **When** el
   comprador (cliente desde su área o invitado desde su enlace privado) pulsa "Cancelar pedido" y
   lo confirma, **Then** el pedido pasa a "Cancelado", se libera el stock y recibe el correo de
   cancelación. Un pedido pagado no muestra esta opción.

---

### User Story 6 - Comprar sin cuenta (Priority: P2)

Un visitante compra sin registrarse: deja su correo y sus datos de envío. Recibe el correo de
confirmación con un enlace privado para consultar el estado de su pedido.

**Why this priority**: obligar a registrarse pierde ventas, pero la compra con cuenta ya funciona.

**Independent Test**: completar una compra sin sesión, abrir el enlace del correo y ver el pedido;
manipular el enlace y comprobar que no da acceso.

**Acceptance Scenarios**:

1. **Given** un visitante sin sesión, **When** llega al checkout, **Then** se le pide su correo
   además de los datos de envío y se le ofrece iniciar sesión o crear cuenta como opción, nunca
   como obligación.
2. **Given** un pedido de invitado, **When** recibe el correo, **Then** este incluye un enlace
   privado y difícil de adivinar a la página de su pedido, que no requiere sesión.
3. **Given** un correo de invitado que coincide con el de una cuenta existente, **When** compra,
   **Then** el pedido no se asocia a esa cuenta ni la web revela que la cuenta existe.
4. **Given** un cliente con sesión, **When** llega al checkout, **Then** su correo viene de su
   cuenta y sus datos de envío se rellenan con los de su último pedido, si lo hay.

---

### User Story 7 - Pagar en la clínica (Priority: P2)

El comprador elige "Pago en clínica". El pedido queda "Pendiente de pago" con las unidades
reservadas y se paga al recogerlo.

**Why this priority**: alternativa para quien no quiere pagar en línea; no es imprescindible.

**Independent Test**: hacer un pedido con recogida y pago en clínica, comprobar el estado, la
reserva de stock y el correo; luego marcarlo como pagado y entregado con la herramienta de la
clínica, y dejar caducar otro para ver que se cancela y libera el stock.

**Acceptance Scenarios**:

1. **Given** el checkout, **When** elige "Pago en clínica", **Then** solo puede combinarlo con
   "Recogida en la clínica"; si había elegido envío a domicilio, se le explica y se le ofrece
   cambiar.
2. **Given** que confirma el pedido, **When** se crea, **Then** queda "Pendiente de pago", se
   reservan las unidades, el carrito se vacía, ve la confirmación con el plazo para recogerlo y
   recibe un correo con el resumen y ese plazo.
3. **Given** un pedido pendiente de pago en clínica, **When** vence el plazo de recogida
   configurado sin que se haya pagado, **Then** se cancela automáticamente, se libera el stock y
   se avisa por correo al comprador.

---

### User Story 8 - "Comprar ahora" desde la ficha (Priority: P2)

Desde la ficha, el visitante pulsa "Comprar ahora" y va directo al checkout con ese producto y la
cantidad elegida, sin pasar por el carrito.

**Why this priority**: atajo para compras de un solo producto.

**Independent Test**: con otros productos en el carrito, usar "Comprar ahora" en una ficha y
comprobar que el checkout contiene solo ese producto y que el carrito sigue intacto.

**Acceptance Scenarios**:

1. **Given** la ficha de un producto en stock, **When** pulsa "Comprar ahora" con 2 unidades,
   **Then** llega al checkout con solo ese producto y esas 2 unidades.
2. **Given** que ya tenía otros productos en el carrito, **When** completa o abandona la compra
   directa, **Then** su carrito conserva sus productos sin cambios.

---

### User Story 9 - Aplicar un código de descuento (Priority: P3)

En el carrito, el comprador introduce un código de descuento. Si es válido, el resumen muestra el
descuento y el nuevo total.

**Why this priority**: herramienta comercial opcional.

**Independent Test**: aplicar un código válido, uno caducado y uno inexistente, y comprobar el
total y los mensajes; completar una compra con el código y comprobar que el pedido lo registra.

**Acceptance Scenarios**:

1. **Given** un código válido, **When** lo aplica en el carrito, **Then** el resumen muestra una
   línea "Descuento (<código>)" con su importe y el total rebajado, y puede quitarlo.
2. **Given** un código inexistente, caducado, agotado o cuyas condiciones no cumple el carrito,
   **When** lo aplica, **Then** ve un mensaje junto al campo que explica el motivo sin revelar
   códigos válidos, y el total no cambia.
3. **Given** un código aplicado, **When** el carrito cambia y deja de cumplir las condiciones o el
   código caduca antes de pagar, **Then** el descuento se retira y se le avisa antes de confirmar.
4. **Given** un código de porcentaje (p. ej. 10 %), **When** se aplica, **Then** descuenta ese
   porcentaje del subtotal, redondeado al céntimo. **Given** un código de importe fijo (p. ej.
   5,00 €), **When** se aplica, **Then** descuenta ese importe, sin que el total baje de 0,00 €.
5. **Given** un código con importe mínimo, fechas de vigencia o límite de usos, **When** el carrito
   no llega al mínimo, la fecha está fuera de la vigencia o se han agotado los usos, **Then** el
   código no se aplica y el mensaje indica el motivo (por ejemplo, "Este código requiere un pedido
   mínimo de 30,00 €").

---

### Edge Cases

- **Stock insuficiente al confirmar**: si entre el carrito y "Confirmar pedido" otro comprador se
  lleva las unidades, el pedido no se crea, se vuelve al carrito con la cantidad ajustada y un aviso.
  Dos compradores no pueden reservar la misma última unidad.
- **Stock agotado tras el pago**: no puede ocurrir mientras la reserva esté vigente. Si un pago se
  confirma después de que el pedido haya caducado y el stock ya no alcance, el pedido se cancela,
  el pago se reembolsa automáticamente y se avisa al comprador por correo.
- **Pago rechazado**: el pedido sigue "Pendiente de pago" y se puede reintentar mientras dure la
  reserva.
- **Cierre del navegador a mitad del pago**: si la pasarela confirma el pago, el pedido pasa a
  "Pagado" y se envía el correo aunque el comprador no vuelva a la web. Si no hay pago, el pedido
  caduca al vencer la reserva (30 minutos por defecto, configurable), se cancela y libera el stock.
  El carrito no se vacía hasta que el pago se confirma. Si vuelve a finalizar la compra, se aplica
  FR-012 y no se duplica la reserva.
- **Cantidad mayor al stock**: se limita al stock disponible con un aviso; nunca se acepta una
  cantidad negativa, cero (equivale a eliminar), no entera o superior al máximo por línea.
- **Carrito vacío**: se muestra el estado vacío; las direcciones del checkout redirigen al carrito.
- **Dirección fuera de las zonas de envío**: ver US4, escenario 2. La comprobación se repite en el
  servidor al confirmar.
- **Código de descuento inválido**: ver US9, escenario 2. Los intentos se limitan por origen.
- **Producto despublicado o con precio cambiado mientras está en el carrito**: ver US2, escenario 5.
  El pedido siempre se crea con el precio vigente al confirmar, que el comprador ve antes de pagar.
- **Envío repetido del formulario** (doble clic, recarga, atrás): crea un solo pedido.
- **Pedidos repetidos en poco tiempo** desde el mismo origen: se limitan para evitar abusos y
  reservas masivas de stock.
- **Enlace privado de un pedido de invitado manipulado o ajeno**: "no encontrado". Si está
  caducado, se aplica FR-024.
- **Cliente que borra su cuenta con pedidos**: los pedidos se conservan el tiempo que exige la ley,
  desvinculados de la cuenta, y desaparecen de cualquier vista del cliente.
- **Tienda o métodos desactivados en la configuración**: el carrito y los métodos desactivados no
  se muestran ni se aceptan, aunque se envíe la petición a mano.

## Requirements *(mandatory)*

### Functional Requirements

**Carrito**

- **FR-001**: El listado MUST ofrecer "Añadir" (1 unidad) y la ficha, un selector de cantidad con
  "Añadir al carrito" y "Comprar ahora", solo en productos publicados y en stock. Esto sustituye a
  FR-019 de la feature 004.
- **FR-002**: El enlace "Carrito" de la cabecera (siempre el último) MUST llevar a la página del
  carrito y mostrar el número de unidades, anunciado a lectores de pantalla ("Carrito, 3
  productos").
- **FR-003**: El carrito MUST persistir en el servidor: el de un visitante se asocia a su navegador
  y se conserva al menos 30 días desde su último cambio; el de un cliente se asocia a su cuenta. Al
  iniciar sesión, ambos se unen (US1, escenario 4).
- **FR-004**: El comprador MUST poder cambiar la cantidad de cada línea (de 1 al menor entre el
  stock y un máximo por línea configurable, 10 por defecto) y eliminar líneas.
- **FR-005**: El carrito MUST mostrar los precios vigentes del catálogo y, en el resumen: subtotal,
  descuento (si lo hay), envío, total con IVA incluido y el importe de IVA incluido.
- **FR-006**: El carrito MUST revalidar precio, publicación y stock cada vez que se muestra y al
  confirmar, y avisar junto a la línea afectada (US2, escenario 5).

**Checkout**

- **FR-007**: El checkout MUST pedir: correo (solo sin sesión), nombre y apellidos siempre, y
  dirección, código postal y ciudad solo con envío a domicilio. Finalidades: el correo, para
  confirmar y dar acceso al pedido; nombre y apellidos, para identificar al destinatario o a quien
  recoge; la dirección, para entregar. No se piden otros datos (principio IV).
- **FR-008**: Todos los datos MUST validarse en el servidor. El código postal debe ser español de 5
  dígitos y pertenecer a una zona de envío configurada cuando el método es envío a domicilio.
- **FR-009**: Los métodos de envío MUST ser configurables por la clínica (nombre, descripción,
  plazo, coste, zonas y si está activo). En la demo: "Envío a domicilio (24-48 h)" y "Recogida en
  la clínica", ambos gratuitos. Las zonas se definen por códigos postales. En la demo, el envío a
  domicilio cubre toda España (cualquier código postal español válido), y los tests de zona usan
  una configuración restringida.
- **FR-010**: Los métodos de pago MUST ser configurables (activo o no): "Tarjeta" y "Pago en
  clínica". "Pago en clínica" solo se admite con "Recogida en la clínica". Bizum queda fuera de
  esta feature y no se muestra.
- **FR-011**: "Confirmar pedido" MUST crear el pedido con un número legible y único, guardar una
  copia de cada línea (nombre, precio unitario, tipo de IVA, cantidad), del envío, del descuento y
  de los totales en ese momento, y reservar las unidades de forma atómica: o se reservan todas, o
  no se crea el pedido.
- **FR-012**: El envío del formulario MUST ser idempotente: repetirlo devuelve el mismo pedido.
  Además, un carrito (o una compra directa) tiene como mucho un pedido pendiente de pago con
  tarjeta. Si el comprador vuelve a finalizar la compra con el mismo contenido (productos,
  cantidades, envío y descuento), se reutiliza ese pedido y su reserva. Si el contenido ha
  cambiado, el pedido anterior se cancela, se libera su stock y se crea uno nuevo.
- **FR-013**: El checkout MUST mostrar un aviso visible de tienda de demostración (pagos de prueba,
  sin cobro ni envío real), configurable por la clínica, y enlazar a las condiciones de venta.
- **FR-014**: "Comprar ahora" MUST llevar al checkout con solo ese producto y cantidad, sin
  modificar el carrito (US8). La compra directa no admite códigos de descuento: el código solo se
  aplica en el carrito y no se traslada a la compra directa.

**Pago**

- **FR-015**: El pago con tarjeta MUST hacerse en la pasarela externa, en modo de pruebas. La web
  propia nunca pide, recibe ni guarda datos de tarjeta (principio VII).
- **FR-016**: Un pedido MUST marcarse como pagado solo cuando la pasarela lo confirme al servidor
  de forma verificada (aviso firmado), nunca por el mero regreso del navegador. El procesamiento es
  idempotente (US3, escenario 6).
- **FR-017**: Un pago rechazado o cancelado MUST dejar el pedido "Pendiente de pago", con opción de
  reintentar mientras la reserva siga vigente.
- **FR-018**: Un pedido con pago en línea no pagado MUST caducar al vencer su reserva (30 minutos
  por defecto, configurable): se cancela y se libera el stock. Un pedido con pago en clínica caduca
  al vencer el plazo de recogida (7 días por defecto, configurable).
- **FR-019**: Si un pedido pagado se cancela (pago confirmado tras caducar sin stock suficiente, o
  cancelación por la clínica), el sistema MUST reembolsar el importe a través de la pasarela y
  registrar el reembolso. Las devoluciones de productos quedan fuera de alcance.

**Pedidos**

- **FR-020**: Un pedido MUST tener uno de estos estados: "Pendiente de pago", "Pagado", "En
  preparación", "Enviado", "Listo para recoger", "Entregado" y "Cancelado" (con "Reembolsado" como
  marca del pago). Solo se permiten transiciones coherentes con su método de envío y de pago, y
  cada cambio queda registrado con fecha y origen (comprador, sistema o clínica). El comprador solo
  puede cancelar sus pedidos "Pendiente de pago" (US5, escenario 5). Un pedido pagado solo lo
  cancela la clínica.
- **FR-021**: El stock MUST descontarse definitivamente cuando el pedido se paga (o, con pago en
  clínica, cuando se entrega) y liberarse si se cancela antes.
- **FR-022**: Mientras no exista el panel, la clínica MUST poder cambiar el estado de un pedido
  (incluido marcarlo pagado en clínica, entregarlo o cancelarlo) con una herramienta de línea de
  órdenes documentada, que respeta las mismas reglas de transición y reembolso.
- **FR-023**: El área de cliente MUST incluir "Mis pedidos" (lista y detalle) y el bloque "Últimos
  pedidos" del resumen (US5). Cada cliente solo accede a sus pedidos.
- **FR-024**: Un pedido de invitado MUST poder consultarse con un enlace privado, imposible de
  deducir, enviado por correo. No se asocia a ninguna cuenta. El enlace caduca 90 días después del
  último cambio de estado del pedido (configurable). Un enlace caducado muestra un aviso con el
  contacto de la clínica y ningún dato del pedido.

**Correos**

- **FR-025**: El sistema MUST enviar, a través de la bandeja de salida existente: el resumen del
  pedido al pagarse (tarjeta) o al crearse (pago en clínica); y avisos de cancelación con o
  sin reembolso. El correo incluye número, líneas, totales con IVA, método de envío, dirección o
  datos de recogida, método de pago, estado y enlace al pedido, y recuerda que es una demo.
- **FR-026**: La clínica MUST recibir un aviso de cada pedido nuevo en su buzón configurado.

**Descuentos**

- **FR-027**: Los códigos de descuento MUST ser datos de la clínica (código, tipo, valor,
  condiciones, vigencia y límite de usos). Solo se aplica un código por pedido, que el pedido
  registra; el uso se aparta al confirmar el pedido (con tarjeta o con pago en clínica) y se
  libera si el pedido se cancela, de modo que el límite de usos nunca se supera. Tipos:
  porcentaje o importe fijo. Condiciones opcionales: fechas de vigencia, importe mínimo del
  subtotal y límite total de usos (US9, escenarios 4 y 5).
- **FR-028**: Los intentos de aplicar códigos MUST limitarse por origen para impedir adivinarlos.

**Datos, privacidad y adaptabilidad**

- **FR-029**: Métodos de envío y de pago, zonas, plazos de reserva y de recogida, máximo por línea,
  prefijo del número de pedido, aviso de demostración, códigos de descuento y condiciones de venta
  MUST ser datos de la clínica cargados con el procedimiento de contenido existente.
- **FR-030**: El sistema MUST publicar una página de condiciones de venta, con su texto como
  contenido de la clínica, y actualizar los textos que hoy dicen que la clínica no vende productos
  y el aviso del catálogo para reflejar la tienda de demostración.
- **FR-031**: Los pedidos MUST conservarse el plazo legal aplicable. Al borrar una cuenta, sus
  pedidos se desvinculan de ella y se conservan sin acceso del cliente; la exportación de datos de
  la cuenta MUST incluir sus pedidos.
- **FR-032**: Los registros técnicos MUST identificar pedidos y pagos solo por identificadores y
  códigos de error, sin correos, nombres ni direcciones.

**Transversales**

- **FR-033**: Añadir, cambiar cantidades, eliminar, aplicar códigos y todo el checkout hasta la
  redirección a la pasarela MUST funcionar sin JavaScript.
- **FR-034**: Las pantallas MUST cumplir WCAG 2.2 AA: teclado, foco visible, etiquetas en todos los
  campos y en el selector de cantidad, errores junto al campo y anunciados, cambios del contador y
  del resumen anunciados, y estados que no dependan solo del color.
- **FR-035**: Las pantallas MUST usar solo componentes y tokens del sistema de diseño, siguiendo
  `design/carrito.html`, `design/checkout.html`, `design/producto.html` y `design/cuenta.html`
  (`cart-btn`, `cart-count`, `cart-layout`, `cart-item`, `qty`, `summary`, `steps`, `option`,
  `panel`, `field-row`, `orders`, `side-nav`, botones y formularios existentes). Los CTA de compra
  ("Añadir", "Añadir al carrito", "Finalizar compra", "Confirmar pedido") usan el marino de acción
  neutra, no el cian de la maqueta, reservado para pedir cita (principio I). La confirmación usa el
  menta de éxito. Lo que falte se añade al sistema de diseño solo con tokens.

### Key Entities *(include if feature involves data)*

- **Carrito**: productos que un comprador va a comprar. Pertenece a un navegador (visitante) o a
  una cuenta (cliente). Tiene líneas (producto y cantidad), un código de descuento aplicado
  (opcional) y la fecha del último cambio.
- **Pedido**: compra confirmada. Tiene número legible, comprador (cuenta o correo de invitado),
  datos de envío o recogida, método de envío y de pago, copia de las líneas con precio e IVA,
  descuento, totales, estado, historial de estados, plazo de reserva y enlace privado.
- **Línea de pedido**: copia de un producto en el momento de la compra: nombre, precio unitario con
  IVA, tipo de IVA, cantidad e importe.
- **Pago**: intento de cobro de un pedido en la pasarela: método, importe, estado (pendiente,
  aceptado, rechazado, reembolsado) e identificador de la pasarela. Un pedido puede tener varios
  intentos y solo uno aceptado.
- **Reserva de stock**: unidades apartadas por un pedido pendiente, con su vencimiento.
- **Método de envío**: opción configurable con nombre, descripción, plazo, coste, zonas y estado.
- **Zona de envío**: conjunto de códigos postales a los que se envía.
- **Método de pago**: opción configurable (tarjeta, pago en clínica) con su estado y
  restricciones.
- **Código de descuento**: código con tipo, valor, condiciones, vigencia, límite y usos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un comprador pasa de una ficha de producto a la confirmación de un pedido pagado con
  tarjeta de pruebas en menos de 3 minutos.
- **SC-002**: En pruebas de concurrencia con varios compradores sobre la última unidad, nunca se
  venden más unidades que el stock: 0 sobreventas.
- **SC-003**: El 100 % de los pagos confirmados por la pasarela dejan el pedido "Pagado" y envían
  un solo correo, aunque el comprador cierre el navegador o la confirmación llegue repetida.
- **SC-004**: El 100 % de los pedidos pendientes caducados se cancelan y liberan su stock dentro
  del plazo configurado más 5 minutos.
- **SC-005**: Los totales del carrito, el checkout, el pedido y el correo coinciden al céntimo en el
  100 % de los casos probados, con descuentos, IVA y cantidades varias.
- **SC-006**: Ningún cliente ni invitado puede ver un pedido ajeno en ninguna de las pruebas de
  acceso.
- **SC-007**: Todo el recorrido hasta la pasarela se completa sin JavaScript y solo con teclado,
  sin incumplimientos en la comprobación automática de accesibilidad.
- **SC-008**: El listado y la ficha mantienen 90 o más en rendimiento móvil en Lighthouse tras
  añadir los controles de compra.
- **SC-009**: Poner en marcha la tienda de otra clínica (envíos, pagos, zonas, códigos y
  condiciones) solo requiere editar sus datos y su configuración, sin tocar el código.

## Assumptions

- **Pasarela**: una pasarela externa con modo de pruebas, página de pago alojada por ella y avisos
  firmados. Su elección se hace en el plan. Solo se usan claves de prueba (principio VII).
- **IVA**: los precios del catálogo ya incluyen IVA (004). El resumen muestra el IVA contenido. El
  envío gratuito no lleva IVA. Las facturas quedan fuera de alcance.
- **Reserva de stock**: se reserva al confirmar el pedido, no al añadir al carrito. Añadir al
  carrito no garantiza disponibilidad.
- **Plazos por defecto**: reserva de pago en línea, 30 minutos; plazo de recogida con pago en
  clínica, 7 días; carrito de visitante, 30 días; máximo por línea, 10 unidades. Todos
  configurables.
- **Pago en clínica**: solo con recogida en la clínica, porque el pago se hace al recoger.
- **Número de pedido**: prefijo configurable más un número correlativo (en la demo, "PC-").
- **Datos del cliente con sesión**: se reutiliza la dirección de su último pedido. No se crea una
  libreta de direcciones.
- **Sin panel de administración**: se mantiene la excepción temporal al principio VIII. Los cambios
  de estado que no automatiza el sistema se hacen con una herramienta de línea de órdenes.
- **Notificaciones de estado**: solo hay correos de resumen y de cancelación o reembolso. Los avisos
  de "Enviado" o "Listo para recoger" quedan para cuando exista el panel.
- **Conservación**: los pedidos se conservan 6 años por obligaciones mercantiles y fiscales,
  revisable en el plan.
- **Fuera de alcance**: Bizum, devoluciones de productos, facturas PDF, suscripciones, libreta de
  direcciones, costes de envío no gratuitos en la demo (el modelo los admite), envíos fuera de
  España y productos con receta.
- **Dependencias**: catálogo (004), cuentas y área de cliente (002), bandeja de salida de correos
  y límites por origen (001).
