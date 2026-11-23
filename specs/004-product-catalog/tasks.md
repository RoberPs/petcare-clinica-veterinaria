# Tasks: Catálogo de la tienda online

**Input**: documentos de diseño de `specs/004-product-catalog/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/) y [quickstart.md](./quickstart.md).

**Tests**: **se incluyen**. La constitución (principio III) y la definición de terminado de
CLAUDE.md los exigen, y el plan los detalla en C16. Los de cada historia se escriben antes de
implementarla y deben fallar.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado sobre la fase 2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: la historia a la que pertenece (US1–US6).

## Convenciones del proyecto

- Son las mismas de la 001 a la 003:
  - un solo proyecto Next.js;
  - estilos solo en `design/` y con tokens;
  - textos en español e identificadores en inglés;
  - ningún dato de la clínica en `src/`.
- **Capas**:
  - `src/domain/` es puro (sin Next, React, Drizzle ni `pg`);
  - las lecturas van en `src/db/queries/catalog.ts`;
  - las vistas van en `src/app/productos/**` y `src/components/`.
  No hay escrituras ni Server Actions.
- **Visibilidad**: toda lectura de productos pasa por `publishedProducts()` (data-model.md). Nunca
  se filtra `published` a mano en otra consulta.
- **Decisiones**: las referencias C1–C16 son de [research.md](./research.md). Las rutas, los
  parámetros y el HTML esperado están en [contracts/routes.md](./contracts/routes.md), y el bloque
  YAML en [contracts/content-file.md](./contracts/content-file.md).
- **Tests de integración**: usan `setupTestDb` y `truncateAll` de `tests/integration/helpers/db.ts`.
  Los e2e usan `loadPetcare` de `tests/e2e/db.ts` y corren en los proyectos `mobile-360`,
  `desktop` y `no-js`.

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Comprobar el entorno: `docker compose up -d`, `npm run db:migrate` hasta `0002_appointments` en desarrollo (5434) y en pruebas (5433), y que `npm run lint`, `npm test` y `npm run test:integration` pasan en verde antes de empezar (registrar cualquier fallo previo en `specs/004-product-catalog/checklists/requirements.md`)
- [X] T002 Crear las carpetas `public/media/petcare/productos/` y `tests/integration/helpers/` (si falta), y un `.gitkeep` en la primera mientras no haya ilustraciones

---

## Phase 2: Foundational (requisitos que bloquean todo)

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

### Esquema y migración

- [X] T003 Añadir a `src/db/schema.ts` las tablas `productCategories`, `productPets`, `products`, `productPetLinks` y `shopSettings`, con las columnas, checks (`products_price_positive`, `products_compare_at_positive`, `products_vat_rate`, `products_stock_non_negative`, `products_image_alt`, `shop_settings_singleton`, `shop_settings_demo_notice`, `page_size` entre 4 y 48), FK e índices de data-model.md, siguiendo el patrón de `services` y `teamMembers` (helpers `id()`, `position()`, `published()` y `...timestamps`)
- [X] T004 Generar `drizzle/0003_product_catalog.sql` con `npm run db:generate` y revisarla: nombres de los checks e índices, `ON DELETE RESTRICT/CASCADE` correctos y ninguna extensión. Aplicarla en desarrollo y en pruebas

### Dominio puro (tests primero)

- [X] T005 [P] Escribir `tests/unit/money.test.ts`:
  - `formatEur`: 0 → `0,00 €`; 990 → `9,90 €`; 123456 → `1.234,56 €`; 12345678 → `123.456,78 €`; espacio de no separación antes de `€`;
  - `parseEuros`: `"39.90"` → 3990; `"5"` → 500; rechaza `"1.234"`, `"-1"`, `"0"` y `"1.999"`;
  - `priceLabel`: "Antes 12,00 €, ahora 9,90 €".
- [X] T006 [P] Escribir `tests/unit/search.test.ts`:
  - `normalizeSearch`: "Champú" → "champu", "Año ÑU" → "ano nu" (NFD + `\p{M}` convierte la ñ en n; se acepta porque el nombre y el término se normalizan igual), espacios recortados y colapsados;
  - `escapeLike`: escapa `%`, `_` y `\`.
- [X] T007 [P] Escribir `tests/unit/catalog-query.test.ts` para `parseCatalogQuery` y `buildCatalogHref`:
  - mascotas repetidas o desconocidas;
  - categoría desconocida;
  - `orden` desconocido → `destacados`;
  - `pagina` no numérica o menor que 1 → 1;
  - `q` con 200 caracteres → 80, y `q` solo con espacios → vacío;
  - orden estable de los parámetros, sin los que tienen su valor por defecto;
  - `patch` de la página que conserva los filtros.
  Y para `onSale`, `availability` y `productTabs` (C2, C7): oferta solo si `compareAt > price`; "Agotado" con stock 0; las pestañas omiten `ingredients` y `usage` vacíos o nulos.
- [X] T008 [P] Implementar `src/domain/money.ts` (`formatEur`, `parseEuros`, `priceLabel`) según C3 hasta que T005 pase
- [X] T009 [P] Implementar `src/domain/search.ts` (`normalizeSearch`, `escapeLike`) según C4 hasta que T006 pase
- [X] T010 Implementar `src/domain/catalog.ts` (`SORTS` con las etiquetas de la UI, `parseCatalogQuery`, `clampPage`, `buildCatalogHref`, `onSale`, `availability`, `productTabs`) según C5, C7 y contracts/routes.md, hasta que T007 pase (depende de T009)

### Contenido

- [X] T011 [P] Escribir `tests/unit/content-shop.test.ts` para `shopSchema`. Debe aceptar:
  - el ejemplo de contracts/content-file.md.
  Debe rechazar, con la ruta `shop.products[i].<campo>` en el error:
  - una categoría o una mascota inexistente;
  - `pets` vacío o repetido;
  - slugs duplicados;
  - `price` igual a `"0"` o a `"1.999"`;
  - `vat_rate` igual a 7;
  - `stock` igual a -1;
  - `image` sin `image_alt`;
  - `demo_notice.enabled` sin texto.
  Y debe fallar si `sections.tienda.href` no es nulo sin bloque `shop:`.
- [X] T012 Añadir `shopSchema` a `src/content/schema.ts` y conectarlo a `contentObject` y al `superRefine` (contracts/content-file.md), reutilizando los helpers `text`, `slug` e `imageFields`, hasta que T011 pase
- [X] T013 Ampliar `src/content/load.ts` para el bloque `shop:` dentro de la transacción que ya existe (C12):
  - upsert de `shop_settings`;
  - upsert por `slug` con `position` igual al índice, y `unpublishMissing` en categorías, mascotas y productos;
  - `search_name` calculado con `normalizeSearch`;
  - reemplazo de `product_pet_links` de los productos del archivo;
  - aviso en el resumen si `compare_at_price <= price`;
  - nuevos contadores en `LoadSummary`;
  - imágenes de producto añadidas a `checkImages`.
- [X] T014 Escribir `tests/integration/content-shop.test.ts`:
  - la carga inicial crea las filas esperadas;
  - recargar es idempotente (mismos `id`);
  - quitar un producto del YAML lo despublica y volver a ponerlo lo republica con el mismo `id`;
  - cambiar las mascotas de un producto reemplaza sus enlaces;
  - una imagen inexistente hace fallar la carga sin escribir nada (rollback).
- [X] T015 [P] Crear `public/media/comun/placeholder-producto.svg` (600 × 600, neutro, sin texto) y las 24 ilustraciones propias `public/media/petcare/productos/<slug>.svg` (C9): estilo plano uniforme, cuadradas de 600 × 600, sin texto, marcas ni logotipos, de pocos KB cada una. Una de las 24 no tendrá imagen en el YAML, así que son 23 archivos.
- [X] T016 Añadir el bloque `shop:` a `content/petcare.yaml`, con `tienda.href` aún a `null`:
  - `settings`: `shipping_text: 24-48 h`, `page_size: 12`, el aviso de demostración activado con el texto de FR-019b y la meta descripción;
  - las 5 categorías y las 3 mascotas;
  - 24 productos genéricos sin marcas, que cubran cada categoría y cada mascota e incluyan al menos 2 ofertas, 2 novedades (una de ellas también en oferta), 2 agotados, 1 sin ingredientes ni modo de uso, 1 sin imagen, 1 para varias mascotas, 2 con el mismo precio (para probar el desempate) y 1 con "champú" en el nombre;
  - textos propios, no copiados de `design/`.
  Verificar con `npm run content:load -- --file content/petcare.yaml`.

### Lecturas y piezas compartidas

- [X] T017 Crear `src/db/queries/catalog.ts` con:
  - `publishedProducts()`: la condición de visibilidad de data-model.md (producto, categoría y al menos una mascota publicados);
  - `getShopSettings()`;
  - `getCatalogFilters()`: las categorías y mascotas publicadas, en orden;
  - el tipo `ProductSummary`: id, slug, nombre, categoría, mascotas, precios, stock, `is_new` e imagen.
- [X] T018 [P] Crear `tests/integration/helpers/catalog.ts` con `seedCatalog(mutate?)`, que carga `content/petcare.yaml` con el bloque `shop:` modificado (mismo patrón que `seedBookingConfig` en `tests/integration/helpers/booking.ts`)
- [X] T019 [P] Añadir a `design/styles.css`, solo con tokens (añadir antes a `design/tokens.css` cualquier valor nuevo):
  - `.shop-notice` (C13);
  - `.product__tags`: contenedor de etiquetas en `.product__img` y en `.detail__info`;
  - `.pagination`: lista horizontal de enlaces, `aria-current="page"` destacado, foco visible y ajuste de línea a 320 px;
  - `.shop-filters` con `position: static` en la vista de una columna.
  Pasar `npm run check:design`.
- [X] T020 [P] Crear `src/components/ShopNotice.tsx` (pinta `.shop-notice` solo si el aviso está activado) y `src/components/Price.tsx` (precio actual con `formatEur`, clase `.price`; la parte de oferta llega en US5)
- [X] T021 Crear `src/components/ProductCard.tsx`: un enlace `.product` a `/productos/<slug>` con `next/image` (600 × 600, `sizes` de la cuadrícula, `loading="lazy"` salvo con la prop `priority`), con el placeholder y su alt si no hay imagen, `.product__meta` "Categoría · Mascota, Mascota", `h3` con el nombre, `Price` y `.badge--muted` "Agotado" si no hay stock. Sin botones (FR-019). Depende de T017 y T020.

**Checkpoint**: migración aplicada, `shop:` cargado y dominio probado. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Ver el listado de productos (Priority: P1) 🎯 MVP

**Goal**: "Nuestros productos" muestra todos los productos publicados en orden "Destacados", con el total y la paginación.

**Independent Test**: con el catálogo de la demo, abrir `/productos` desde la cabecera y comprobar las 12 tarjetas con sus datos, "24 productos", la página 2 y el aviso de demostración. Con la sección apagada, el 404.

### Tests de US1 (antes de implementar; deben fallar)

- [X] T022 [P] [US1] Escribir `tests/integration/catalog-queries.test.ts`, bloque "listado":
  - `listProducts` sin filtros devuelve solo los visibles, en orden `featured` (los que están en stock por `position` y luego los agotados);
  - `countProducts` da el total;
  - `page_size` y el desplazamiento son correctos;
  - nunca aparecen un producto despublicado, uno de categoría despublicada ni uno cuyas mascotas estén todas despublicadas.
- [X] T023 [P] [US1] Escribir `tests/e2e/us1-catalog-list.spec.ts`:
  - la cabecera lleva a `/productos`;
  - aviso de demostración, "24 productos" y 12 tarjetas con imagen, meta, nombre y precio en formato `0,00 €`;
  - "1 producto" en singular (con una fixture);
  - la tarjeta abre su ficha con el teclado;
  - página 2 con `aria-current="page"` y `link[rel=canonical]` igual a `/productos?pagina=2`;
  - un catálogo vacío muestra el `.empty-state` con los enlaces al inicio y a contacto;
  - con `tienda.href: null`, 404 en `/productos` y la cabecera lleva a `/proximamente/tienda`;
  - se repite en el proyecto `no-js`.

### Implementación de US1

- [X] T024 [US1] Añadir a `src/db/queries/catalog.ts` `listProducts({ sort, page, pageSize })` y `countProducts()`, con el orden `featured` de C10 (`stock > 0 DESC, position, id`) y `LIMIT/OFFSET`, hasta que T022 pase
- [X] T025 [P] [US1] Crear `src/components/Pagination.tsx`: un `nav.pagination` con `aria-label="Paginación"`, enlaces generados con `buildCatalogHref`, "Anterior"/"Siguiente" con texto, la página actual con `aria-current="page"`, y nada si solo hay una página
- [X] T026 [US1] Crear `src/app/productos/page.tsx`. Debe:
  - comprobar `sectionHref('tienda')` y dar `notFound()` si la tienda está apagada;
  - parsear la query con `parseCatalogQuery` y ajustar la página con `clampPage`;
  - pintar las migas, el `h1` "Nuestros productos", `ShopNotice`, `<h2 id="resultados" tabindex="-1">` con el total en singular o plural, `.product-grid` con `ProductCard` (`priority` en las 4 primeras) y `Pagination`;
  - con el catálogo vacío (sin ningún producto visible), pintar el `.empty-state` con el mensaje "Todavía no hay productos en la tienda" y dos enlaces: "Volver al inicio" (`/`) y "Contactar con la clínica" (`/contacto`);
  - exportar `generateMetadata` (título, `meta_description` y `canonical` `/productos`, o `/productos?pagina=N` si N > 1, sin filtros, búsqueda ni orden; C14);
  - usar `export const dynamic = 'force-dynamic'`.
- [X] T027 [US1] En `content/petcare.yaml`, poner `{ key: tienda, label: Nuestros productos, href: /productos }` y cambiar la pregunta frecuente de productos (línea ~152) para enlazar a `section:tienda` sin el "Pronto podrás verla". Actualizar `tests/e2e/coming-soon.spec.ts` para que `tienda` ya no espere "Próximamente" y `carrito` sí.
- [X] T028 [US1] Convertir `src/app/sitemap.ts` en `async` y añadir `/productos` cuando la tienda está activa (las fichas llegan en US2)

**Checkpoint**: US1 funciona de punta a punta y ya se puede activar la tienda.

---

## Phase 4: User Story 2 - Ver la ficha de un producto (Priority: P1)

**Goal**: cada producto visible tiene su ficha con la disponibilidad, las pestañas con contenido y los metadatos propios.

**Independent Test**: abrir la ficha de un producto completo y recorrer sus pestañas con el teclado. Abrir la del producto sin ingredientes (sin barra de pestañas), la de un agotado ("Agotado") y `/productos/no-existe` (404).

### Tests de US2

- [X] T029 [P] [US2] Ampliar `tests/integration/catalog-queries.test.ts` con un bloque "ficha": `getProductBySlug` devuelve el producto con su categoría y sus mascotas ordenadas, y devuelve `null` para un slug inexistente, un producto despublicado, uno de categoría despublicada o uno sin mascotas publicadas
- [X] T030 [P] [US2] Escribir `tests/e2e/us2-product-detail.spec.ts`:
  - migas de pan que vuelven al listado;
  - imagen, chip "Categoría · Mascotas", `h1`, descripción breve, precio, "Para: …" y "En stock · Envío en 24-48 h";
  - pestañas con `?pestana=` y `aria-current="true"` recorridas con el teclado;
  - un producto sin ingredientes ni modo de uso no tiene `nav.tabs`;
  - un agotado muestra "Agotado";
  - no hay botón de compra ni selector de cantidad;
  - aparece el aviso de demostración (`.shop-notice`) con el texto configurado y, con una fixture con `demo_notice.enabled: false`, no aparece ni en la ficha ni en el listado (FR-019b);
  - `?pestana=xyz` muestra la descripción;
  - `/productos/no-existe` da 404 con enlace al catálogo;
  - el `<title>` y `link[rel=canonical]` son los esperados;
  - se repite en `no-js`.

### Implementación de US2

- [X] T031 [US2] Añadir `getProductBySlug(slug)` a `src/db/queries/catalog.ts`, sobre `publishedProducts()`, hasta que T029 pase
- [X] T032 [US2] Crear `src/app/productos/[slug]/page.tsx` (contracts/routes.md). Debe pintar:
  - las migas "Inicio › Nuestros productos › <nombre>";
  - `.detail__gallery` con `next/image` con `priority` o el placeholder;
  - `.detail__info` con el chip, el `h1`, la descripción breve, `Price`, "Para: Perro, Gato", el `.badge` o `.badge--muted` según `availability` y `ShopNotice`;
  - `nav.tabs#pestanas` (`aria-label="Información del producto"`) solo si `productTabs` devuelve más de una, con enlaces `?pestana=<id>#pestanas`;
  - el panel activo con `react-markdown`, sin HTML crudo.
  Además: la tienda apagada o un producto inexistente dan `notFound()`, `generateMetadata` (título `<nombre> · Nuestros productos`, `short_description`, `canonical` sin query y `og:image`) y `force-dynamic`.
- [X] T033 [P] [US2] Crear `src/app/productos/[slug]/not-found.tsx`: "No hemos encontrado este producto" y el enlace "Ver todo el catálogo", con `page-hero` y `breadcrumb` como `src/app/not-found.tsx`
- [X] T034 [US2] Añadir las fichas visibles a `src/app/sitemap.ts` (consulta sobre `publishedProducts()`)

**Checkpoint**: US1 y US2 forman el catálogo mínimo navegable.

---

## Phase 5: User Story 3 - Filtrar y ordenar el listado (Priority: P2)

**Goal**: filtros por mascota (O) y categoría (Y), cuatro ordenaciones con desempate estable, y la URL compartible.

**Independent Test**: marcar "Gato", elegir "Higiene" y "Precio: de menor a mayor", pulsar "Aplicar" y comprobar el resultado, el total, el foco en el total y la URL. Abrir esa URL en otra pestaña. Repetirlo sin JavaScript.

### Tests de US3

- [X] T035 [P] [US3] Ampliar `tests/integration/catalog-queries.test.ts` con un bloque "filtros y orden":
  - varias mascotas se combinan con O, sin duplicar el producto que tiene varias;
  - la categoría se combina con Y;
  - `countProducts` coincide con el listado en cada combinación (SC-003);
  - `precio-asc`, `precio-desc` y `novedades` respetan el desempate `featured` con los dos productos del mismo precio;
  - los agotados quedan detrás en `destacados`;
  - una categoría vacía devuelve 0.
- [X] T036 [P] [US3] Escribir `tests/e2e/us3-catalog-filters.spec.ts`:
  - filtros por mascota (varias) y por categoría;
  - "Aplicar" deja el foco en `#resultados`;
  - la URL contiene `mascota=gato&mascota=otros&categoria=higiene&orden=precio-asc`;
  - recargar la URL da el mismo resultado;
  - una combinación vacía muestra "No hay productos que coincidan" y "Ver todo el catálogo";
  - `?mascota=dragon&orden=x&pagina=999` no da error (todas las mascotas, "Destacados" y la última página);
  - la paginación conserva los filtros;
  - las variantes filtradas llevan `noindex`;
  - se repite en `no-js`.

### Implementación de US3

- [X] T037 [US3] Ampliar `listProducts` y `countProducts` en `src/db/queries/catalog.ts` con `pets[]` (`EXISTS` sobre `product_pet_links`, sin duplicados), `category` y las cuatro ordenaciones de C10, hasta que T035 pase
- [X] T038 [US3] Crear `src/components/CatalogFilters.tsx`: `<form method="get" action="/productos#resultados">` dentro de `aside.shop-filters` (`aria-label="Filtros"`), con:
  - `fieldset` "Mascota" (casillas `name=mascota`) y `fieldset` "Categoría" (radios `name=categoria`, "Todas" con valor vacío primero), cada uno con su `legend`;
  - `<label>` y `<select name=orden class="select">` con las etiquetas de `SORTS`;
  - botón "Aplicar" (`btn`, marino);
  - los valores actuales marcados.
  Sin autoenvío (C6).
- [X] T039 [US3] Integrar `CatalogFilters` en `src/app/productos/page.tsx` dentro de `.shop-layout` y `.shop-toolbar`, pasar los filtros a las consultas, mostrar en el estado vacío "No hay productos que coincidan" con el enlace "Ver todo el catálogo", y añadir `robots: { index: false, follow: true }` en `generateMetadata` cuando hay `mascota` o `categoria`

**Checkpoint**: US1–US3 funcionan con y sin JavaScript.

---

## Phase 6: User Story 4 - Buscar por nombre (Priority: P2)

**Goal**: búsqueda por nombre sin distinguir mayúsculas ni tildes, combinada con los filtros, y un mensaje claro cuando no hay resultados.

**Independent Test**: buscar `champu` y encontrar "Champú…". Buscar `zzz` y ver "No hemos encontrado productos para «zzz»". Buscar con un filtro activo y comprobar que se combinan.

### Tests de US4

- [X] T040 [P] [US4] Ampliar `tests/integration/catalog-queries.test.ts` con un bloque "búsqueda": `q` sin tildes ni mayúsculas encuentra el producto; `q` con `%` o `_` se trata como literal; se combina con mascota, categoría y orden; el total coincide
- [X] T041 [P] [US4] Escribir `tests/e2e/us4-catalog-search.spec.ts`:
  - `champu` encuentra el champú;
  - `zzz` muestra «zzz» en el mensaje y el enlace "Ver todo el catálogo";
  - una búsqueda solo con espacios lista todo;
  - la búsqueda se conserva al cambiar el orden y al paginar;
  - las variantes con `q` llevan `noindex`;
  - el término se muestra escapado (`<b>` aparece como texto);
  - se repite en `no-js`.

### Implementación de US4

- [X] T042 [US4] Añadir `q` a `listProducts` y `countProducts` en `src/db/queries/catalog.ts` (`search_name LIKE '%' || normalizeSearch(q) || '%' ESCAPE '\'` con `escapeLike`), hasta que T040 pase
- [X] T043 [US4] Añadir el buscador a `src/components/CatalogFilters.tsx`, dentro del mismo formulario: `.search`, `<label class="visually-hidden">Buscar producto</label>`, `input type=search name=q maxlength=80`. Colocarlo en `.shop-toolbar` con el atributo `form` si la maqueta lo pide fuera del `aside`.
- [X] T044 [US4] En `src/app/productos/page.tsx`, mostrar "para «término»" en `#resultados`, el mensaje "No hemos encontrado productos para «término»" en el estado vacío y `noindex` cuando hay `q`. El término no se registra en ningún log.

**Checkpoint**: US1–US4 completas.

---

## Phase 7: User Story 5 - Etiquetas "Novedad" y "Oferta" (Priority: P2)

**Goal**: las etiquetas aparecen en las tarjetas y en la ficha, con el precio anterior tachado y anunciado de forma accesible.

**Independent Test**: en el listado y en la ficha de la demo, comprobar "Novedad", "Oferta" con el precio tachado y un producto con las dos. Comprobar que un `compare_at_price` menor o igual que el precio no muestra la oferta.

### Tests de US5

- [X] T045 [P] [US5] Escribir `tests/e2e/us5-catalog-labels.spec.ts`:
  - "Novedad" (`.chip--amber`) y "Oferta" (`.chip`) en la tarjeta y en la ficha;
  - el producto con las dos etiquetas las muestra juntas;
  - el precio anterior aparece dentro de `<s>`;
  - el texto accesible es "Antes 12,00 €, ahora 9,90 €" (comprobar con `getByText` sobre el `.visually-hidden`);
  - con una fixture con `compare_at_price` menor o igual que el precio, no hay etiqueta ni tachado;
  - las etiquetas no dependen solo del color (son texto).

### Implementación de US5

- [X] T046 [US5] Ampliar `src/components/Price.tsx`: con `onSale`, pintar `<s aria-hidden="true">` con el precio anterior y el precio actual visibles, más un `.visually-hidden` con `priceLabel`. Sin oferta, se ignora `compareAt`.
- [X] T047 [US5] Añadir `.product__tags` con "Novedad" (`chip chip--amber`) y "Oferta" (`chip`) a `src/components/ProductCard.tsx` y a `.detail__info` en `src/app/productos/[slug]/page.tsx`

**Checkpoint**: US1–US5 completas.

---

## Phase 8: User Story 6 - "También te puede interesar" (Priority: P3)

**Goal**: la ficha muestra hasta 3 productos relacionados, distintos del actual, priorizando los que están en stock.

**Independent Test**: abrir la ficha de un producto con relacionados y comprobar que hay de 1 a 3 tarjetas, sin el producto actual y con los de stock delante. Con una fixture sin relacionados, la sección no aparece.

### Tests de US6

- [X] T048 [P] [US6] Ampliar `tests/integration/catalog-queries.test.ts` con un bloque "relacionados" (C11):
  - comparten categoría o mascota;
  - nunca incluyen el producto actual ni uno no visible;
  - como máximo 3;
  - orden `in_stock DESC`, primero la misma categoría, luego `position` e `id`;
  - un producto sin relacionados da una lista vacía.
- [X] T049 [P] [US6] Escribir `tests/e2e/us6-related.spec.ts`:
  - la sección "También te puede interesar" tiene un `h2` y de 1 a 3 tarjetas que abren su ficha;
  - no aparece el producto actual;
  - con una fixture sin relacionados, la sección no existe;
  - se repite en `no-js`.

### Implementación de US6

- [X] T050 [US6] Añadir `relatedProducts(productId, categoryId, petIds)` a `src/db/queries/catalog.ts`, sobre `publishedProducts()`, hasta que T048 pase
- [X] T051 [US6] Añadir la sección `.band` "También te puede interesar" con `.product-grid` y `ProductCard` a `src/app/productos/[slug]/page.tsx`. No se pinta si la lista está vacía.

**Checkpoint**: las seis historias están completas.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T052 [P] Añadir `/productos`, `/productos?mascota=gato&categoria=higiene`, `/productos?q=zzz`, una ficha completa y una agotada a la lista `ROUTES` de `tests/e2e/a11y-all-routes.spec.ts` (axe y desbordamiento a 320 px)
- [X] T053 [P] Añadir a `lighthouserc.json` `http://localhost:3200/productos` y una ficha, con los mismos umbrales (`performance` y `accessibility` ≥ 0,9). Ejecutar `npm run test:lighthouse` y corregir hasta pasar (SC-005).
- [X] T054 [P] Comprobar `tests/unit/no-pii-logs.test.ts` y `tests/unit/no-design-copy.test.ts` con los archivos nuevos. Ampliarlos si no cubren `src/app/productos/**` y verificar que ningún texto, precio o emoji de `design/productos.html` y `design/producto.html` acaba en `content/` ni en `src/`.
- [X] T055 Documentar el bloque `shop:` en `README.md`, en la sección de carga de contenido: los campos, el formato del precio en euros, las imágenes en `public/media/<clinica>/productos/` y cómo desactivar el aviso de demostración o la tienda
- [X] T056 Recorrer los 16 escenarios de `specs/004-product-catalog/quickstart.md` en el navegador (con y sin JavaScript, y con el teclado) y anotar las desviaciones en `specs/004-product-catalog/checklists/requirements.md`
- [X] T057 Pasar la definición de terminado completa: `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run test:lighthouse` en verde; ningún secreto en el diff; ningún `style=""` ni valor visual fuera de `design/tokens.css`
- [X] T058 Actualizar `CLAUDE.md` ("Estado actual"): la feature 004 pasa a **implementada**, con la migración `0003_product_catalog`, sin dependencias nuevas, y las tareas y desviaciones en `specs/004-product-catalog/`

---

## Dependencies & Execution Order

### Fases

- **Setup (F1)** no tiene dependencias.
- **Foundational (F2)** depende de F1 y **bloquea** todas las historias. Dentro de F2:
  - T003 va antes que T004, y T004 antes que T013, T014, T017 y T018;
  - T005, T006 y T007 van antes que T008, T009 y T010 (tests primero), y T009 antes que T010;
  - T011 va antes que T012, y T012 antes que T013;
  - T015 va antes que T016 (`checkImages`), y T013 antes que T016;
  - T017 y T020 van antes que T021.
- **Historias (F3–F8)**: dependen de F2.
- **Polish (F9)** va después de las historias que se quieran entregar. T052 y T053 necesitan US1 y US2.

### Dependencias reales entre historias

- **US2** es independiente de US1 en el código (ruta propia), aunque para navegar desde el listado
  hacen falta las dos. Las migas de la ficha enlazan a `/productos`.
- **US3** amplía `listProducts`, `countProducts` y `src/app/productos/page.tsx` de **US1**.
- **US4** amplía `CatalogFilters.tsx` de **US3** y las consultas de US1 y US3, así que va después
  de US3.
- **US5** amplía `Price.tsx` y `ProductCard.tsx` (F2) y la ficha de **US2**.
- **US6** amplía la ficha de **US2**.

### Dentro de cada historia

Tests (que fallan) → consultas → componentes → páginas y metadatos.

## Parallel Examples

```text
# F2: tests de dominio y contenido a la vez
T005 money.test · T006 search.test · T007 catalog-query.test · T011 content-shop.test

# F2: en cuanto T004 está aplicada
T015 ilustraciones · T018 helper seedCatalog · T019 styles.css · T020 ShopNotice/Price

# Con F2 terminada, en paralelo por personas o agentes
US1 (T022–T028) · US2 (T029–T034)
# Después: US3 → US4, y en paralelo US5 y US6 (las dos sobre la ficha; coordinar los cambios en [slug]/page.tsx)
```

## Implementation Strategy

1. **MVP** con F1, F2, US1 y US2: el listado y la ficha con datos reales, el aviso de demostración
   y la tienda activada (`tienda.href`). Ya sustituye a "Próximamente".
2. **+ US3 y US4**: filtros, orden y búsqueda. Completan el "encontrar productos para mi mascota"
   (SC-001).
3. **+ US5 y US6**: etiquetas y relacionados.
4. **+ Polish**: axe en todas las rutas, Lighthouse en `/productos` y en una ficha, la
   documentación y la definición de terminado. **Obligatorio antes de mergear.**
