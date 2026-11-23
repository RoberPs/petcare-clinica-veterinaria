# Implementation Plan: Catálogo de la tienda online

**Branch**: `004-product-catalog` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-product-catalog/spec.md`

## Summary

Convertir "Nuestros productos" en un catálogo real, sin compra. Tiene dos rutas públicas:
- `/productos`: listado con filtros por mascota (múltiple) y por categoría (única), búsqueda por
  nombre sin tildes, cuatro ordenaciones y paginación;
- `/productos/[slug]`: ficha con pestañas y relacionados.

Todo funciona con un único formulario GET y enlaces, así que no hace falta JavaScript.

Los datos son tablas nuevas (`products`, `product_categories`, `product_pets`,
`product_pet_links` y `shop_settings`, en la migración `0003_product_catalog`). Se cargan desde un
bloque `shop:` del YAML de la clínica, con 24 productos de demo e ilustraciones SVG propias. La
lógica pura vive en `src/domain/`: formato de euros, normalización de la búsqueda, parseo de la
query y derivados de oferta y disponibilidad. Las decisiones están en [research.md](research.md)
(C1–C16).

## Technical Context

**Language/Version**: TypeScript strict sobre Node.js 22 LTS.

**Primary Dependencies**: Next.js 15 (App Router, RSC), React 19, Drizzle ORM y `pg`, Zod 4,
`yaml`, `react-markdown`. **Sin dependencias nuevas.**

**Storage**: PostgreSQL 16, con la migración `0003_product_catalog` (5 tablas y sin extensiones
nuevas).

**Testing**: Vitest (unitarias e integración contra PostgreSQL), Playwright con
`@axe-core/playwright` (móvil, escritorio y sin JavaScript) y Lighthouse CI.

**Target Platform**: Docker Compose en el VPS compartido, detrás de Caddy y Cloudflare.

**Project Type**: Aplicación web monolítica (Next.js).

**Performance Goals**: Lighthouse móvil ≥ 90 en `/`, `/productos` y una ficha. Dos consultas SQL
por página.

**Constraints**: sin JavaScript obligatorio; WCAG 2.2 AA; solo tokens y componentes de
`design/`; ningún dato de la clínica en `src/`; precios con el formato `1.234,56 €`.

**Scale/Scope**: 24 productos en la demo, con el diseño pensado para unos cientos (máximo de 500
en la validación). 5 categorías y 3 mascotas.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | Se usan componentes que ya existen: `.shop-layout`, `.shop-filters`, `.shop-toolbar`, `.product-grid`, `.product` (con sus elementos), `.search`, `.select`, `.detail`, `.tabs`, `.chip` y `.chip--amber`, `.badge` y `.badge--muted`, `.price`, `.breadcrumb`, `.empty-state` y `.visually-hidden`. Se añaden solo con tokens `.pagination`, `.shop-notice` y `.product__tags` (C13). Se quitan los `style=""` de la maqueta. No hay CTA de compra; "Aplicar" es la acción neutra (marino). | ✅ |
| **II. Marca propia** | Los productos, precios, textos y emojis de `design/productos.html` y `producto.html` no se publican. Los 24 productos son genéricos, sin marcas, con ilustraciones propias (C9). El aviso "Tienda de demostración" evita que parezca una tienda real (FR-019b). | ✅ |
| **III. Tests de flujos críticos** | El catálogo no es un flujo de pago, pero tiene tests unitarios, de integración y e2e (sin JavaScript, axe y Lighthouse) para el listado y la ficha (C16). | ✅ |
| **IV. Privacidad y seguridad** | No se recogen datos personales ni se usan cookies. La query se valida en el servidor y el `LIKE` se escapa (C4, C5). El Markdown se pinta sin HTML crudo. No se registra el término buscado. No se carga nada de terceros. | ✅ |
| **V. WCAG 2.2 AA** | Los filtros van en `fieldset` con `legend` y el buscador y el orden tienen `label`. No se envía nada al cambiar un filtro (3.2.2). El total está en un encabezado que recibe el foco (C6). La oferta se anuncia con texto y no solo con el tachado. Las pestañas son enlaces con `aria-current`, y la paginación usa `aria-current="page"`. axe pasa en todas las rutas nuevas, y la página no desborda a 320 px. | ✅ |
| **VI. Rendimiento** | Hay SVG ligeros con dimensiones fijas, sin JavaScript propio, y dos consultas por página. Lighthouse se ejecuta en `/productos` y en una ficha (C15). | ✅ |
| **VII. Pagos de prueba** | Sin compra ni pago. | N/A |
| **VIII. Producto real y adaptable** | Es un catálogo real con datos persistentes, stock y precios con IVA, con todos los vacíos y errores cubiertos. No muestra botones sin acción (FR-019). Todo es dato de la clínica (C12). **Excepción heredada**: no hay panel de administración y el catálogo se gestiona con el YAML (ver Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec referencia `design/productos.html` y `producto.html`, y sus componentes. La CI ya cubre lint, tests y secretos. La migración se prueba en la base de datos de pruebas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción heredada.

**Re-check tras la Fase 1**: PASA.
- Las tablas son las que editará el panel futuro y las que referenciarán el carrito y los
  pedidos (`products.id`, el precio y el IVA guardados), sin rediseño.
- `publishedProducts()` concentra la regla de visibilidad para todas las lecturas.

## Project Structure

### Documentation (this feature)

```text
specs/004-product-catalog/
├── plan.md              # este archivo
├── research.md          # decisiones C1–C16
├── data-model.md        # tablas de 0003_product_catalog
├── quickstart.md        # validación manual y automática
├── contracts/
│   ├── content-file.md  # bloque shop: del YAML
│   └── routes.md        # /productos y /productos/[slug]
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
drizzle/0003_product_catalog.sql          # generada con db:generate
src/
├── db/
│   ├── schema.ts                         # + productCategories, productPets, products, productPetLinks, shopSettings
│   └── queries/catalog.ts                # publishedProducts, listProducts, countProducts, getProduct, relatedProducts, catalogFilters, shopSettings
├── domain/
│   ├── money.ts                          # formatEur, parseEuros, priceLabel
│   ├── search.ts                         # normalizeSearch, escapeLike
│   └── catalog.ts                        # parseCatalogQuery, buildCatalogHref, SORTS, onSale, availability, productTabs
├── content/
│   ├── schema.ts                         # + shopSchema
│   └── load.ts                           # + carga de shop: y checkImages de productos
├── components/
│   ├── ProductCard.tsx
│   ├── CatalogFilters.tsx                # formulario GET
│   ├── Pagination.tsx
│   ├── Price.tsx                         # precio, tachado y texto accesible
│   └── ShopNotice.tsx
└── app/
    ├── productos/page.tsx                # listado
    ├── productos/[slug]/page.tsx         # ficha
    └── sitemap.ts                        # async + productos
design/styles.css                         # + .pagination, .shop-notice, .product__tags (solo tokens)
public/media/petcare/productos/*.svg      # 24 ilustraciones propias
public/media/comun/placeholder-producto.svg
content/petcare.yaml                      # + shop:, tienda.href y FAQ
lighthouserc.json                         # + /productos y una ficha
tests/
├── unit/{money,search,catalog-query,content-shop}.test.ts
├── integration/{content-shop,catalog-queries}.test.ts
└── e2e/{us1-catalog-list,us2-product-detail,us3-catalog-filters,us4-catalog-search,us5-catalog-labels,us6-related}.spec.ts
    # + rutas en a11y-all-routes.spec.ts y coming-soon.spec.ts
```

**Structure Decision**: es la misma estructura monolítica de las features 001–003. La lógica pura
va en `src/domain/` (sin Next, React ni Drizzle), las consultas en `src/db/queries/` y las vistas
en `src/app/` y `src/components/`. No hace falta `src/lib/catalog/`, porque no hay efectos (ni
escrituras, ni correos).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principio VIII: el catálogo y el stock no se gestionan desde un panel de administración (excepción heredada de 001–003) | El panel es una feature propia, todavía sin especificar. El catálogo hace falta antes para el carrito. | Construir ahora un panel solo para productos duplicaría la autenticación de administración y el diseño que tendrá el panel completo. Las tablas ya son las que usará el panel, así que la excepción se cierra sin migraciones. |
