# Implementation Plan: Panel de administración de la tienda

**Branch**: `008-admin-store-panel` | **Date**: 2026-11-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-admin-store-panel/spec.md`

## Summary

Segundo módulo del panel `/admin` (feature 007), con la misma guardia, la misma navegación y el
mismo registro de acciones. Incluye:

- alta, edición, desactivación y reactivación de productos, con subida de foto;
- ajuste de stock con historial;
- lista y detalle de pedidos con filtro por estado;
- cambios de estado con correo al comprador, confirmación del pago en clínica y cancelación con
  reembolso;
- alta y desactivación de códigos de descuento.

Todas las transiciones pasan por la tabla única `ORDER_TRANSITIONS` y por `transitionOrder` de la
005, a las que solo se añade `pending_payment → paid` para el pago en clínica.

`content:load` deja de sobrescribir productos y códigos (`--force-shop` los restaura). Las fotos se
procesan con `sharp` y se guardan en un volumen propio. Las decisiones están en
[research.md](research.md) (G1–G18) y el modelo en [data-model.md](data-model.md) (migración
`0007_admin_store`).

## Technical Context

**Language/Version**: TypeScript strict sobre Node.js 22 LTS.

**Primary Dependencies**: Next.js 15 (App Router, RSC, Server Actions), React 19, Drizzle ORM y
`pg`, Zod, pino y `@js-temporal/polyfill`. `sharp` pasa a declararse como dependencia directa,
con la versión que ya instala `next` (G4).

**Storage**:
- PostgreSQL 16, con la migración `0007_admin_store`:
  - tabla nueva `stock_movements` y enum `stock_movement_reason`;
  - columnas nuevas `products.image_width` e `image_height`, y
    `order_status_history.admin_id`;
  - valor nuevo `order_status` en `outbox_kind`;
  - índice nuevo `orders(created_at DESC)`;
  - backfill de un movimiento `initial` por producto.
- Archivos: `UPLOADS_DIR` (volumen `petcare-uploads`) para las fotos WebP.

**Testing**: Vitest (unitarias e integración contra PostgreSQL) y Playwright con
`@axe-core/playwright` (también con el perfil sin JavaScript), más Lighthouse CI del catálogo.

**Target Platform**: Docker Compose en el VPS compartido. Un volumen nuevo; ningún temporizador
ni CLI nuevos.

**Project Type**: Aplicación web monolítica (Next.js).

**Performance Goals**:
- lista de pedidos y de productos con una consulta paginada indexada más un recuento;
- procesar una foto de 5 MB en menos de 2 s en el VPS;
- las fotos del catálogo se sirven con `srcset` y caché inmutable, sin optimizador en tiempo de
  ejecución.

**Constraints**:
- rol comprobado en cada petición y en cada acción;
- 404 para quien no es administrador;
- sin JavaScript obligatorio, también en la subida;
- WCAG 2.2 AA;
- solo tokens;
- ningún dato de la clínica en `src/`;
- sin datos personales en logs ni en URLs;
- pagos y reembolsos solo en modo de pruebas.

**Scale/Scope**:
- una clínica con decenas o cientos de productos y cientos de pedidos al año;
- unas 9 páginas, 9 Server Actions, 1 route handler y 1 plantilla de correo;
- cambios en `transitionOrder`, `ORDER_TRANSITIONS`, `reserveStock`, `releaseOrderStock`,
  `content/load` y `ProductImage`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | Sin maqueta en `design/`, así que se compone con `.side-nav`, `table.orders--stack`, `.badge*`, `.notice`, `.btn` y los campos de la 002. Los componentes nuevos (`.admin-filters`, `.admin-thumb`, `.image-field`, `.stock-history`) solo usan tokens (G16). Avanzar y guardar en marino, cancelar con `.btn--ghost`, éxito en menta. | ✅ |
| **II. Marca propia** | Los productos y las fotos son datos de la clínica; no se publica nada de `design/reference/`. | ✅ |
| **III. Tests de flujos críticos** | Toca **checkout y pago** (movimientos en `reserveStock`) y **estados de pedido** (transición nueva, correo y autor): se pasan sus tests y se añaden los del panel (G18). | ✅ |
| **IV. Privacidad y seguridad** | Guardia en cada acción; la subida comprueba tamaño y formato real y quita EXIF y GPS; nombres de archivo generados y ruta de servicio con lista blanca y `nosniff`; motivo interno fuera de los correos; log de auditoría sin datos del comprador; `no-store`. | ✅ |
| **V. WCAG 2.2 AA** | Pestañas de estado con `aria-current` y recuento en texto; estados en texto además del color; `<input type=file>` nativo con su etiqueta; texto alternativo obligatorio; confirmación de cancelar en una página propia; axe en todas las rutas nuevas. | ✅ |
| **VI. Rendimiento** | El catálogo sirve las fotos subidas en WebP con tres anchos y `srcset`; Lighthouse del catálogo ≥ 90 con una foto subida (SC-008). | ✅ |
| **VII. Pagos de prueba** | Los reembolsos van por el proveedor existente (`fake` en local y en los tests; Stripe en modo de pruebas). | ✅ |
| **VIII. Producto real y adaptable** | Cierra la excepción para el catálogo, el stock, los pedidos y los descuentos. **Sigue** para categorías y mascotas del catálogo, configuración de la tienda, métodos de envío y de pago, y lo que ya quedaba de la 007 (Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec declara que no hay maqueta en `design/`. CI con lint, tests y Gitleaks. Migración probada en la base de datos de pruebas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción parcial justificada.

**Re-check tras la Fase 1**: PASA. Lo confirman estas decisiones de diseño:
- una sola tabla de transiciones (`allowedTransitions` deriva de `ORDER_TRANSITIONS`), que
  comparten el panel y la CLI;
- el stock se ajusta con un UPDATE condicionado, atómico frente a `reserveStock` (SC-005);
- `ADMIN_ACTIONS` y `ADMIN_PAGES` ampliadas (SC-001);
- la CSP no cambia (`img-src 'self'`).

## Project Structure

### Documentation (this feature)

```text
specs/008-admin-store-panel/
├── plan.md                 # este archivo
├── research.md             # decisiones G1–G18
├── data-model.md           # 0007_admin_store, transiciones y validaciones
├── quickstart.md           # validación manual y pruebas filtradas
├── contracts/
│   ├── routes.md           # páginas, Server Actions y la ruta de fotos
│   ├── emails.md           # order_status
│   └── cli-and-content.md  # npm run orders y content:load --force-shop
├── checklists/requirements.md
└── tasks.md                # /speckit-tasks
```

### Source Code (repository root)

```text
drizzle/0007_admin_store.sql                 # tabla, columnas, enum, índice y backfill
src/db/schema.ts                             # stock_movements, image_width/height, admin_id, order_status
src/db/queries/
├── admin-orders.ts                          # nuevo: lista, recuentos y detalle
├── admin-products.ts                        # nuevo: lista, reservado y movimientos
└── admin-visibility.ts                      # + productos y pedidos
src/domain/
├── order-status.ts                          # + pending_payment→paid (clinic) y allowedTransitions
├── discount.ts                              # + discountState
├── store-schemas.ts                         # nuevo: Zod de producto, ajuste, estado y código
└── vat.ts                                   # nuevo: VAT_RATES
src/lib/admin/
├── actions-list.ts                          # + 9 acciones y 9 páginas
├── audit.ts                                 # + acciones, entidades y claves (G14)
├── products.ts                              # nuevo: saveProduct y setProductPublished
├── product-images.ts                        # nuevo: sharp, variantes y escritura atómica
├── stock.ts                                 # nuevo: adjustStock
├── orders.ts                                # nuevo: estado, pago en clínica, cancelar y reintentar reembolso
└── discounts.ts                             # nuevo: alta y activación
src/lib/orders/{transition,emails}.ts        # admin_id, encolado de order_status y skipEmail combinado
src/lib/checkout/reserve.ts, src/lib/orders/stock.ts   # + stock_movements
src/email/templates/order-status.ts          # nuevo
src/content/load.ts, scripts/content-load.ts # sembrar la tienda y --force-shop
src/app/admin/{productos,pedidos,descuentos}/          # páginas y actions.ts
src/app/media/subidas/productos/[file]/route.ts        # nuevo: sirve las fotos subidas
src/components/admin/                        # AdminNav (+3), ProductForm, StockAdjust, OrderFilters, OrderDetail, DiscountForm
src/components/ProductImage.tsx              # nuevo: imagen común de ProductCard y la ficha, con el loader de las variantes subidas
design/styles.css                            # componentes nuevos solo con tokens
next.config.ts                               # bodySizeLimit 6mb
deploy/docker-compose.prod.yml, deploy/README.md, .env.example   # volumen y UPLOADS_DIR
.gitignore                                   # var/
tests/unit/, tests/integration/, tests/e2e/008-*       # ver G18
```

**Structure Decision**: es el monolito Next.js de siempre. La lógica con efectos de la tienda vive
en `src/lib/admin/` y se apoya en `src/lib/orders/` (la única que cambia estados de pedido). La
lógica pura va en `src/domain/` y las páginas en `src/app/admin/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principio VIII (parcial): categorías y mascotas del catálogo, configuración de la tienda y métodos de envío y de pago siguen en el YAML, igual que lo que dejó pendiente la 007 | La spec deja fuera la gestión de categorías y mascotas; la configuración de la tienda cambia poco y llegará con los "datos de la clínica" del panel | Meterlo aquí duplica el alcance; las tablas ya existen y el panel podrá gestionarlas sin migrar datos |
| Archivos en disco (volumen `petcare-uploads`) además de PostgreSQL | Las fotos subidas no caben en `public/` (va dentro de la imagen) y no conviene guardarlas en la base de datos | Guardarlas en la base de datos infla las copias y las consultas; un almacenamiento externo añade un tercero y secretos |
| `bodySizeLimit` de las Server Actions a 6 MB para todo el sitio | Next aplica ese límite a todas las acciones por igual, sin distinguir rutas | Una ruta API aparte para la subida obligaría a gestionar a mano el CSRF y el POST-Redirect-GET sin JavaScript; las demás acciones validan tamaños con Zod y los límites por origen siguen |
