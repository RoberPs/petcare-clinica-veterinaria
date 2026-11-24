# Feature Specification: Panel de administración de la tienda

**Feature Branch**: `008-admin-store-panel`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Panel de administración de la tienda. El administrador gestiona
productos, stock, pedidos y códigos de descuento. El panel no tiene páginas en design/; sigue la
misma identidad visual. P1: crear, editar y desactivar productos (nombre, descripción,
ingredientes, modo de uso, categoría, mascota, precio, foto, stock, etiquetas «Novedad» y
«Oferta»); ver la lista de pedidos con filtro por estado; cambiar el estado de un pedido (pagado,
preparado, enviado, entregado, cancelado), con correo al cliente y reflejo en su área. P2: ajustar
el stock manualmente; confirmar como pagado un pedido de «Pago en clínica». P3: crear y desactivar
códigos de descuento. Casos límite: desactivar un producto con pedidos previos, stock negativo,
cancelar un pedido ya enviado. Fuera de alcance: devoluciones, facturación, informes de ventas,
importación masiva."

## Clarifications

### Session 2026-11-23

- Q: ¿Puede el administrador cancelar un pedido que ya está "Enviado"? → A: No. Desde "Enviado" o
  "Entregado" no se cancela; el panel explica que las devoluciones quedan fuera de alcance.
- Q: ¿Se pueden editar las condiciones de un código de descuento ya creado? → A: No. Solo se crea,
  se desactiva y se reactiva; para otras condiciones se crea un código nuevo.
- Q: ¿De dónde sale la foto de un producto? → A: Se sube desde el panel (JPEG, PNG o WebP de hasta
  5 MB), con texto alternativo obligatorio.
- Q: En un pedido con pago en clínica, ¿cuándo se descuenta definitivamente el stock? → A: Al
  confirmar el pago; hasta entonces las unidades siguen reservadas.

## User Scenarios & Testing *(mandatory)*

Todas las historias se desarrollan dentro del panel de la feature 007: mismo acceso con rol de
administrador, misma navegación (con una sección nueva de tienda) y mismo registro de acciones.
Las reglas de pedidos, stock, pagos y descuentos son las de la feature 005; este panel solo las
pone en manos de la clínica.

### User Story 1 - Crear, editar y desactivar productos (Priority: P1)

El administrador da de alta un producto con todos los datos de su ficha pública, lo corrige más
tarde y lo desactiva cuando deja de venderlo. Lo que guarda se ve en el catálogo público en la
siguiente consulta.

**Why this priority**: sin esto el catálogo solo cambia editando el archivo de datos de la
clínica, lo que incumple el principio VIII para el catálogo.

**Independent Test**: crear un producto con foto, comprobar que aparece en el listado y en su
ficha; editar su precio y verlo cambiado; desactivarlo y comprobar que desaparece del catálogo.

**Acceptance Scenarios**:

1. **Given** el panel, **When** el administrador crea un producto con nombre, descripción breve y
   completa, ingredientes y modo de uso (opcionales), categoría, una o varias mascotas, precio con
   IVA, tipo de IVA, stock inicial, foto con texto alternativo y las marcas "Novedad" y "Oferta",
   **Then** el producto queda guardado y, si lo publica, aparece en el listado, los filtros, la
   búsqueda y su ficha con esos datos.
2. **Given** un formulario con datos inválidos (nombre vacío o repetido, precio cero o negativo,
   ninguna mascota, foto con formato o tamaño no admitidos, "Oferta" sin precio anterior mayor que
   el actual), **When** lo envía, **Then** ve cada error junto a su campo y no se guarda nada.
3. **Given** un producto publicado, **When** el administrador cambia su precio, **Then** el
   catálogo y los carritos muestran el precio nuevo, y los pedidos ya confirmados conservan el
   precio con el que se hicieron.
4. **Given** un producto publicado, **When** el administrador lo desactiva, **Then** deja de
   aparecer en el listado, la búsqueda y las recomendaciones, su dirección responde como página
   inexistente y en los carritos figura como no disponible y no puede comprarse.
5. **Given** un producto desactivado, **When** el administrador lo reactiva, **Then** vuelve a
   aparecer en el catálogo con sus datos intactos.
6. **Given** el panel, **When** el administrador abre la lista de productos, **Then** la ve
   paginada, con búsqueda por nombre y filtros por categoría, mascota y estado (publicado o
   desactivado), con el stock disponible de cada uno.

---

### User Story 2 - Ver la lista de pedidos filtrada por estado (Priority: P1)

El administrador consulta los pedidos de la tienda, los filtra por estado y abre el detalle de
cada uno para prepararlo.

**Why this priority**: es la tarea diaria de la tienda y la base para cambiar estados.

**Independent Test**: con pedidos en todos los estados, filtrar por cada uno y comprobar que el
número y el contenido coinciden; abrir un detalle y comprobar todos sus datos.

**Acceptance Scenarios**:

1. **Given** pedidos en distintos estados, **When** el administrador abre "Pedidos", **Then** los
   ve del más reciente al más antiguo, paginados, con número, fecha, comprador, método de envío y
   de pago, total y estado, y el número de pedidos de cada estado.
2. **Given** la lista, **When** filtra por un estado (o busca por número de pedido), **Then** solo
   ve los pedidos que cumplen el filtro, y el filtro se conserva al volver desde un detalle.
3. **Given** un pedido, **When** abre su detalle, **Then** ve líneas, descuento, envío, totales con
   IVA, datos de contacto y dirección o recogida, método y estado del pago (incluido el reembolso,
   si lo hay), historial de estados con fecha y origen, y las acciones que permite su estado.
4. **Given** ningún pedido en el estado filtrado, **When** filtra, **Then** ve un estado vacío
   que lo explica.

---

### User Story 3 - Cambiar el estado de un pedido (Priority: P1)

El administrador avanza un pedido por su ciclo de vida (pagado, en preparación, enviado o listo
para recoger, entregado) o lo cancela. El comprador recibe un correo y ve el estado nuevo en su
área o en el enlace privado de su pedido.

**Why this priority**: es lo que pide el cliente tras comprar; hoy solo se puede hacer con la
herramienta de línea de órdenes.

**Independent Test**: llevar un pedido pagado con envío a domicilio hasta "Entregado" y otro con
recogida hasta "Entregado", comprobando en cada paso el correo, el historial y lo que ve el
comprador; cancelar uno pagado y comprobar el reembolso.

**Acceptance Scenarios**:

1. **Given** un pedido "Pagado", **When** el administrador lo pasa a "En preparación", **Then** el
   estado cambia, el historial registra la fecha y que lo hizo la clínica, el comprador recibe un
   correo con el estado nuevo y lo ve en "Mis pedidos" o en su enlace privado.
2. **Given** un pedido "En preparación", **When** el administrador lo marca "Enviado" (envío a
   domicilio) o "Listo para recoger" (recogida), **Then** el comprador recibe el correo
   correspondiente: el de envío con el plazo de entrega y el de recogida con la dirección y el
   horario de la clínica.
3. **Given** un pedido, **When** el administrador abre sus acciones, **Then** solo se le ofrecen
   las transiciones que permiten su estado, su método de envío y su método de pago; una transición
   no permitida enviada a mano se rechaza sin cambiar nada.
4. **Given** un pedido pagado y aún no enviado ni entregado, **When** el administrador lo cancela
   e indica un motivo, **Then** el pedido pasa a "Cancelado", el importe se reembolsa por la
   pasarela, se libera el stock y el uso del código de descuento, y el comprador recibe el aviso
   de cancelación con reembolso.
5. **Given** dos administradores con el mismo pedido abierto, **When** el segundo intenta un
   cambio después de que el primero ya lo haya cambiado, **Then** se le avisa de que el pedido ha
   cambiado, se le muestra el estado actual y no se aplica su acción.
6. **Given** un fallo al enviar el correo, **When** cambia el estado, **Then** el cambio se
   mantiene y el correo se reintenta con la bandeja de salida existente.

---

### User Story 4 - Ajustar el stock manualmente (Priority: P2)

El administrador corrige el stock de un producto porque ha recibido mercancía, ha hecho un
recuento o se ha roto una unidad.

**Why this priority**: el stock baja solo con las ventas, pero no sube solo; sin ajuste el
catálogo acaba mostrando productos agotados que sí están en el almacén.

**Independent Test**: sumar unidades a un producto agotado y comprobar que vuelve a "En stock";
restar unidades y comprobar el historial; intentar dejarlo por debajo de cero o de lo reservado y
comprobar el rechazo.

**Acceptance Scenarios**:

1. **Given** un producto, **When** el administrador suma o resta unidades e indica un motivo
   (entrada de mercancía, recuento, rotura o pérdida, otro), **Then** el stock cambia, el ajuste
   queda en el historial del producto con fecha, autor, cantidad y motivo, y el catálogo refleja
   el estado ("En stock" o "Agotado") en la siguiente consulta.
2. **Given** un producto con 3 unidades de las que 2 están reservadas por pedidos pendientes,
   **When** el administrador intenta restar más de 1, **Then** el ajuste se rechaza con un mensaje
   que indica cuántas unidades puede restar como máximo.
3. **Given** una compra que confirma un pedido mientras el administrador ajusta el mismo producto,
   **When** se procesan ambas, **Then** ninguna se pierde y el stock nunca queda negativo.

---

### User Story 5 - Confirmar el pago de un pedido de "Pago en clínica" (Priority: P2)

Cuando el cliente paga en el mostrador, el administrador marca el pedido como pagado.

**Why this priority**: sin este paso el pedido caduca al vencer el plazo de recogida aunque el
cliente haya pagado.

**Independent Test**: crear un pedido con recogida y pago en clínica, confirmarlo como pagado y
comprobar el estado, el correo, el stock y que ya no caduca.

**Acceptance Scenarios**:

1. **Given** un pedido "Pendiente de pago" con pago en clínica y dentro de su plazo de recogida,
   **When** el administrador confirma el pago, **Then** el pedido pasa a "Pagado", el historial
   lo registra como pago en clínica confirmado por la clínica, deja de caducar y el comprador
   recibe el correo de pago confirmado.
2. **Given** el mostrador con el cliente delante, **When** el administrador confirma el pago y la
   entrega en el mismo paso, **Then** el pedido queda "Entregado", con los dos cambios en el
   historial y un único correo al comprador.
3. **Given** un pedido de pago con tarjeta pendiente, **When** el administrador lo busca, **Then**
   no se le ofrece confirmar el pago: solo la pasarela puede marcarlo pagado.
4. **Given** un pedido de pago en clínica ya cancelado o caducado, **When** el administrador
   intenta confirmar el pago, **Then** se rechaza y se le indica que el pedido ya no está vigente.

---

### User Story 6 - Crear y desactivar códigos de descuento (Priority: P3)

El administrador crea códigos de descuento para campañas y los desactiva cuando terminan.

**Why this priority**: es una ayuda comercial; la tienda funciona sin ella.

**Independent Test**: crear un código de porcentaje con importe mínimo, aplicarlo en el carrito,
desactivarlo y comprobar que ya no se acepta.

**Acceptance Scenarios**:

1. **Given** el panel, **When** el administrador crea un código con tipo (porcentaje o importe
   fijo), valor, fechas de vigencia, importe mínimo y límite de usos (estos tres opcionales),
   **Then** el código queda activo y se puede aplicar en el carrito según esas condiciones.
2. **Given** un código que ya existe (sin distinguir mayúsculas), un porcentaje fuera de 1–100, un
   importe no positivo o una fecha de fin anterior a la de inicio, **When** lo guarda, **Then** ve
   el error junto al campo y no se crea.
3. **Given** un código activo, **When** el administrador lo desactiva, **Then** ningún carrito
   nuevo puede aplicarlo, los carritos que lo tenían lo pierden con aviso antes de pagar y los
   pedidos ya confirmados conservan su descuento.
4. **Given** la lista de códigos, **When** la abre, **Then** ve cada código con su tipo, valor,
   condiciones, estado (activo, desactivado, programado, caducado o agotado) y usos consumidos frente al
   límite, y puede reactivar uno desactivado.

---

### Edge Cases

- **Desactivar un producto con pedidos previos**: se permite. Los pedidos conservan su copia de la
  línea (nombre, precio, IVA y cantidad) y su detalle sigue completo. Los pedidos pendientes que lo
  incluyen siguen su curso con las unidades ya reservadas. Un producto nunca se borra, solo se
  desactiva.
- **Stock negativo**: nunca se permite, ni por ajuste manual (US4, escenario 2), ni por compras y
  ajustes simultáneos (US4, escenario 3), ni por un valor negativo en el formulario.
- **Cancelar un pedido ya enviado**: no se permite desde "Enviado" ni desde "Entregado"; el panel
  no ofrece la acción y la rechaza si llega. Se explica que las devoluciones quedan fuera de
  alcance. Un pedido "Listo para recoger" sí puede cancelarse (con reembolso si estaba pagado).
- **Reembolso fallido** al cancelar un pedido pagado: el pedido queda cancelado con el reembolso
  marcado como pendiente, el panel lo muestra y lo reintenta; el comprador recibe el aviso cuando
  el reembolso se completa.
- **Confirmar el pago mientras el pedido caduca**: solo gana una de las dos operaciones; si gana la
  caducidad, se aplica US5, escenario 4.
- **Cambiar la categoría, las mascotas o el nombre de un producto**: los filtros y la búsqueda lo
  reflejan en la siguiente consulta; su dirección pública no cambia al cambiar el nombre.
- **Quitar la foto de un producto**: el catálogo usa la imagen genérica.
- **Producto sin stock publicado**: se permite y el catálogo lo muestra como "Agotado".
- **Desactivar un código aplicado en un pedido pendiente**: el pedido conserva su descuento.
- **Reactivar un código caducado o agotado**: se permite, pero sigue sin poder aplicarse porque
  sus condiciones no cambian; la lista lo muestra como caducado o agotado.
- **Acceso sin rol**: igual que en la feature 007, cualquier pantalla o acción de tienda responde
  como página inexistente a un cliente sin rol y pide iniciar sesión a un visitante.

## Requirements *(mandatory)*

### Functional Requirements

**Acceso y registro**

- **FR-001**: Todas las pantallas y acciones de la tienda en el panel MUST exigir el rol de
  administrador de la feature 007, con las mismas respuestas ante clientes sin rol y visitantes, y
  comprobarlo en cada acción.
- **FR-002**: Cada acción de la tienda MUST quedar en el registro de acciones del panel (quién,
  cuándo, qué elemento y qué cambió), sin datos de tarjeta ni textos libres del comprador.

**Productos**

- **FR-003**: El administrador MUST poder crear y editar productos con los datos de la ficha de la
  feature 004: nombre, descripción breve y completa, ingredientes y modo de uso (opcionales),
  categoría, una o varias mascotas, precio actual con IVA, precio anterior (opcional), tipo de IVA,
  foto con texto alternativo (opcional), marca "Novedad", marca "Oferta" y posición en
  "Destacados". Categorías, mascotas y tipos de IVA se eligen de los existentes.
- **FR-004**: La marca "Oferta" MUST exigir un precio anterior mayor que el actual; el catálogo
  muestra el precio anterior tachado solo mientras la marca esté activa.
- **FR-005**: La dirección pública (slug) MUST generarse del nombre al crear el producto, ser única
  y no cambiar al editarlo.
- **FR-006**: La foto MUST subirse desde el panel en formato JPEG, PNG o WebP de hasta 5 MB; el
  sistema MUST comprobar que es una imagen real, quitar sus metadatos y generar los tamaños que
  usa el catálogo. Con foto, el texto alternativo es obligatorio.
- **FR-007**: Los productos MUST poder desactivarse y reactivarse, nunca borrarse. Un producto
  desactivado no aparece en ninguna parte del catálogo público, su dirección responde como página
  inexistente y no puede añadirse ni comprarse.
- **FR-008**: Los cambios de un producto MUST verse en el catálogo público en la siguiente
  consulta; los pedidos confirmados conservan sus datos copiados.
- **FR-009**: La lista de productos del panel MUST ofrecer paginación, búsqueda por nombre y
  filtros por categoría, mascota y estado, y mostrar el stock disponible y reservado.

**Stock**

- **FR-010**: El stock inicial MUST fijarse al crear el producto; después solo cambia por ventas,
  cancelaciones y ajustes manuales con cantidad y motivo, que quedan en el historial del producto.
- **FR-011**: Ningún ajuste ni compra MUST dejar el stock por debajo de cero ni por debajo de las
  unidades reservadas por pedidos pendientes, también con operaciones simultáneas.

**Pedidos**

- **FR-012**: La lista de pedidos MUST mostrarse del más reciente al más antiguo, paginada, con
  filtro por estado, búsqueda por número y recuento por estado; el detalle muestra todos los datos
  del pedido, su pago, su reembolso y su historial.
- **FR-013**: El administrador MUST poder aplicar las transiciones de la feature 005 permitidas por
  el estado, el método de envío y el método de pago: "Pagado" → "En preparación" → "Enviado"
  (domicilio) o "Listo para recoger" (recogida) → "Entregado", y "Cancelado" desde cualquier estado
  anterior a "Enviado" o a "Entregado". Cualquier otra se rechaza.
- **FR-014**: Cada cambio MUST registrar fecha, origen (clínica) y autor, y rechazarse si el pedido
  ha cambiado desde que el administrador lo abrió.
- **FR-015**: Cancelar un pedido pagado MUST exigir un motivo, reembolsar el importe por la
  pasarela (en modo de pruebas), liberar el stock y el uso del código de descuento, y mostrar el
  estado del reembolso hasta que se complete.
- **FR-016**: En un pedido "Pendiente de pago" con pago en clínica y vigente, el administrador MUST
  poder confirmar el pago, o el pago y la entrega en un solo paso. El stock reservado se descuenta
  definitivamente al confirmar el pago (antes que la regla de la feature 005, que lo descontaba al
  entregar). Nunca puede confirmarse a mano un pago con tarjeta.
- **FR-017**: La herramienta de línea de órdenes de pedidos de la feature 005 MUST seguir
  funcionando con las mismas reglas que el panel.

**Correos al comprador**

- **FR-018**: Cada cambio de estado hecho por la clínica MUST enviar al comprador, por la bandeja
  de salida existente, un correo con número de pedido, estado nuevo, lo que significa para él
  (plazo de entrega, o dirección y horario de recogida) y el enlace al pedido (área de cliente o
  enlace privado del invitado). Cancelar mantiene los avisos de cancelación con o sin reembolso de
  la feature 005. Confirmar pago y entrega en un paso envía un único correo.
- **FR-019**: El comprador MUST ver el estado nuevo y su historial en "Mis pedidos" o en su enlace
  privado en la siguiente consulta.

**Códigos de descuento**

- **FR-020**: El administrador MUST poder crear códigos con las propiedades de la feature 005
  (código único sin distinguir mayúsculas, tipo, valor y condiciones opcionales de vigencia,
  importe mínimo y límite de usos), y desactivarlos o reactivarlos. Tipo, valor y condiciones no
  cambian tras crearlo.
- **FR-021**: La lista de códigos MUST mostrar su estado calculado (activo, programado, caducado,
  agotado o desactivado) y los usos consumidos frente al límite.
- **FR-022**: Desactivar un código MUST impedir aplicarlo en carritos nuevos, retirarlo con aviso
  de los carritos que lo tengan antes de pagar y no afectar a los pedidos ya confirmados.

**Datos, interfaz y adaptabilidad**

- **FR-023**: Tras esta feature, productos, su stock y los códigos de descuento MUST gestionarse en
  el panel. La carga de datos de la clínica los crea si no existen pero no sobrescribe lo cambiado
  en el panel, salvo con una opción explícita de restauración documentada.
- **FR-024**: Las pantallas de la tienda MUST seguir la identidad visual del sistema de diseño
  (solo sus piezas y valores), cumplir WCAG 2.2 AA, funcionar con teclado y sin JavaScript (cada
  acción con envío y redirección), confirmar las acciones irreversibles (cancelar un pedido) en un
  paso propio y mostrar los estados con texto, no solo con color.
- **FR-025**: Toda entrada del panel MUST validarse en el servidor, y los errores mostrarse junto
  a cada campo sin perder lo escrito. La foto es la excepción, porque el navegador no permite
  rellenar de nuevo un campo de archivo: el formulario avisa de que hay que volver a elegirla.

### Key Entities *(include if feature involves data)*

- **Producto** (ya existe, feature 004): se gestiona desde el panel. La marca "Oferta" es la
  presencia del precio anterior, el estado es activo o desactivado y la autoría de cada cambio
  queda en el registro de acciones del panel.
- **Imagen de producto**: archivo subido con sus tamaños para el catálogo y su texto alternativo.
- **Movimiento de stock**: producto, cantidad (positiva o negativa), motivo, origen (venta,
  cancelación o ajuste), autor y fecha.
- **Pedido** (ya existe, feature 005): se usan su estado, historial, pago y reembolso; el historial
  añade el autor de los cambios de la clínica y el motivo de cancelación.
- **Código de descuento** (ya existe, feature 005): se gestiona desde el panel. El estado activo o
  desactivado ya existe, y la autoría y la fecha del alta quedan en el registro de acciones del
  panel.
- **Registro de acciones del panel** (ya existe, feature 007): recoge también las acciones de la
  tienda.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de las pantallas y acciones nuevas rechazan a clientes sin rol y a
  visitantes sin sesión, comprobado por tests automáticos sobre cada una.
- **SC-002**: Un administrador crea y publica un producto completo con foto en menos de 3 minutos,
  y el producto se ve en el catálogo en la siguiente consulta en el 100 % de los casos probados.
- **SC-003**: Un administrador encuentra un pedido de un estado concreto y lo avanza al siguiente
  en menos de 30 segundos desde la lista de pedidos.
- **SC-004**: El comprador recibe el correo de cada cambio de estado en menos de 5 minutos en el
  95 % de los casos, y lo ve en su área o enlace en la siguiente consulta.
- **SC-005**: Ningún ajuste ni compra, también simultáneos, deja el stock negativo ni por debajo
  de lo reservado, y ninguna transición no permitida (incluida cancelar un pedido enviado) se
  aplica.
- **SC-006**: Una clínica nueva da de alta su catálogo y sus códigos desde el panel sin tocar
  código ni archivos de datos.
- **SC-007**: El panel de la tienda no tiene errores de accesibilidad automáticos y se completa con
  teclado y sin JavaScript en todas sus pantallas.
- **SC-008**: El catálogo público mantiene 90 o más en rendimiento móvil con fotos subidas desde el
  panel.

## Assumptions

- **Estados de pedido**: se mantienen los siete de la feature 005. El "preparado" de la
  descripción es "En preparación", y "Listo para recoger" sustituye a "Enviado" en la recogida en
  la clínica.
- **Cancelar tras el envío**: no se permite, porque las devoluciones quedan fuera de alcance.
- **"Oferta"**: es una marca explícita ligada al precio anterior; al desmarcarla se borra el precio
  anterior, así que sin marca no se muestra.
- **Códigos inmutables**: crear y desactivar (y reactivar) cubre la petición; editar condiciones
  de un código ya usado alteraría pedidos y carritos, así que para cambiarlas se crea otro código.
- **Categorías, mascotas del catálogo, tipos de IVA y configuración de la tienda** siguen en los
  datos de la clínica; se mantiene para ellos la excepción temporal al principio VIII.
- **Fotos**: se guardan en el servidor de la clínica con copia de seguridad; las de la demo se
  cargan como hasta ahora. No hay galería de varias fotos por producto.
- **Correos**: se reutilizan la bandeja de salida y sus reintentos; la clínica no recibe copia de
  los correos de cambio de estado.
- **Un único rol**: el rol de administrador de la feature 007 da acceso a la agenda y a la tienda.
- **Fuera de alcance**: devoluciones, facturación, informes y estadísticas de ventas, importación
  y exportación masiva, varias fotos por producto, variantes (tallas, sabores), gestión de
  categorías y mascotas, números de seguimiento del transportista, edición de pedidos
  (líneas o dirección) y avisos de stock bajo.
- **Dependencias**: panel y rol (007), carrito, pedidos, pagos y descuentos (005), catálogo (004),
  área de cliente (002), bandeja de salida (001).
