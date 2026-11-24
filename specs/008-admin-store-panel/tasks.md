# Tasks: Panel de administración de la tienda

**Input**: documentos de diseño de `specs/008-admin-store-panel/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/) y [quickstart.md](./quickstart.md).

**Tests**: **se incluyen**. CLAUDE.md exige que pasen los tests de la feature y los de los flujos
críticos afectados (checkout y pago, estados de pedido); el plan los detalla en G18. Los tests de
cada historia se escriben antes de implementarla y deben fallar. En local solo se ejecutan los
filtrados de [quickstart.md](./quickstart.md); la batería completa la pasa la CI.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado sobre la fase 2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: la historia a la que pertenece (US1–US6).

## Convenciones del proyecto

- Son las mismas de la 001 a la 007:
  - un solo proyecto Next.js;
  - estilos solo en `design/` y con tokens, sin `style=""`;
  - textos en español e identificadores en inglés;
  - ningún dato de la clínica en `src/`.
- **Capas**:
  - `src/domain/` es puro: transiciones, estado de los códigos, IVA y esquemas Zod;
  - los efectos del panel van en `src/lib/admin/`;
  - las lecturas van en `src/db/queries/`;
  - las vistas van en `src/app/admin/` y `src/components/admin/`.
- **Pedidos**: solo `src/lib/orders/` cambia estados. El panel llama a `transitionOrder`,
  `cancelOrder` y `refundOrder`. Lo que ofrece el panel sale de
  `allowedTransitions(order, 'clinic', now)` (G7). Cada formulario de pedido envía `from` y se
  compara dentro de `lockOrder` (G8).
- **Stock**: `products.stock` es el disponible. Todo cambio escribe un `stock_movements` en la
  misma transacción (G5).
- **Guardia**: cada Server Action nueva **empieza por `await requireAdmin()`** y se registra en
  `ADMIN_ACTIONS`; cada página nueva va en `ADMIN_PAGES` (`src/lib/admin/actions-list.ts`).
- **E2E**: los archivos nuevos llevan el prefijo `008-` (CLAUDE.md).
- **Decisiones**: las referencias G1–G18 son de [research.md](./research.md). Las rutas están en
  [contracts/routes.md](./contracts/routes.md), el correo en
  [contracts/emails.md](./contracts/emails.md) y la CLI y el YAML en
  [contracts/cli-and-content.md](./contracts/cli-and-content.md).

---

## Phase 1: Setup (configuración compartida)

**Purpose**: dependencia, configuración y entorno de las fotos subidas.

- [X] T001 Declara `sharp` en `dependencies` de `package.json` con la versión ya instalada por `next` (`npm ls sharp`) y actualiza `package-lock.json` sin otras dependencias nuevas (G4)
- [X] T002 [P] Añade `experimental.serverActions.bodySizeLimit: '6mb'` en `next.config.ts`, con un comentario que remita a G4
- [X] T003 [P] Añade `UPLOADS_DIR` a `.env.example` (`./var/uploads`, sin valores reales) y `var/` a `.gitignore`; lee y valida la variable en el módulo de entorno existente (`src/lib/env.ts` o equivalente), con el valor por defecto `./var/uploads` fuera de producción
- [X] T004 [P] Añade el volumen `petcare-uploads` montado en `/app/var/uploads`, con `UPLOADS_DIR=/app/var/uploads`, en `deploy/docker-compose.prod.yml`, y crea el directorio con propietario `petcare` en el `Dockerfile` antes de `USER petcare`

---

## Phase 2: Foundational (prerrequisitos de todas las historias)

**Purpose**: esquema, guardia, auditoría, navegación y helpers de test.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta terminar esta fase.

- [X] T005 Amplía `src/db/schema.ts` según data-model.md: enum `stock_movement_reason`, tabla `stock_movements`, `products.image_width/image_height` con su CHECK, `order_status_history.admin_id`, valor `order_status` en `outbox_kind` e índice `orders_created_at_idx`
- [X] T006 Genera `drizzle/0007_admin_store.sql` con `drizzle-kit` y añade a mano: `ALTER TYPE outbox_kind ADD VALUE 'order_status'` y el backfill de un movimiento `initial` por producto (`delta = 0`, `stock_after = stock`, nota "Saldo al activar el panel"); aplícala en las bases de datos de desarrollo (5434) y de pruebas (5433) (depende de T005)
- [X] T007 [P] Crea `src/domain/vat.ts` con `VAT_RATES = [0, 4, 10, 21] as const` y su tipo, y usa la constante en los CHECK y esquemas existentes que repitan esos valores
- [X] T008 [P] Amplía `src/lib/admin/audit.ts` (G14): acciones `product.*`, `stock.adjust`, `order.status`, `order.cancel`, `order.refund_retry`, `discount.*`; entidades `product`, `order` y `discount_code`; claves de `AUDIT_CHANGE_KEYS` (`description_changed`, `delta`, `reason`, `from`, `to`, `code`, campos de producto)
- [X] T009 [P] Añade "Productos", "Pedidos" y "Descuentos" a `ITEMS` en `src/components/admin/AdminNav.tsx` (con `also` para sus subrutas) y las claves de aviso nuevas de contracts/routes.md en `src/components/admin/AdminNotice.tsx`
- [X] T010 [P] Amplía `adminRouteExists` en `src/db/queries/admin-visibility.ts` para `/admin/productos/[id]`, `/admin/productos/[id]/stock`, `/admin/pedidos/[id]` y `/admin/pedidos/[id]/cancelar` (uuid válido y fila existente; en otro caso, 404) (G15)
- [X] T011 [P] Crea `src/domain/store-schemas.ts` con los helpers comunes (`eurosToCents`, booleano de casilla, uuid) reutilizando `formObject` y `adminFieldErrors` de `src/domain/admin-schemas.ts`
- [X] T012 [P] Amplía los helpers de test: en `tests/integration/helpers/checkout.ts`, `inClinicOrder()`, `orderInStatus(status, { delivery })` y `adminCtx()`; en `tests/e2e/fixtures.ts`, `loginAs admin` si aún no cubre la tienda; y un `UPLOADS_DIR` temporal por suite en `tests/integration/helpers/uploads.ts`
- [X] T013 Añade un test de migración en `tests/integration/migration-0007.test.ts`: el backfill crea un movimiento por producto y `outbox_kind` admite `order_status` (depende de T006)

**Checkpoint**: esquema migrado, navegación visible y helpers listos.

---

## Phase 3: User Story 1 - Crear, editar y desactivar productos (Priority: P1) 🎯 MVP

**Goal**: el administrador da de alta, edita, desactiva y reactiva productos con foto, y el
catálogo lo refleja en la siguiente consulta.

**Independent Test**: crear un producto con foto y verlo en `/productos/<slug>`; cambiar el
precio; desactivarlo (404 y no disponible en el carrito); reactivarlo.

### Tests for User Story 1 ⚠️

- [X] T014 [P] [US1] Test unitario del esquema de producto en `tests/unit/store-schemas.test.ts`: límites de cada campo, "Oferta" sin precio anterior o con precio anterior ≤ actual, `pet_ids` vacío, `image_alt` obligatorio con foto y IVA fuera de `VAT_RATES`
- [X] T015 [P] [US1] Test unitario del loader de las imágenes subidas en `tests/unit/product-image-loader.test.ts`: elige 480, 960 o 1440 según el ancho pedido y deja intactas las rutas `media/…`
- [X] T016 [P] [US1] Test de integración en `tests/integration/admin-product-images.test.ts`: un JPEG con EXIF y GPS da tres WebP sin metadatos y sin ampliar; un `.txt` renombrado, un GIF, un archivo de más de 5 MB o de más de 40 MP se rechazan; una foto sustituida borra sus archivos antiguos tras el commit
- [X] T017 [P] [US1] Test de integración en `tests/integration/admin-products.test.ts`: alta con movimiento `initial` y registro de auditoría; slug único y que no cambia al renombrar; nombre repetido (sin distinguir mayúsculas) da error de campo; editar el precio no altera `order_items`; desactivar un producto con pedidos (los pedidos siguen completos y `catalogRouteExists` da falso); reactivar
- [X] T018 [P] [US1] Test de integración de la ruta de fotos en `tests/integration/uploads-route.test.ts`: 200 con `image/webp`, `immutable` y `nosniff` con un nombre válido; 404 con nombres con `..`, otra extensión, otro ancho o un archivo ausente
- [X] T019 [P] [US1] E2E en `tests/e2e/008-us1-products.spec.ts`: alta con foto y "Novedad", visible en el listado y la ficha; con el producto en un carrito, cambiar el precio y ver el nuevo en el carrito, y desactivarlo y verlo como no disponible; comprobar el 404 de su ficha; reactivar; también con el perfil sin JavaScript; axe sin incumplimientos

### Implementation for User Story 1

- [X] T020 [P] [US1] Completa `productSchema` en `src/domain/store-schemas.ts` con las reglas de data-model.md (producto), incluido `on_sale` → `compare_at > price` (G3)
- [X] T021 [P] [US1] Implementa `src/lib/admin/product-images.ts` (G4): tope de 5 MB antes de decodificar; `sharp(buffer, { limitInputPixels: 40e6, failOn: 'error' })`; formatos detectados `jpeg`, `png` y `webp`; `.rotate()`; sin metadatos; variantes WebP 480, 960 y 1440 (calidad 80, `withoutEnlargement`); escritura atómica en `${UPLOADS_DIR}/productos/<uuid>-<ancho>.webp`; devuelve `{ imagePath, width, height }`, y `removeProductImageFiles(imagePath)` borra con fallo tolerado y registrado
- [X] T022 [US1] Implementa `saveProduct` y `setProductPublished` en `src/lib/admin/products.ts` (G2): transacción con `FOR UPDATE` al editar; slug con `uniqueSlug(slugify(name))` solo al crear; `search_name`; `product_pet_links` reemplazados; `compare_at_cents = null` si no hay "Oferta"; stock inicial con movimiento `initial` solo al crear; foto nueva o eliminada (archivos antiguos borrados después del commit); `recordAdminAction` con `diffChanges`; devuelve `{ status: ok|not_found|invalid|error }` (depende de T020 y T021)
- [X] T023 [P] [US1] Crea `src/db/queries/admin-products.ts`: `listProductsAdmin({ q, categoryId, petId, state, page })` (25 por página, con `stock` y las unidades reservadas sumadas de los pedidos `held`), `getProductAdmin(id)` y `listCategoriesAndPetsAdmin()` (incluidas las ocultas)
- [X] T024 [P] [US1] Añade a `design/styles.css`, solo con tokens, `.admin-thumb` e `.image-field` (vista previa y casilla "Quitar foto"), y comprueba que `npm run check:design` pasa
- [X] T025 [US1] Crea `src/components/admin/ProductForm.tsx`: todos los campos con `<label>`, errores con `aria-describedby`, resumen con `role="alert"`, selección múltiple de mascotas con casillas en un `<fieldset>`, `<input type="file" accept="image/jpeg,image/png,image/webp">`, IVA desde `VAT_RATES`, stock inicial solo en el alta y en la edición en solo lectura con enlace a `/stock`; si el formulario vuelve con errores y se había elegido una foto, un aviso junto al campo pide volver a elegirla (FR-025) (depende de T020 y T024)
- [X] T026 [US1] Crea las páginas `src/app/admin/productos/page.tsx` (lista con filtros por GET y paginación), `src/app/admin/productos/nuevo/page.tsx` y `src/app/admin/productos/[id]/page.tsx` (edición, con Desactivar o Reactivar como formularios propios), según contracts/routes.md (depende de T023 y T025)
- [X] T027 [US1] Crea `src/app/admin/productos/actions.ts` con `saveProduct` y `setProductPublished`: `await requireAdmin()`, `panelToken`, Zod, la llamada a `src/lib/admin/products.ts`, `revalidatePath` de `/productos` y de la ficha, y POST-Redirect-GET con `?aviso=`; registra las dos acciones y las tres páginas en `src/lib/admin/actions-list.ts` (depende de T022 y T026)
- [X] T028 [P] [US1] Crea el route handler `src/app/media/subidas/productos/[file]/route.ts` según contracts/routes.md (lista blanca por expresión regular, lectura de `UPLOADS_DIR` y cabeceras de caché)
- [X] T029 [US1] Crea `src/components/ProductImage.tsx`, la imagen común que usarán `src/components/ProductCard.tsx` y `src/app/productos/[slug]/page.tsx`: `loader` propio y `sizes` para las rutas `subidas/…` con `image_width/height`, y las SVG de la demo sin cambios (depende de T028)

**Checkpoint**: US1 se puede demostrar sola; pasan T014–T019.

---

## Phase 4: User Story 2 - Ver la lista de pedidos filtrada por estado (Priority: P1)

**Goal**: lista paginada de pedidos con pestañas de estado y su recuento, búsqueda por número y
detalle completo.

**Independent Test**: con pedidos en los siete estados, cada filtro devuelve los suyos con el
recuento correcto; el detalle muestra todos los datos.

### Tests for User Story 2 ⚠️

- [X] T030 [P] [US2] Test de integración en `tests/integration/admin-orders-list.test.ts`: orden por fecha descendente, paginación de 25, filtro por cada estado, recuentos, búsqueda por prefijo del número (sin distinguir mayúsculas ni espacios), pedido anonimizado sin contacto, y `volver` que solo acepta `/admin/pedidos?…`
- [X] T031 [P] [US2] E2E en `tests/e2e/008-us2-orders-list.spec.ts`: pestañas con `aria-current`, el filtro se conserva al volver del detalle, estado vacío, y axe con y sin JavaScript

### Implementation for User Story 2

- [X] T032 [P] [US2] Crea `src/db/queries/admin-orders.ts`: `listOrdersAdmin({ status, number, page })`, `countOrdersByStatus()` y `getOrderAdmin(id)` (líneas, descuento, envío, totales e IVA, contacto, pago, reembolso e historial con el nombre del autor vía `admin_id`, o "Clínica (CLI)" si es nulo)
- [X] T033 [P] [US2] Añade `.admin-filters` a `design/styles.css` (pestañas de estado con recuento, solo tokens) y la correspondencia de estado a color de `.badge` de G16, con un token nuevo solo si falta
- [X] T034 [P] [US2] Crea `src/components/admin/OrderFilters.tsx` (`<nav>` con enlaces por estado, `aria-current="page"` y recuento en texto) y `src/components/admin/OrderDetail.tsx` (secciones con encabezados, `<time>` e historial con `statusLabel`)
- [X] T035 [US2] Crea `src/app/admin/pedidos/page.tsx` (lista con `table.orders--stack`, búsqueda por GET y estado vacío) y `src/app/admin/pedidos/[id]/page.tsx` (detalle con enlace "Volver" a `volver` validado), y regístralas en `ADMIN_PAGES` (depende de T032 y T034)

**Checkpoint**: US2 se puede demostrar sola; pasan T030–T031.

---

## Phase 5: User Story 3 - Cambiar el estado de un pedido (Priority: P1)

**Goal**: avanzar un pedido por su ciclo de vida o cancelarlo, con correo al comprador, autor en
el historial, reembolso y control de concurrencia.

**Independent Test**: llevar un pedido con envío y otro con recogida hasta "Entregado" con un
correo por paso; cancelar uno pagado y comprobar el reembolso; un pedido enviado no ofrece
"Cancelar".

### Tests for User Story 3 ⚠️

- [X] T036 [P] [US3] Test unitario en `tests/unit/order-status.test.ts`: `allowedTransitions(order, 'clinic', now)` para cada estado y combinación de envío y pago; sin `cancelled` desde `shipped` ni desde `delivered`
- [X] T037 [P] [US3] Test unitario de la plantilla en `tests/unit/order-status-email.test.ts`: asunto, variantes `preparing`, `shipped` (plazo y dirección), `ready_for_pickup` (dirección y horario de la clínica desde la entrada), `delivered` y `combined`; sin el motivo interno; HTML escapado y versión en texto
- [X] T038 [P] [US3] Test de integración en `tests/integration/admin-orders.test.ts`: cada transición permitida escribe el historial con `actor = 'clinic'` y `admin_id`, encola `order_status` y deja registro de auditoría; una transición no permitida no cambia nada; un `from` desactualizado da `pedido-cambiado`; cancelar un pedido pagado (proveedor `fake`) libera el stock con movimiento `order_released`, libera el uso del código, reembolsa y encola `order_cancelled` sin el motivo; cancelar un enviado se rechaza; `retryRefundAdmin` solo actúa con `refund_status = 'failed'`
- [X] T039 [P] [US3] Amplía `tests/integration/orders-cli.test.ts`: un cambio a `shipped` hecho desde la CLI encola `order_status` y deja `admin_id` nulo
- [X] T040 [P] [US3] E2E en `tests/e2e/008-us3-orders.spec.ts`: avanzar un pedido de tarjeta hasta "Entregado" y verlo en "Mis pedidos" del comprador; cancelar otro con motivo en `/cancelar`; también sin JavaScript; axe

### Implementation for User Story 3

- [X] T041 [US3] Añade `allowedTransitions(order, actor, now)` en `src/domain/order-status.ts`, derivada de `ORDER_TRANSITIONS` (G7)
- [X] T042 [US3] Amplía `transitionOrder` en `src/lib/orders/transition.ts`: opción `adminId` (guardada en `order_status_history.admin_id`), opción `expectedFrom` (comparada tras `lockOrder`, con el error `StaleOrderError`) y encolado de `order_status` cuando `actor = 'clinic'` y el destino es `paid`, `preparing`, `shipped`, `ready_for_pickup` o `delivered`, salvo con `skipEmail`; el tipo de correo se añade en `src/lib/orders/emails.ts` (depende de T041)
- [X] T043 [P] [US3] Crea la plantilla `src/email/templates/order-status.ts` según contracts/emails.md, reutilizando `order-common.ts` (enlace al pedido) y los datos de la clínica de la base de datos, y regístrala en el despachador de la bandeja de salida para el tipo `order_status`
- [X] T044 [US3] Añade los movimientos `order_reserved` y `order_released` en `src/lib/checkout/reserve.ts` (`reserveStock`) y en las funciones `releaseOrderStock` y `reserveOrderStock` de `src/lib/orders/`, dentro de sus transacciones y con `stock_after` (G5)
- [X] T045 [US3] Implementa `src/lib/admin/orders.ts`:
  - `setOrderStatusAdmin` (comprueba `allowedTransitions` y llama a `transitionOrder` con `expectedFrom` y `adminId`);
  - `cancelOrderAdmin` (motivo de 3 a 200 caracteres, `cancelOrder(…, 'clinic', { reason: 'clinic', note })` con `expectedFrom`);
  - `retryRefundAdmin` (solo con `failed`: reinicia los intentos y llama a `refundOrder`);
  - cada uno con `recordAdminAction` y `sendEmailsSoon`.
  (depende de T042)
- [X] T046 [US3] Muestra en `src/components/admin/OrderDetail.tsx` un formulario por cada transición de `allowedTransitions` (con `from` oculto y botón marino), el enlace "Cancelar pedido" a `/cancelar` (`.btn--ghost`) y "Reintentar reembolso" si `refund_status = 'failed'` (depende de T034 y T041)
- [X] T047 [US3] Crea `src/app/admin/pedidos/[id]/cancelar/page.tsx` (confirmación, aviso de reembolso si estaba pagado y motivo con su `<label>`) y `src/app/admin/pedidos/actions.ts` con `setOrderStatusAdmin`, `cancelOrderAdmin` y `retryRefundAdmin` (cada una empieza por `await requireAdmin()`, con `panelToken` y PRG con los avisos de contracts/routes.md); registra las acciones y la página en `actions-list.ts` (depende de T045 y T046)

**Checkpoint**: las tres historias P1 funcionan; pasan T036–T040 y los tests de flujos críticos
(`checkout-concurrency`, `payment-webhook`, `refunds` y `orders-maintain`).

---

## Phase 6: User Story 4 - Ajustar el stock manualmente (Priority: P2)

**Goal**: sumar o restar unidades con motivo, sin bajar nunca de cero, y con historial.

**Independent Test**: sumar a un producto agotado y verlo "En stock"; restar más de lo disponible
y ver el máximo; revisar el historial.

### Tests for User Story 4 ⚠️

- [X] T048 [P] [US4] Test unitario de `stockAdjustSchema` en `tests/unit/store-schemas.test.ts`: `delta` distinto de 0 y dentro de los límites, `reason` válido y `note` obligatoria con `other`
- [X] T049 [P] [US4] Test de integración en `tests/integration/admin-stock.test.ts`: el ajuste suma, resta y escribe el movimiento con `admin_id`; restar de más devuelve `insufficient` con el máximo; 20 ajustes y reservas simultáneos (`reserveStock` en paralelo) nunca dejan el stock negativo y la suma de movimientos cuadra con `stock`
- [X] T050 [P] [US4] E2E en `tests/e2e/008-us4-stock.spec.ts`: ajuste e historial, aviso de stock insuficiente, perfil sin JavaScript y axe

### Implementation for User Story 4

- [X] T051 [P] [US4] Añade `stockAdjustSchema` a `src/domain/store-schemas.ts`
- [X] T052 [US4] Implementa `adjustStock` en `src/lib/admin/stock.ts` (G5): UPDATE condicionado `stock + delta >= 0 RETURNING stock`, movimiento y `recordAdminAction` en la misma transacción; devuelve `{ status: 'ok' } | { status: 'insufficient', max }` (depende de T051)
- [X] T053 [P] [US4] Añade `listStockMovements(productId, limit = 50)` a `src/db/queries/admin-products.ts` y `.stock-history` a `design/styles.css`, solo con tokens
- [X] T054 [US4] Crea `src/components/admin/StockAdjust.tsx` y `src/app/admin/productos/[id]/stock/page.tsx` (disponible, reservado, formulario e historial con motivo en texto); añade `adjustStock` a `src/app/admin/productos/actions.ts` (`requireAdmin`, PRG con `stock-ajustado` o `stock-insuficiente&max=N`) y regístralos en `actions-list.ts` (depende de T052 y T053)

**Checkpoint**: US4 se puede demostrar sola; pasan T048–T050.

---

## Phase 7: User Story 5 - Confirmar el pago de un pedido de "Pago en clínica" (Priority: P2)

**Goal**: marcar como pagado un pedido con pago en clínica, o pagado y entregado en un solo paso.

**Independent Test**: confirmar el pago (estado "Pagado", reserva confirmada, ya no caduca y un
correo); confirmar pago y entrega (dos filas en el historial y un solo correo).

### Tests for User Story 5 ⚠️

- [X] T055 [P] [US5] Amplía `tests/unit/order-status.test.ts`: `pending_payment → paid` para `clinic` solo con `in_clinic` y `pickup_deadline > now`; nunca con tarjeta
- [X] T056 [P] [US5] Test de integración en `tests/integration/admin-in-clinic.test.ts`: confirmar pago (reserva `committed`, `paid_at`, correo `paid`, `runOrdersMaintenance` ya no lo cancela); confirmar pago y entrega (historial `paid` y `delivered` y un solo correo `combined`); un pedido caducado o cancelado da `pedido-no-vigente`; carrera entre la confirmación y `runOrdersMaintenance`, en la que solo gana una
- [X] T057 [P] [US5] E2E en `tests/e2e/008-us5-in-clinic.spec.ts`: compra con recogida y pago en clínica y "Confirmar pago y entrega" desde el detalle; perfil sin JavaScript y axe

### Implementation for User Story 5

- [X] T058 [US5] Añade a `ORDER_TRANSITIONS`, en `src/domain/order-status.ts`, la fila `pending_payment → paid` (actor `clinic`, `when: payment_method === 'in_clinic' && pickup_deadline > now`) (G7)
- [X] T059 [US5] Implementa `confirmInClinicPayment` en `src/lib/admin/orders.ts`: dentro de una transacción, `transitionOrder` a `paid` (con `skipEmail` si `deliver`) y, si `deliver`, a `delivered` con el correo `combined`; con `expectedFrom`, `adminId` y `recordAdminAction` (depende de T058)
- [X] T060 [US5] Añade al detalle (`OrderDetail.tsx`) los botones "Confirmar pago" y "Confirmar pago y entrega" solo para `in_clinic` pendiente y vigente, y la acción `confirmInClinicPayment` a `src/app/admin/pedidos/actions.ts` (`requireAdmin`, PRG con `pago-confirmado`, `pago-y-entrega` o `pedido-no-vigente`), registrada en `actions-list.ts` (depende de T059)

**Checkpoint**: US5 se puede demostrar sola; pasan T055–T057 y `orders-maintain`.

---

## Phase 8: User Story 6 - Crear y desactivar códigos de descuento (Priority: P3)

**Goal**: alta de códigos con sus condiciones y activación o desactivación; nunca se editan.

**Independent Test**: crear `VERANO10`, aplicarlo en el carrito, desactivarlo y comprobar que se
retira con aviso; los pedidos confirmados conservan su descuento.

### Tests for User Story 6 ⚠️

- [X] T061 [P] [US6] Test unitario en `tests/unit/discount.test.ts`: `discountState` en el orden de data-model.md (`disabled`, `scheduled`, `expired`, `exhausted` y `active`), con límites de fecha en `Europe/Madrid`
- [X] T062 [P] [US6] Amplía `tests/unit/store-schemas.test.ts` con `discountSchema`: normalización del código, porcentaje de 1 a 100, importe mayor que 0, fin anterior al inicio y opcionales mayores que 0
- [X] T063 [P] [US6] Test de integración en `tests/integration/admin-discounts.test.ts`: alta y registro de auditoría; código repetido en minúsculas da error de campo; desactivar retira el código del carrito con el aviso de `resolveCartDiscount` y no cambia los pedidos confirmados; reactivar un código caducado sigue sin aplicarse
- [X] T064 [P] [US6] E2E en `tests/e2e/008-us6-discounts.spec.ts`: alta y lista con estados; perfil sin JavaScript y axe

### Implementation for User Story 6

- [X] T065 [P] [US6] Añade `discountState(code, now)` y sus etiquetas a `src/domain/discount.ts`, compartiendo las reglas con `validateDiscount` (G12)
- [X] T066 [P] [US6] Añade `discountSchema` a `src/domain/store-schemas.ts` (fechas a `starts_at` a las 00:00 y `ends_at` a las 23:59:59 en `Europe/Madrid` con Temporal)
- [X] T067 [US6] Implementa `createDiscountCode` y `setDiscountEnabled` en `src/lib/admin/discounts.ts` (`isUniqueViolation` → error de campo y `recordAdminAction`) y `listDiscountCodesAdmin()` en `src/db/queries/admin-discounts.ts` (depende de T065 y T066)
- [X] T068 [US6] Crea `src/components/admin/DiscountForm.tsx`, `src/app/admin/descuentos/page.tsx` (lista con estado en texto y usos frente al límite, y botón Desactivar o Reactivar), `src/app/admin/descuentos/nuevo/page.tsx` y `src/app/admin/descuentos/actions.ts` (`requireAdmin` y PRG), registrados en `actions-list.ts` (depende de T067)

**Checkpoint**: las seis historias funcionan.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T069 Cambia `loadContent` en `src/content/load.ts` y `scripts/content-load.ts` según contracts/cli-and-content.md (G13): opción `forceShop` (`--force-shop`); sin ella, productos y códigos solo se crean, con movimiento `initial`, y no se despublican ni desactivan los ausentes; con ella, se restaura todo con movimientos `content_load`; resumen de creados, conservados y restaurados; reconstruye `cli/content-load.mjs` con `scripts/build-cli.mjs`
- [X] T070 Amplía `tests/integration/content-load-seed.test.ts`: un producto creado en el panel y un stock ajustado sobreviven a una recarga sin `--force-shop`; con `--force-shop` se restauran, el ausente se despublica y queda el movimiento `content_load`; los códigos siguen la misma regla (depende de T069)
- [X] T071 [P] Amplía `tests/integration/admin-authz.test.ts` si hace falta, para cubrir las acciones con archivo (multipart) y las 9 páginas nuevas, y comprueba que pasa con todas las entradas nuevas de `ADMIN_ACTIONS` y `ADMIN_PAGES` (SC-001)
- [X] T072 [P] E2E de accesibilidad en `tests/e2e/008-a11y.spec.ts`: axe en todas las rutas nuevas de contracts/routes.md, con y sin JavaScript, navegación solo con teclado y foco visible tras cada aviso (SC-007)
- [X] T073 [P] Añade a la configuración de Lighthouse CI una URL de ficha con una foto subida (sembrada en la preparación de la CI) y comprueba que el catálogo sigue en 90 o más (SC-008)
- [X] T074 [P] Actualiza `deploy/README.md`: volumen `petcare-uploads` y su copia de seguridad, `UPLOADS_DIR`, la regla nueva de `content:load` y `--force-shop`, y que `npm run orders` ahora envía correos de estado
- [X] T075 [P] Revisa que los logs de `src/lib/admin/` y `src/lib/orders/` no incluyen correo, dirección ni el nombre original del archivo (G17), y que no queda `style=""` ni ningún CSS fuera de `design/` (`npm run lint`)
- [X] T076 Actualiza CLAUDE.md ("Estado actual": feature 008 implementada, migración `0007_admin_store`, `UPLOADS_DIR`, `--force-shop`) y anota las desviaciones en `specs/008-admin-store-panel/checklists/requirements.md`
- [X] T077 Ejecuta las pruebas filtradas de [quickstart.md](./quickstart.md), los flujos críticos tocados y Lighthouse, y recorre el quickstart manual completo

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (fase 1)**: sin dependencias.
- **Foundational (fase 2)**: depende de la fase 1 y bloquea todas las historias.
- **US1 (fase 3)**: depende solo de la fase 2.
- **US2 (fase 4)**: depende solo de la fase 2.
- **US3 (fase 5)**:
  - depende de la fase 2 y usa el detalle de US2 (T034 y T035);
  - si se hace antes que US2, crea primero `OrderDetail.tsx` y la página del detalle.
- **US4 (fase 6)**: depende de la fase 2. Usa la página de edición de US1 solo para el enlace;
  la página `/stock` funciona por sí sola.
- **US5 (fase 7)**: depende de US3 (`transitionOrder` con `expectedFrom`, `adminId` y el correo
  `order_status`).
- **US6 (fase 8)**: depende solo de la fase 2.
- **Polish (fase 9)**: T069 y T070 pueden hacerse tras la fase 2; el resto, al final.

### Within Each User Story

- Primero los tests, que deben fallar.
- Después el dominio puro (`src/domain/`), las consultas y la lógica en `src/lib/admin/`, los
  componentes y las páginas, y por último las acciones con su registro en `actions-list.ts`.
- Cada acción nueva empieza por `await requireAdmin()`.

### Parallel Opportunities

- **Fase 1**: T002, T003 y T004.
- **Fase 2**: T007–T012, tras T005 y T006.
- **US1**: los tests T014–T019; después T020, T021, T023, T024 y T028.
- **US2 y US6**: se pueden hacer a la vez que US1, porque no comparten archivos salvo
  `actions-list.ts`, `design/styles.css` y `store-schemas.ts`, que conviene fusionar en orden.
- **US3**: T036–T040 en paralelo; T043 y T044 en paralelo con T041 y T042.

---

## Parallel Example: User Story 1

```bash
# Tests (deben fallar):
T014 tests/unit/store-schemas.test.ts
T015 tests/unit/product-image-loader.test.ts
T016 tests/integration/admin-product-images.test.ts
T017 tests/integration/admin-products.test.ts
T018 tests/integration/uploads-route.test.ts
T019 tests/e2e/008-us1-products.spec.ts

# Implementación independiente:
T020 src/domain/store-schemas.ts
T021 src/lib/admin/product-images.ts
T023 src/db/queries/admin-products.ts
T024 design/styles.css
T028 src/app/media/subidas/productos/[file]/route.ts
```

---

## Implementation Strategy

### MVP First

1. Fases 1 y 2.
2. US1 (productos): cierra la excepción del principio VIII para el catálogo y se puede demostrar
   sola.
3. **Parar y validar** con el quickstart (paso 1) y Lighthouse.

### Incremental Delivery

1. US1, luego US2 (lista de pedidos) y luego US3 (cambios de estado), con lo que la gestión diaria
   de la tienda queda completa (P1).
2. US4 (stock) y US5 (pago en clínica), las dos P2.
3. US6 (descuentos), la P3.
4. Fase 9: `content:load` sin sobrescribir, accesibilidad, despliegue y documentación.

---

## Notes

- `[P]` significa archivos distintos y sin dependencias pendientes.
- Hacer commit solo cuando el usuario lo pida (CLAUDE.md).
- No ejecutar la batería completa en local; la CI la pasa en cada cambio.
- Las desviaciones respecto al plan se anotan en `checklists/requirements.md`.
