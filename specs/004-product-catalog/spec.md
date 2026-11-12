# Feature Specification: Catálogo de la tienda online

**Feature Branch**: `004-product-catalog`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Catálogo de la tienda online de la clínica. Un visitante explora y encuentra productos para su mascota. No incluye compra. Referencia visual: design/productos.html, producto.html. Categorías: alimentación, higiene, juguetes, accesorios, salud y bienestar. Mascotas: perro, gato, otros animales. User stories: P1 listado con foto, categoría y mascota, nombre y precio con IVA incluido, y número total de productos. P1 ficha: descripción, mascota recomendada, disponibilidad ("En stock · Envío en 24-48 h") y pestañas de descripción, ingredientes y modo de uso. P2 filtro por mascota (varias a la vez) y por categoría (una), y ordenación (por defecto "Destacados"; otros criterios [TBD]). P2 búsqueda por nombre, indicando cuando no hay resultados. P2 etiquetas "Novedad" y "Oferta", con el precio anterior tachado en oferta. P3 "También te puede interesar" en la ficha. Casos límite: producto sin stock (se ve, se indica y no es comprable), categoría vacía, producto sin foto, producto sin ingredientes o modo de uso (la pestaña no se muestra). Fuera de alcance: carrito, botones "Añadir" y "Comprar ahora" (llegan con la feature de carrito), pago, reseñas, productos con receta."

## Contexto

Las features 001 (web pública), 002 (cuentas y mascotas) y 003 (reserva de citas) ya están
implementadas. Hoy "Nuestros productos" lleva a "Próximamente". Esta feature lo convierte en un
catálogo real y navegable, con datos persistentes: listado, ficha, filtros, búsqueda, ordenación y
recomendaciones. La compra (carrito, checkout y pago) llegará en una feature posterior.

Como en las features anteriores, el catálogo es un dato de la clínica: productos, categorías,
mascotas, precios, stock, etiquetas y el texto del plazo de envío son configurables y se cargan
como datos. Mientras no exista el panel de administración, se aplica la misma excepción temporal
al principio VIII que en las features anteriores. Los productos, textos, precios e imágenes de la
maqueta (`design/productos.html` y `design/producto.html`) no se publican.

## Clarifications

### Session 2026-11-11

- Q: ¿Qué criterios de ordenación se ofrecen además de "Destacados"? → A: Precio de menor a
  mayor, precio de mayor a menor y novedades primero.
- Q: ¿Debe el catálogo avisar de forma visible de que es una tienda de demostración y de que
  los productos no se venden? → A: Sí. Aviso breve y configurable en el listado y la ficha, que la
  clínica puede desactivar. Se mantiene el plazo de envío.
- Q: ¿De dónde salen las fotos de los productos de la demo? → A: Ilustraciones propias generadas
  para la demo, con estilo uniforme y sin marcas, guardadas en el repositorio.
- Q: ¿Cuántos productos tendrá el catálogo de la demo? → A: Unos 24, con todas las categorías y
  mascotas cubiertas e incluyendo ofertas, novedades y agotados.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver el listado de productos (Priority: P1)

Un visitante entra en "Nuestros productos" y ve todos los productos publicados en una cuadrícula.
Cada tarjeta muestra la foto, la categoría y la mascota ("Alimentación · Perro"), el nombre y el
precio con IVA incluido. Sobre la cuadrícula ve el número total de productos que se muestran.

**Why this priority**: es la puerta de entrada a la tienda y sustituye la página "Próximamente";
sin listado no hay catálogo.

**Independent Test**: con un catálogo cargado, abrir "Nuestros productos" y comprobar que aparecen
todos los productos publicados con sus datos y que el total coincide con el número de tarjetas.

**Acceptance Scenarios**:

1. **Given** un catálogo con productos publicados, **When** el visitante abre "Nuestros
   productos", **Then** ve una tarjeta por producto con foto, "Categoría · Mascota", nombre y
   precio en euros con formato español (`1.234,56 €`) e IVA incluido.
2. **Given** el listado, **When** el visitante lo mira, **Then** ve el total de productos (por
   ejemplo, "6 productos"; "1 producto" en singular).
3. **Given** una tarjeta, **When** el visitante la activa con ratón o teclado, **Then** se abre la
   ficha de ese producto.
4. **Given** el menú principal, **When** el visitante pulsa "Nuestros productos", **Then** llega
   al listado y no a "Próximamente".
5. **Given** un catálogo sin ningún producto publicado, **When** el visitante abre el listado,
   **Then** ve un mensaje que lo indica y un enlace para volver al inicio o contactar con la
   clínica.

---

### User Story 2 - Ver la ficha de un producto (Priority: P1)

Desde el listado, el visitante abre la ficha de un producto. Ve las migas de pan, la foto, la
categoría y la mascota, el nombre, una descripción breve, el precio con IVA incluido, la mascota
recomendada y la disponibilidad ("En stock · Envío en 24-48 h" o "Agotado"). Debajo hay pestañas
con la descripción completa, los ingredientes y el modo de uso.

**Why this priority**: es donde el visitante decide si el producto le interesa. Junto con el
listado forma el producto mínimo del catálogo.

**Independent Test**: abrir la ficha de un producto con todos sus datos y comprobar cada elemento
y cada pestaña. Después, abrir la de un producto sin ingredientes y comprobar que esa pestaña no
aparece.

**Acceptance Scenarios**:

1. **Given** un producto publicado y en stock, **When** el visitante abre su ficha, **Then** ve
   foto, "Categoría · Mascota", nombre, descripción breve, precio con IVA incluido, mascota
   recomendada y "En stock · Envío en <plazo configurado>".
2. **Given** la ficha, **When** el visitante elige la pestaña "Ingredientes" o "Modo de uso",
   **Then** ve ese contenido. Las pestañas se manejan con teclado, y sin JavaScript todo el
   contenido sigue siendo accesible.
3. **Given** un producto sin ingredientes o sin modo de uso, **When** el visitante abre su ficha,
   **Then** la pestaña correspondiente no aparece. Si solo queda la descripción, se muestra sin
   pestañas.
4. **Given** un producto agotado, **When** el visitante abre su ficha, **Then** ve "Agotado" en
   lugar de "En stock" y ninguna acción de compra.
5. **Given** una dirección de producto que no existe o que no está publicado, **When** el
   visitante la abre, **Then** ve la página de "no encontrado" con un enlace al catálogo.
6. **Given** la ficha, **When** el visitante usa las migas de pan, **Then** vuelve al listado.

---

### User Story 3 - Filtrar y ordenar el listado (Priority: P2)

El visitante acota el listado por mascota (puede marcar varias: perro, gato, otros animales) y por
categoría (una sola, o "Todas"), y elige el orden. Por defecto, el orden es "Destacados", que fija
la clínica. El total se actualiza con cada cambio.

**Why this priority**: con un catálogo de cierto tamaño, encontrar productos para tu mascota sin
filtros es lento. Pero el listado completo ya aporta valor sin ellos.

**Independent Test**: marcar "Gato", elegir "Higiene" y un orden, y comprobar que solo aparecen
productos de higiene para gatos, en ese orden y con el total correcto. Repetirlo sin JavaScript.

**Acceptance Scenarios**:

1. **Given** el listado, **When** el visitante marca una o varias mascotas, **Then** solo ve los
   productos recomendados para al menos una de ellas. Sin ninguna marcada, ve los de todas.
2. **Given** el listado, **When** el visitante elige una categoría, **Then** solo ve los productos
   de esa categoría. Con "Todas", ve los de todas.
3. **Given** filtros de mascota y de categoría a la vez, **When** se aplican, **Then** el
   resultado cumple ambos y el total refleja ese resultado.
4. **Given** el listado, **When** el visitante elige un criterio de ordenación, **Then** los
   productos aparecen en ese orden. Sin elegir ninguno, aparecen en orden "Destacados".
   Los criterios disponibles son "Destacados", "Precio: de menor a mayor", "Precio: de mayor a
   menor" y "Novedades primero".
5. **Given** una combinación de filtros, **When** el visitante copia la dirección de la página y
   la abre en otro navegador, **Then** ve el mismo resultado.
6. **Given** una categoría o una combinación sin productos, **When** se aplica, **Then** el
   visitante ve "No hay productos que coincidan" y una forma de quitar los filtros.

---

### User Story 4 - Buscar por nombre (Priority: P2)

El visitante escribe parte del nombre de un producto en el buscador y ve los productos cuyo nombre
coincide. La búsqueda se combina con los filtros y la ordenación activos.

**Why this priority**: es el camino más corto cuando el visitante ya sabe lo que busca.

**Independent Test**: buscar un término que esté en el nombre de dos productos y comprobar que
aparecen esos dos. Buscar un término sin coincidencias y comprobar el mensaje.

**Acceptance Scenarios**:

1. **Given** el listado, **When** el visitante busca un término, **Then** ve los productos cuyo
   nombre lo contiene, sin distinguir mayúsculas, minúsculas ni tildes ("champu" encuentra
   "Champú").
2. **Given** una búsqueda sin coincidencias, **When** se ejecuta, **Then** el visitante ve "No
   hemos encontrado productos para «<término>»" y un enlace para ver todo el catálogo.
3. **Given** una búsqueda activa, **When** el visitante filtra u ordena, **Then** la búsqueda se
   mantiene y se combina con los filtros.
4. **Given** una búsqueda vacía o solo con espacios, **When** se envía, **Then** se muestra el
   listado sin filtrar por nombre.

---

### User Story 5 - Etiquetas "Novedad" y "Oferta" (Priority: P2)

Algunas tarjetas y fichas llevan la etiqueta "Novedad" u "Oferta". Un producto en oferta muestra
el precio anterior tachado junto al precio actual.

**Why this priority**: destaca lo que la clínica quiere promocionar, pero el catálogo funciona sin
etiquetas.

**Independent Test**: marcar un producto como novedad y otro con precio anterior, y comprobar las
etiquetas y el precio tachado en el listado y en la ficha.

**Acceptance Scenarios**:

1. **Given** un producto marcado como novedad, **When** aparece en el listado o en su ficha,
   **Then** lleva la etiqueta "Novedad".
2. **Given** un producto con un precio anterior mayor que el actual, **When** aparece, **Then**
   lleva la etiqueta "Oferta" y muestra el precio anterior tachado antes del actual. Un lector de
   pantalla anuncia ambos precios con su significado ("Antes 12,00 €, ahora 9,90 €").
3. **Given** un producto con un precio anterior igual o menor que el actual, **When** aparece,
   **Then** no se muestra como oferta ni se tacha ningún precio.
4. **Given** un producto que es novedad y está en oferta, **When** aparece, **Then** muestra las
   dos etiquetas.

---

### User Story 6 - "También te puede interesar" (Priority: P3)

Al final de la ficha, el visitante ve una pequeña selección de otros productos relacionados.

**Why this priority**: ayuda a descubrir más productos, pero no es imprescindible para encontrar
el que se busca.

**Independent Test**: abrir la ficha de un producto con otros de la misma mascota o categoría y
comprobar que aparecen hasta 3 productos relacionados, sin repetir el actual.

**Acceptance Scenarios**:

1. **Given** una ficha, **When** existen otros productos publicados de la misma categoría o
   mascota, **Then** se muestran hasta 3, sin incluir el producto actual y priorizando los que
   están en stock.
2. **Given** una ficha sin productos relacionados, **When** se abre, **Then** la sección "También
   te puede interesar" no aparece.

---

### Edge Cases

- **Producto agotado**: aparece en el listado y en la ficha, con la indicación "Agotado", y no
  ofrece ninguna acción de compra. Por defecto, en "Destacados", va detrás de los que están en
  stock.
- **Categoría vacía**: sigue disponible como filtro. Al elegirla se muestra el mensaje de "No hay
  productos que coincidan".
- **Producto sin foto**: se muestra una imagen genérica neutra del sistema de diseño, con un texto
  alternativo que lo indica. La cuadrícula no se descuadra.
- **Producto sin ingredientes o sin modo de uso**: la pestaña no aparece (ver US2).
- **Producto no publicado** (borrador o retirado): no aparece en el listado, en la búsqueda ni en
  las recomendaciones, y su dirección da "no encontrado".
- **Parámetros de filtro, orden o búsqueda inválidos o manipulados** (mascota o categoría
  inexistente, orden desconocido, término muy largo): se ignoran o se acotan, sin provocar un
  error. El visitante ve un resultado coherente.
- **Precio anterior sin precio actual válido o precio no positivo**: el producto no se publica. La
  carga de datos lo rechaza con un error claro.
- **Muchos productos**: el listado se pagina y el total refleja todos los productos que cumplen
  los filtros, no solo los de la página.
- **Nombres largos**: se ajustan en varias líneas sin romper la tarjeta.

## Requirements *(mandatory)*

### Functional Requirements

**Listado**

- **FR-001**: El sistema MUST mostrar en "Nuestros productos" todos los productos publicados, cada
  uno con foto (o imagen genérica), categoría, mascota o mascotas recomendadas, nombre y precio en
  EUR con formato español e IVA incluido.
- **FR-002**: El sistema MUST mostrar el número total de productos que cumplen los filtros y la
  búsqueda activos, con concordancia de número ("1 producto", "N productos").
- **FR-003**: El enlace "Nuestros productos" de la cabecera, del pie y de cualquier contenido que
  hoy lleve a "Próximamente" MUST llevar al listado. El enlace del carrito sigue llevando a
  "Próximamente".
- **FR-004**: El listado MUST paginarse a partir de 12 productos por página, con navegación entre
  páginas que conserve los filtros, la búsqueda y la ordenación.

**Ficha**

- **FR-005**: Cada producto publicado MUST tener una ficha propia en una dirección estable y
  legible, con migas de pan, foto, categoría, mascota recomendada, nombre, descripción breve,
  precio con IVA incluido y disponibilidad.
- **FR-006**: La disponibilidad MUST derivarse del stock del producto: si hay stock, se muestra
  "En stock · Envío en <plazo>", con el plazo de envío configurable por la clínica. Si no lo hay,
  se muestra "Agotado".
- **FR-007**: La ficha MUST ofrecer pestañas "Descripción", "Ingredientes" y "Modo de uso". Solo
  se muestran las que tienen contenido.
- **FR-008**: La ficha MUST tener un título de página y una descripción para buscadores y redes
  propios del producto.

**Filtros, búsqueda y orden**

- **FR-009**: El visitante MUST poder filtrar por mascota (selección múltiple entre las mascotas
  configuradas) y por categoría (selección única entre las configuradas, más "Todas"). Las
  mascotas de un producto se combinan con O y la categoría con Y.
- **FR-010**: El visitante MUST poder buscar por nombre de producto, sin distinguir mayúsculas,
  minúsculas ni tildes. La búsqueda se combina con los filtros.
- **FR-011**: El visitante MUST poder ordenar el listado. El orden por defecto es "Destacados",
  que sigue el orden fijado por la clínica con los productos agotados al final. Los demás
  criterios son, en este orden: "Precio: de menor a mayor", "Precio: de mayor a menor" y
  "Novedades primero" (las novedades delante y, dentro de cada grupo, el orden destacado). En
  todos los criterios, los empates se resuelven con el orden destacado.
- **FR-012**: El estado del listado (filtros, búsqueda, orden y página) MUST reflejarse en la
  dirección de la página, de modo que se pueda compartir, recargar y usar con los botones de
  atrás y adelante.
- **FR-013**: Cuando el resultado esté vacío, el sistema MUST indicarlo con un mensaje que incluya
  el término buscado (si lo hay) y una forma de quitar los filtros.
- **FR-014**: Los parámetros del listado MUST validarse en el servidor. Los valores desconocidos
  se ignoran y el término de búsqueda se limita a una longitud máxima razonable.

**Etiquetas y precios**

- **FR-015**: Un producto MUST poder marcarse como "Novedad". La etiqueta se muestra en la tarjeta
  y en la ficha.
- **FR-016**: Un producto con un precio anterior mayor que el actual MUST mostrarse como "Oferta",
  con el precio anterior tachado y anunciado de forma accesible. En cualquier otro caso, el precio
  anterior se ignora.
- **FR-017**: Todos los precios mostrados MUST ser precios finales con IVA incluido. El tipo de
  IVA de cada producto se guarda con el producto.

**Recomendaciones**

- **FR-018**: La ficha MUST mostrar "También te puede interesar" con hasta 3 productos publicados
  distintos del actual, que compartan categoría o mascota, priorizando los que estén en stock. Si
  no hay ninguno, la sección no se muestra.

**Fuera de alcance visible**

- **FR-019**: Ni el listado ni la ficha MUST mostrar botones o controles de compra ("Añadir",
  "Añadir al carrito", "Comprar ahora", selector de cantidad) hasta que exista la feature de
  carrito. No se muestran controles sin acción (principio VIII).
- **FR-019b**: Mientras esté activado en la configuración de la clínica (activado en la demo), el
  listado y la ficha MUST mostrar un aviso breve y visible del tipo "Tienda de demostración: estos
  productos no están a la venta". El texto es configurable y, con el aviso desactivado, no se
  muestra nada en su lugar (principio II).

**Datos y adaptabilidad**

- **FR-020**: Productos, categorías, mascotas, precios, tipos de IVA, stock, etiquetas, orden
  destacado, imágenes, textos y plazo de envío MUST ser datos de la clínica que se cargan con el
  procedimiento de carga de contenido existente. Las páginas leen solo de los datos persistidos.
- **FR-021**: La carga de datos MUST validar el catálogo y rechazar, con un error que identifique
  el producto, lo siguiente: referencias a categorías o mascotas inexistentes, precios no
  positivos, direcciones duplicadas y productos sin nombre o sin descripción.
- **FR-022**: Cada imagen de producto MUST tener un texto alternativo. Las imágenes de la maqueta
  (emojis y similares) no se usan como fotos de producto. En la demo, las imágenes son
  ilustraciones propias con un estilo uniforme, sin marcas ni logotipos de terceros, guardadas en
  el repositorio junto al contenido de la clínica. Otra clínica sustituye sus imágenes sin tocar
  el código.

**Transversales**

- **FR-023**: Listado, filtros, búsqueda, ordenación, paginación, ficha y pestañas MUST funcionar
  sin JavaScript.
- **FR-024**: Las pantallas MUST cumplir WCAG 2.2 AA: uso completo con teclado, foco visible,
  etiquetas en los filtros y el buscador, anuncio del total de resultados tras filtrar y
  etiquetas de oferta y novedad que no dependan solo del color.
- **FR-025**: Las pantallas MUST usar solo los componentes y tokens del sistema de diseño
  (`product-grid`, `product`, `shop-layout`, `shop-filters`, `shop-toolbar`, `search`, `detail`,
  `tabs`, `chip`, `badge`, `price`, `breadcrumb`). Si falta un componente (paginación, imagen
  genérica), se añade al sistema de diseño usando solo tokens.

### Key Entities *(include if feature involves data)*

- **Producto**: lo que la clínica muestra en su tienda. Tiene nombre, dirección legible (slug),
  descripción breve, descripción completa, ingredientes (opcional), modo de uso (opcional),
  categoría, una o varias mascotas recomendadas, precio actual con IVA incluido, precio anterior
  (opcional), tipo de IVA, stock disponible, marca de novedad, posición en "Destacados", estado de
  publicación e imagen con texto alternativo (opcional).
- **Categoría de producto**: agrupación del catálogo (en la demo: Alimentación, Higiene, Juguetes,
  Accesorios, Salud y bienestar). Tiene nombre, dirección legible y orden de presentación.
- **Mascota (tipo de animal del catálogo)**: destinatario del producto (en la demo: Perro, Gato,
  Otros animales). Tiene nombre, dirección legible y orden. Un producto se relaciona con una o
  varias.
- **Configuración de la tienda**: datos de la clínica que afectan al catálogo, como el plazo de
  envío que se muestra ("24-48 h"), el número de productos por página y el aviso de tienda de
  demostración (activado o no, y su texto).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un visitante encuentra un producto concreto para su mascota (con filtro o búsqueda)
  y abre su ficha en menos de 30 segundos y con un máximo de 3 acciones desde la portada.
- **SC-002**: El 100 % de los productos publicados son accesibles desde el listado, y ningún
  producto no publicado aparece en el listado, en la búsqueda, en las recomendaciones ni en una
  dirección directa.
- **SC-003**: El total mostrado coincide con el número de productos que cumplen los filtros en el
  100 % de las combinaciones probadas de mascota, categoría, búsqueda y orden.
- **SC-004**: Todos los recorridos (listado, filtros, búsqueda, orden, paginación, ficha y
  pestañas) se completan sin JavaScript y solo con teclado, sin incumplimientos de accesibilidad
  en la comprobación automática.
- **SC-005**: El listado y la ficha obtienen 90 o más en rendimiento móvil en la auditoría de
  Lighthouse.
- **SC-006**: Poner en marcha el catálogo de otra clínica solo requiere editar sus datos de
  contenido y volver a cargarlos, sin tocar el código.
- **SC-007**: En la página de un producto agotado, sin ingredientes o sin foto, el visitante
  identifica su estado y no encuentra pestañas vacías ni elementos descuadrados.

## Assumptions

- **Sin compra**: no hay carrito, cantidades ni botones de compra. El enlace "Carrito" de la
  cabecera sigue en "Próximamente" hasta su feature. La advertencia de las páginas legales ("no
  vende productos") sigue siendo cierta y no se modifica.
- **Sin panel de administración**: se mantiene la excepción temporal al principio VIII. El catálogo
  se carga desde el archivo de contenido de la clínica con el procedimiento existente.
- **Productos de la demo**: unos 24, genéricos y ficticios, sin marcas comerciales reales y con
  precios verosímiles. Llenan 2 páginas del listado completo, cubren cada categoría y cada mascota
  e incluyen al menos 2 ofertas, 2 novedades, 2 agotados, 1 producto sin ingredientes ni modo de
  uso y 1 sin imagen. Las imágenes son ilustraciones propias generadas para la demo (FR-022). Si no hay
  imagen, se usa la imagen genérica.
- **Mascotas del catálogo**: es una lista propia de la tienda (Perro, Gato, Otros animales),
  independiente de las especies de las fichas de mascota de la feature 002.
- **"Destacados"**: es un orden manual que fija la clínica (posición), con los agotados al final.
- **"Novedad"**: es una marca que activa la clínica, sin caducidad automática.
- **Stock**: se guarda como cantidad, y la ficha solo distingue "En stock" y "Agotado"; no se
  muestra "Últimas unidades". El stock real lo gestionarán el carrito y los pedidos.
- **Búsqueda**: solo por nombre, como pide la descripción. No busca en descripciones ni
  ingredientes.
- **Productos con receta y reseñas**: quedan fuera de alcance y no se modelan.
- **Paginación**: 12 productos por página, configurable.
- **Textos que lo anuncian**: los contenidos que hoy dicen "Pronto podrás verla" (por ejemplo, la
  pregunta frecuente sobre productos) se actualizan en el archivo de contenido para enlazar al
  catálogo.
