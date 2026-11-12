# Research: Catálogo de la tienda online

Decisiones **C1–C16** de la feature 004. Siguen vigentes las R1–R17 (001), A1–A14 (002) y B1–B17
(003). Aquí solo se anota lo nuevo o lo que cambia.

## C1. Modelo propio del catálogo, separado de `species`

- **Decision**: tablas nuevas `product_categories`, `product_pets` (las mascotas del catálogo:
  Perro, Gato, Otros animales), `products` y `product_pet_links` (de N a N), más el singleton
  `shop_settings`. Se cargan desde un bloque `shop:` en `content/<clinica>.yaml`.
- **Rationale**: `species` (002) describe las mascotas de los clientes (Perro, Gato, Conejo, Hurón,
  Ave) y no coincide con el catálogo, que agrupa "Otros animales". La spec lo da por supuesto, y
  un enlace entre las dos tablas obligaría a publicar especies que no hacen falta o a perder
  "Otros animales".
- **Alternatives considered**: reutilizar `species` y añadir un grupo (mezcla dos conceptos);
  guardar las mascotas como un `text[]` en `products` (sin integridad referencial ni orden).

## C2. Dinero en céntimos enteros, con IVA incluido

- **Decision**: `price_cents` y `compare_at_cents` (el precio anterior, opcional) son `integer`
  con IVA incluido. `vat_rate` es un `smallint` en tanto por cien, limitado a {0, 4, 10, 21}. La
  oferta se deriva: `compare_at_cents > price_cents`. En cualquier otro caso, el precio anterior se
  ignora (FR-016).
- **Rationale**: sin errores de coma flotante. El IVA del producto quedará guardado para el
  carrito y las facturas, que vienen después, aunque en esta feature solo se muestra el precio
  final.
- **Alternatives considered**: `numeric(10,2)` (llega a JS como string y hay que convertirlo);
  guardar precios sin IVA (cada cálculo tendría que redondear y el precio publicado podría variar
  en un céntimo).

## C3. Formato de euros propio en `src/domain/money.ts`

- **Decision**: `formatEur(cents)` construye `1.234,56 €` a mano: separa los miles con punto
  siempre, usa coma decimal y pone un espacio de no separación antes de `€`. Además,
  `priceLabel()` genera el texto accesible "Antes 12,00 €, ahora 9,90 €".
- **Rationale**: `Intl.NumberFormat('es-ES')` sigue CLDR (`minimumGroupingDigits = 2`) y escribe
  `1234,56 €` sin el punto, lo que incumple el formato que fija la constitución. La función es
  pura y se prueba con tests unitarios.
- **Alternatives considered**: `Intl` con `useGrouping: 'always'` (no está disponible en todas
  las versiones de ICU de Node 22 que usamos en CI y en el VPS).

## C4. Búsqueda sin tildes con una columna normalizada

- **Decision**: la carga calcula `search_name` como
  `name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`. La consulta normaliza el término
  igual, escapa `%`, `_` y `\`, y filtra con `search_name LIKE '%' || $q || '%'`. El término se
  recorta y se limita a 80 caracteres.
- **Rationale**: no hace falta la extensión `unaccent`, que no es *trusted* y exigiría un
  superusuario en el VPS. El volumen (decenas o cientos de productos) no necesita índices de
  texto. La misma función pura se usa en la carga y en la consulta, así que no pueden divergir.
- **Alternatives considered**: `CREATE EXTENSION unaccent` (permisos); búsqueda de texto completo
  (exagerada, y el stemming en español daría coincidencias raras en nombres de producto); filtrar
  en memoria (sin paginar en SQL).

## C5. Estado del listado en la query y validado en `src/domain/`

- **Decision**: `/productos?mascota=perro&mascota=gato&categoria=higiene&q=champu&orden=precio-asc&pagina=2`.
  Una función pura, `parseCatalogQuery(searchParams, { pets, categories })`, devuelve
  `{ pets[], category | null, q, sort, page }`:
  - las mascotas y categorías desconocidas se descartan, y las mascotas repetidas se quedan una
    sola vez;
  - con un `orden` desconocido se aplica `destacados`;
  - una `pagina` que no sea un número se trata como la 1.
  Después, la página se ajusta a `[1, totalPáginas]`. `buildCatalogHref(state, patch)` genera los
  enlaces (paginación, quitar filtros) con el orden de parámetros estable, sin los parámetros que
  tienen su valor por defecto.
- **Rationale**: cumple FR-012 y FR-014, y se prueba sin el servidor. Las URL son canónicas y se
  pueden compartir.
- **Alternatives considered**: segmentos de ruta (`/productos/perro/higiene`), que no admiten la
  selección múltiple de mascotas sin combinatoria; validar con Zod en la página (mezcla la lógica
  con la vista).

## C6. Formulario GET único, que funciona sin JavaScript

- **Decision**: un único `<form method="get" action="/productos#resultados">` contiene el
  buscador, las casillas de mascota, los radios de categoría, el `<select>` de orden y el botón
  "Aplicar". Al cambiar un filtro no se envía nada solo: el visitante pulsa "Aplicar" o Intro.
  - El encabezado de resultados (`<h2 id="resultados" tabindex="-1">`) contiene el total
    ("24 productos"), así que, tras enviar, el foco y el desplazamiento caen en él.
  - La paginación son enlaces normales a `buildCatalogHref`.
- **Rationale**: FR-023 (sin JavaScript) y FR-024 (anuncio del total). Enviar al cambiar un filtro
  es un cambio de contexto inesperado (WCAG 3.2.2) y, con JavaScript, obligaría a añadir un
  script con nonce a una página que puede no tenerlo.
- **Alternatives considered**: enviar el formulario al cambiar con un componente cliente (más
  JavaScript, problemas con el 3.2.2); un formulario por filtro (se pierden los demás valores).

## C7. Pestañas de la ficha como navegación por query

- **Decision**: las pestañas son enlaces `.tabs a` a `?pestana=ingredientes#pestanas`, con
  `aria-current="true"` en la activa. El servidor pinta solo el panel activo. Las pestañas sin
  contenido no se generan, y con una sola pestaña no hay barra (FR-007). Una `pestana` desconocida
  o vacía muestra "Descripción". La URL canónica es la de la ficha, sin query.
- **Rationale**: coincide con el CSS que ya existe (`.tabs a[aria-current]`), funciona sin
  JavaScript y con teclado, y no simula un `tablist` de ARIA sin el comportamiento de flechas que
  ese patrón exige.
- **Alternatives considered**: `role="tablist"` con JavaScript (necesita una versión sin
  JavaScript igualmente); pintar los tres paneles a la vez con anclas (la página es larga y no se
  parece a la maqueta); usar `:target` en CSS (frágil con el foco y el historial).

## C8. Rutas condicionadas a `sections.tienda`

- **Decision**: `/productos` y `/productos/[slug]` responden 404 si `tienda.href` es nulo, como
  `/pide-cita` en la 003. En `content/petcare.yaml`, `tienda.href` pasa a `/productos`. El enlace
  del carrito no existe como sección y sigue en `/proximamente/carrito` (FR-003).
- **Rationale**: una clínica sin tienda la desactiva con un dato y los enlaces vuelven a
  "Próximamente".

## C9. Imágenes: SVG propios en `public/media/<clinica>/productos/`

- **Decision**:
  - Las 24 ilustraciones de la demo son SVG propios, de estilo plano y uniforme, cuadrados (600 ×
    600), sin texto ni marcas, en `public/media/petcare/productos/<slug>.svg`.
  - El YAML las referencia como `image` con su `image_alt` obligatorio (patrón `imageFields`).
  - `checkImages` comprueba que existen.
  - Se pintan con `next/image` (600 × 600, `sizes` según la cuadrícula y `loading="lazy"` salvo
    las 4 primeras del listado).
  - Si no hay imagen, se usa `public/media/comun/placeholder-producto.svg`, con un alt fijo que lo
    indica.
- **Rationale**: es lo que se aclaró en la spec (ilustraciones propias). Los SVG pesan unos pocos
  KB, lo que ayuda a Lighthouse, y siguen el patrón de las fotos del equipo
  (`dangerouslyAllowSVG: false`, servidos tal cual).
- **Alternatives considered**: PNG o WebP generados (más peso y más proceso); emojis de la
  maqueta (prohibidos por el principio II).

## C10. Orden y desempates en SQL

- **Decision**: las cuatro ordenaciones terminan siempre con la misma cola, `featured`, que es
  `in_stock DESC, position ASC, id ASC`:
  - `destacados` = `featured`;
  - `precio-asc` = `price_cents ASC`, `featured`;
  - `precio-desc` = `price_cents DESC`, `featured`;
  - `novedades` = `is_new DESC`, `featured`.
  `in_stock` es `stock > 0`. La paginación es `LIMIT/OFFSET` (con el volumen previsto basta) y el
  total sale de un `count(*)` con el mismo `WHERE`.
- **Rationale**: el orden es total y determinista (el mismo listado en cada recarga, SC-003) y
  cumple la aclaración de la spec.

## C11. "También te puede interesar"

- **Decision**: es una consulta sobre los productos publicados distintos del actual que comparten
  categoría o alguna mascota. El orden es: `in_stock DESC`, primero los de la misma categoría,
  `position ASC`, `id ASC`. Se toman 3 (`LIMIT 3`), y la sección no se pinta si no hay ninguno.
- **Rationale**: cumple FR-018, es determinista y no necesita datos de comportamiento.

## C12. Carga del bloque `shop:` en la misma transacción

- **Decision**: `loadContent` añade, dentro de la transacción que ya existe:
  - `shop_settings`: upsert de la fila única;
  - categorías, mascotas y productos: upsert por `slug`, y `unpublishMissing` en las tres;
  - `product_pet_links`: se borran y se reinsertan los enlaces de los productos del archivo.
  La validación con Zod (`shopSchema` en `src/content/schema.ts`) rechaza:
  - referencias a categorías o mascotas inexistentes o despublicadas;
  - slugs duplicados;
  - `price_cents <= 0` y un `compare_at_cents` no positivo;
  - un `vat_rate` fuera de {0, 4, 10, 21};
  - un `stock` negativo;
  - productos sin `name`, sin `short_description` o sin `description`.
  Cada error señala la ruta del producto (FR-021). En el YAML, los precios se escriben en euros
  como cadena (`"39.90"`) y la carga los convierte a céntimos con un parser estricto (dos
  decimales como máximo).
- **Rationale**: es el mismo patrón que servicios y equipo (R-decisiones de la 001). Despublicar
  en lugar de borrar mantiene la integridad para los pedidos futuros. Escribir el precio en euros
  en el YAML es más legible para quien edita el contenido.
- **Alternatives considered**: céntimos en el YAML (propenso a errores al editar a mano); borrar
  y reinsertar los productos (rompería las referencias de los pedidos futuros).

## C13. Componentes nuevos en `design/styles.css`, solo con tokens

- **Decision**: se añaden:
  - `.pagination`: `nav` con lista de enlaces y `aria-current="page"`;
  - `.shop-notice`: el aviso de tienda de demostración, con colores de tokens y sin depender del
    color para entenderse;
  - `.product__tags`: un contenedor para dos etiquetas a la vez.
  Ya existen y se reutilizan `.visually-hidden` y `.empty-state` (para los resultados vacíos).
  "Agotado" usa `.badge--muted` (003), "Novedad" usa `.chip--amber` y "Oferta" usa `.chip`. Se
  quitan los `style=""` de la maqueta. En el móvil, `.shop-layout` ya pasa a una columna y los
  filtros quedan encima de los resultados, con `position: static`. No se usa `<details>`, porque
  su estado abierto no se puede cambiar por CSS según el tamaño de pantalla y obligaría a elegir
  entre un móvil incómodo y un escritorio con los filtros ocultos.
- **Rationale**: es el principio I. Los valores nuevos se añaden primero como token, si hace
  falta.

## C14. Metadatos, sitemap y SEO

- **Decision**:
  - `/productos` lleva el título "Nuestros productos" y una descripción desde
    `shop_settings.meta_description`. La URL canónica es `/productos` y conserva solo `pagina`
    cuando es mayor que 1 (`/productos?pagina=2`), sin filtros, búsqueda ni orden. Así las
    páginas siguientes se indexan y los productos que solo aparecen en ellas no se pierden. Con
    filtros o búsqueda, la página lleva además `robots: noindex, follow`.
  - La ficha lleva título `<name> · Nuestros productos`, la descripción `short_description` y
    `og:image` con la imagen del producto.
  - `sitemap.ts` pasa a ser `async` y añade `/productos` y las fichas publicadas cuando la tienda
    está activa.
- **Rationale**: es FR-008 y evita contenido duplicado por las combinaciones de filtros.

## C15. Rendimiento

- **Decision**: las páginas siguen siendo `force-dynamic` (por el CSP con nonce).
  - Hay dos consultas por listado (página y total) y dos por ficha (producto con mascotas, y
    relacionados).
  - Las páginas no llevan JavaScript propio.
  - Las imágenes llevan dimensiones fijas, para que el CLS sea 0.
  - `lighthouserc.json` añade `/productos` y una ficha, con un umbral de 0,9.
- **Rationale**: es SC-005. El volumen es pequeño y no compensa añadir una caché.

## C16. Tests

- **Decision**:
  - Unitarios: `money`, `normalizeSearch`, `parseCatalogQuery`, `buildCatalogHref`, la
    derivación de oferta y disponibilidad, y `shopSchema`.
  - Integración, contra PostgreSQL: la carga de `shop:` (validaciones, unpublish e idempotencia),
    el listado (filtros O/Y, búsqueda sin tildes, las 4 ordenaciones con desempates, total y
    paginación), los relacionados, y que los productos no publicados no aparezcan nunca.
  - E2E: `us1`–`us6`, en los proyectos móvil, escritorio y sin JavaScript; las rutas nuevas
    entran en `a11y-all-routes` y en el control de desbordamiento a 320 px; el 404 de un slug
    inexistente, y la sección apagada que lleva a "Próximamente".
  - Lighthouse en las dos URL nuevas.
- **Rationale**: es el principio III y la definición de terminado de CLAUDE.md. El catálogo no es
  un flujo de pago, pero alimentará el carrito.
