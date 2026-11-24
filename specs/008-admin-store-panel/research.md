# Research: Panel de administración de la tienda (feature 008)

Decisiones **G1–G18** de la feature 008. Siguen vigentes las R1–R17 (001), A1–A14 (002), B1–B17
(003), C1–C16 (004), D1–D20 (005), E1–E18 (006) y F1–F18 (007). No quedan incógnitas abiertas.
La única dependencia que pasa a declararse es `sharp`, que ya está instalada como dependencia
opcional de Next (G4).

## G1. Módulos del panel: Productos, Pedidos y Descuentos

- **Decision**: tres entradas nuevas en `ITEMS` de `AdminNav`, después de las de la agenda.
  - Las rutas cuelgan de `/admin/productos`, `/admin/pedidos` y `/admin/descuentos` (ver
    [contracts/routes.md](contracts/routes.md)).
  - Se mantiene el patrón de la 007:
    - `requireAdmin()` en el layout y al principio de cada acción;
    - cada acción y página se registra en `ADMIN_ACTIONS` o `ADMIN_PAGES`;
    - `panelToken` para el envío;
    - Zod en `src/domain/admin-schemas.ts` (o un archivo hermano `store-schemas.ts`);
    - lógica en `src/lib/admin/`;
    - respuesta con POST-Redirect-GET y `?aviso=`.
- **Rationale**: FR-001 pide la misma guardia y el mismo registro. `admin-authz.test.ts` cubre las
  rutas nuevas solo con añadirlas a las listas (SC-001).
- **Alternatives considered**: un segundo panel `/tienda-admin` con su propio layout, que
  duplicaría la guardia, la navegación y el middleware.

## G2. Productos: la tabla `products` de siempre, sin borrado

- **Decision**:
  - Alta y edición sobre `products` y `product_pet_links`, en una transacción con
    `SELECT … FOR UPDATE` del producto al editar.
  - El slug sale de `uniqueSlug(slugify(name))` al crear y no se edita (FR-005); `search_name` se
    recalcula con el nombre.
  - "Desactivar" y "Reactivar" cambian `published`, cada uno con su acción. No existe ninguna
    acción de borrado (FR-007).
  - Las categorías y mascotas que se ofrecen son todas las de la tabla, con las no publicadas
    marcadas "(oculta)". El IVA sale de la lista legal `VAT_RATES = [0, 4, 10, 21]` de
    `src/domain/`, que coincide con el CHECK existente.
  - La "posición en Destacados" es `position`.
- **Rationale**: el catálogo público ya filtra con `publishedProducts()` y el middleware da 404
  con `catalogRouteExists`. El carrito ya trata como no disponible un producto no visible
  (`unavailable`) y `reserveStock` rechaza los no publicados. Desactivar no necesita lógica nueva
  en el lado público.
- **Alternatives considered**: el borrado lógico con `deleted_at`, que es redundante con
  `published`, porque la spec no distingue "borrado" de "desactivado".

## G3. "Oferta" = precio anterior presente

- **Decision**: la casilla "Oferta" del formulario exige `compare_at_cents > price_cents` (FR-004).
  Al desmarcarla se guarda `compare_at_cents = null`. No se añade columna: el catálogo ya muestra
  la oferta cuando hay precio anterior.
- **Rationale**: el comportamiento visible es el de la spec (sin marca no hay precio tachado) sin
  tocar el catálogo público ni su Lighthouse.
- **Alternatives considered**: una columna `on_sale` que conserve el precio anterior. Obliga a
  cambiar las consultas públicas y el YAML para guardar un dato que nadie ve.

## G4. Fotos: subida con `sharp`, tres anchos WebP y un volumen propio

- **Decision**:
  - **Entrada**: un `<input type="file" accept="image/jpeg,image/png,image/webp">` dentro del
    formulario del producto. Sin JavaScript, el formulario se envía como multipart.
  - **Límite de tamaño**: `experimental.serverActions.bodySizeLimit: '6mb'` en `next.config.ts`.
    El tope de 5 MB del archivo se comprueba en la acción.
  - **Procesado** (`src/lib/admin/product-images.ts`):
    - `sharp(buffer, { limitInputPixels: 40e6, failOn: 'error' })` decodifica la imagen, lo que
      prueba que es real. Solo se aceptan los formatos detectados `jpeg`, `png` y `webp`, no el
      tipo MIME declarado.
    - `.rotate()` la endereza y se descartan todos los metadatos (EXIF y GPS).
    - Genera tres anchos WebP (480, 960 y 1440 px, sin ampliar nunca), con calidad 80.
  - **Almacenamiento**: `${UPLOADS_DIR}/productos/<uuid>-<ancho>.webp`, con escritura atómica
    (temporal más `rename`). `image_path = 'subidas/productos/<uuid>'`, y se guardan
    `image_width` e `image_height` del ancho mayor.
  - **Servicio**: el route handler `GET /media/subidas/productos/[file]` solo acepta
    `^[0-9a-f-]{36}-(480|960|1440)\.webp$`. Responde con
    `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable` y `nosniff`;
    cualquier otro nombre da 404.
  - **Uso en el catálogo**: `ProductImage` usa `next/image` con un `loader` propio para las rutas
    `subidas/…`, que elige el ancho más cercano. Así genera `srcset` sin el optimizador en tiempo
    de ejecución. Las SVG de la demo siguen como hasta ahora.
  - **Sustitución**: al cambiar o quitar la foto, los archivos antiguos se borran después del
    commit, con un fallo tolerado y registrado. Un archivo huérfano nunca rompe una página.
  - **Producción**: volumen `petcare-uploads` montado en `/app/var/uploads` (`UPLOADS_DIR`),
    propiedad de `petcare` e incluido en la copia de seguridad que documenta `deploy/README.md`.
    En local, `./var/uploads`, ignorado por git. Los tests usan un directorio temporal.
- **Rationale**:
  - FR-006 exige comprobar que es una imagen real, quitar los metadatos (privacidad: el GPS de
    las fotos del móvil) y generar tamaños.
  - `public/` va dentro de la imagen de Docker y no admite archivos nuevos.
  - Tres anchos fijos mantienen el Lighthouse del catálogo (SC-008) sin depender de la caché de
    `/_next/image` en un contenedor no root.
  - `sharp` ya viene con `next` (`optionalDependencies`); declararlo fija la versión.
- **Alternatives considered**:
  - guardar la imagen en PostgreSQL, que infla la base de datos y las copias;
  - S3 u otro almacenamiento externo, que es un tercero nuevo, con más configuración y coste;
  - el optimizador de Next sobre una ruta local, que necesita una caché escribible y una petición
    interna por tamaño;
  - aceptar la imagen tal cual tras mirar sus bytes mágicos, que no quita los metadatos ni genera
    tamaños.

## G5. Stock: `products.stock` es el disponible y se añade `stock_movements`

- **Decision**:
  - `products.stock` sigue siendo el stock **disponible**: `reserveStock` ya lo descuenta al
    confirmar el checkout y `releaseOrderStock` lo devuelve al cancelar.
  - El panel muestra también las unidades **reservadas**: la suma de `order_items.quantity` de los
    pedidos con `reservation_status = 'held'`.
  - La tabla nueva `stock_movements` registra cada cambio con su motivo:
    - `initial`: el alta;
    - `restock`, `count`, `damage` y `other`: los ajustes;
    - `order_reserved` y `order_released`: los pedidos;
    - `content_load`: la carga de datos con `--force-shop`.
  - Los inserts se añaden en `reserveStock`, `releaseOrderStock` y `reserveOrderStock`, dentro de
    sus transacciones.
  - Ajuste manual:
    `UPDATE products SET stock = stock + $delta WHERE id = $id AND stock + $delta >= 0 RETURNING stock`,
    más el movimiento en la misma transacción. Si no devuelve fila, se responde
    `?aviso=stock-insuficiente&max=<stock actual>`.
  - El stock del formulario de edición es de solo lectura: solo cambia por ajuste (FR-010).
- **Rationale**: el UPDATE condicionado es atómico frente a `reserveStock` (otro UPDATE
  condicionado sobre la misma fila), así que el stock nunca queda negativo (FR-011, SC-005). Como
  el disponible ya excluye lo reservado, "no bajar de lo reservado" equivale a "disponible ≥ 0"
  (US4, escenario 2).
- **Alternatives considered**:
  - stock como suma de movimientos, que cambiaría todas las consultas de la 004 y de la 005;
  - un `version` optimista en `products`, que rechazaría ajustes válidos que coinciden con una
    compra.
- **Backfill**: un movimiento `initial` por producto con su stock actual y la nota "Saldo al
  activar el panel".

## G6. Lista de pedidos

- **Decision**:
  - `src/db/queries/admin-orders.ts` con `listOrdersAdmin({ status?, number?, page })`.
  - Orden `created_at DESC`, 25 por página, con el índice existente sobre `orders(status)` más
    uno nuevo `orders(created_at DESC)`.
  - `countOrdersByStatus()` con `GROUP BY status`.
  - El número se busca en mayúsculas, sin espacios, por prefijo.
  - El filtro viaja en la query y el detalle recibe `?volver=` con la query de la lista, validada
    como `/admin/pedidos?…` para no abrir redirecciones.
  - Los pedidos anonimizados (`anonymized_at`) se listan con "Cliente eliminado" y sin datos de
    contacto.
- **Rationale**: US2 y FR-012 con una consulta indexada; el volumen esperado es de cientos de
  pedidos al año.

## G7. Transiciones: la tabla única de la 005, más el pago en clínica

- **Decision**:
  - Toda transición pasa por `transitionOrder` y `ORDER_TRANSITIONS`, sin lógica paralela. Se
    añade una fila: `pending_payment → paid`, actor `clinic`, con
    `when: payment_method = 'in_clinic' && pickup_deadline > now`.
  - `reservationEffect` ya pasa la reserva a `committed` al llegar a `paid`. Con eso se cumple la
    aclaración Q4: el stock queda descontado definitivamente al confirmar el pago.
  - El panel ofrece solo las transiciones que devuelve `allowedTransitions(order, 'clinic', now)`,
    una función nueva en `src/domain/order-status.ts` que filtra la tabla. Así, "Cancelar" no
    aparece en "Enviado" ni en "Entregado" (aclaración Q1).
  - "Confirmar pago y entrega" ejecuta en una transacción `paid` (con `skipEmail`) y después
    `delivered`: quedan dos filas en el historial y se envía un solo correo (US5, escenario 2).
- **Rationale**: FR-013 y FR-017. La CLI `npm run orders` comparte la tabla y gana la transición
  nueva sin código propio.

## G8. Concurrencia en pedidos: estado esperado

- **Decision**: cada formulario de pedido envía `from` (el estado que vio el administrador).
  Dentro de `lockOrder`, si `order.status !== from`, la acción no hace nada y redirige con
  `?aviso=pedido-cambiado` (US3, escenario 5). Lo mismo protege la carrera entre confirmar el
  pago y la caducidad automática.
- **Rationale**: los estados no vuelven atrás (el único ciclo, `cancelled → paid` del pago
  tardío, lo hace la pasarela), así que el estado basta como versión sin añadir columna.
- **Alternatives considered**: comparar `last_status_at`, que pierde precisión entre `Date` y
  `timestamptz`; añadir una columna `version`.

## G9. Autor de los cambios de la clínica

- **Decision**: la columna nueva `order_status_history.admin_id` (uuid, referencia a `customers`
  con `ON DELETE SET NULL`) guarda quién lo hizo, y el detalle la muestra como el nombre del
  administrador o "Clínica (CLI)". Cada cambio deja además una fila en `admin_audit_log`.
- **Rationale**: FR-014 pide el autor visible en el historial; el log de auditoría no se enseña
  en el detalle.

## G10. Cancelación por la clínica

- **Decision**: `cancelOrderAdmin` exige un motivo interno de 3 a 200 caracteres.
  - Se guarda en `order_status_history.note` y no se envía al comprador.
  - Llama a `cancelOrder(orderId, 'clinic', { reason: 'clinic', note })`, que ya libera el stock
    y el uso del código y, si estaba pagado, reembolsa con `refundOrder` y encola el aviso con o
    sin reembolso (FR-015).
  - Es una página de confirmación propia (`/cancelar`), como en la 007.
  - Si `refund_status = 'failed'` (tras 8 intentos), el detalle ofrece "Reintentar reembolso":
    `retryRefundAdmin` reinicia los intentos y llama a `refundOrder` (caso límite del reembolso
    fallido).
- **Rationale**: el motivo puede contener datos internos; el correo de la 005 ya explica la
  cancelación y el reembolso.

## G11. Correos de cambio de estado

- **Decision**:
  - Un tipo nuevo de la bandeja de salida, `order_status`, con la plantilla
    `src/email/templates/order-status.ts`. Tiene una variante por estado: `paid` (pago en
    clínica confirmado), `preparing`, `shipped` (plazo de entrega de `shop_settings.shipping_text`),
    `ready_for_pickup` (dirección y horario de la clínica desde la base de datos y el plazo de
    recogida) y `delivered`.
  - Si "Pagado" y "Entregado" se aplican en un solo paso, la variante `delivered` dice "Pago
    confirmado y pedido entregado".
  - `transitionOrder` lo encola cuando el actor es `clinic` y el destino es uno de esos estados.
    La cancelación sigue con `order_cancelled`.
  - El enlace es el de "Mis pedidos" o el enlace privado del invitado, con la misma función que
    `order-common.ts`.
- **Rationale**: FR-018 y la nota de la 005 ("los avisos de Enviado o Listo para recoger quedan
  para cuando exista el panel"). Se reutilizan la bandeja de salida, los reintentos y
  `sendEmailsSoon`. Como lo encola `transitionOrder`, la CLI también avisa (FR-017).
- **Alternatives considered**: un tipo de correo por estado, que daría cinco plantillas casi
  iguales.

## G12. Códigos de descuento: alta, desactivación y estado calculado

- **Decision**:
  - `createDiscountCode` valida con Zod:
    - código normalizado con `normalizeCode` (mayúsculas, `^[A-Z0-9]{3,20}$`, el CHECK
      existente) y único (`isUniqueViolation` → error junto al campo);
    - porcentaje de 1 a 100 o importe mayor que 0;
    - fechas en `Europe/Madrid`: el inicio a las 00:00 y el fin a las 23:59:59 del día, con el fin
      posterior o igual al inicio;
    - mínimo y usos opcionales mayores que 0.
  - `setDiscountEnabled(id, enabled)` es la única acción posterior: no hay edición (aclaración Q2).
  - `discountState(code, now)` es una función nueva y pura en `src/domain/discount.ts` que
    devuelve `disabled | scheduled | expired | exhausted | active` con las mismas reglas que
    `validateDiscount`.
- **Rationale**: el carrito ya retira con aviso los códigos no aplicables (`resolveCartDiscount`),
  y los pedidos copian el descuento (FR-022 sin código nuevo en el carrito).

## G13. `content:load` siembra la tienda y `--force-shop` la restaura

- **Decision**: siguiendo el patrón de `--force-booking` (F13):
  - **Sin `--force-shop`**:
    - productos y sus mascotas se insertan solo si el slug no existe, y nunca se sobrescriben;
    - no se llama a `unpublishMissing(products)`, así que los productos creados en el panel
      sobreviven;
    - los códigos de descuento se insertan solo si el código no existe, y ya no se desactivan los
      que faltan en el YAML.
  - **Con `--force-shop`**: se recupera el comportamiento anterior (upsert completo, despublicar
    los que faltan y desactivar los códigos ausentes). Cada stock cambiado deja un movimiento
    `content_load`. Las fotos subidas se sustituyen por la ruta del YAML, pero los archivos no se
    borran.
  - Categorías, mascotas, `shop_settings`, métodos de envío y de pago se siguen sobrescribiendo
    siempre (Complexity Tracking).
- **Rationale**: FR-023 y la experiencia de la 007. Sin este cambio, una recarga del YAML borraría
  el trabajo del panel.

## G14. Registro de acciones

- **Decision**: se amplían las listas cerradas de `src/lib/admin/audit.ts`:
  - acciones: `product.create`, `product.update`, `product.publish`, `product.unpublish`,
    `stock.adjust`, `order.status`, `order.cancel`, `order.refund_retry`, `discount.create`,
    `discount.enable` y `discount.disable`;
  - `entityType`: `product`, `order` y `discount_code`;
  - `AUDIT_CHANGE_KEYS`: los campos de producto (sin textos largos: para las descripciones solo se
    guarda `description_changed: true`), `delta`, `reason`, `from`, `to` y `code`.
  - Nunca se guardan los datos del comprador (FR-002).
- **Rationale**: es el mismo log de la 007, con un tamaño acotado.

## G15. Middleware y visibilidad

- **Decision**: `adminRouteExists` (`src/db/queries/admin-visibility.ts`) reconoce
  `/admin/productos/[id]`, `/admin/productos/[id]/stock`, `/admin/pedidos/[id]` y
  `/admin/pedidos/[id]/cancelar`; con un id inexistente o mal formado, devuelve 404 sin
  JavaScript. `next.config.ts` ya aplica `no-store` y `noindex` a `/admin/:path*`.
  `/media/subidas/:path*` es pública y se guarda en caché.

## G16. Interfaz: componentes solo con tokens

- **Decision**:
  - Se reutilizan `.side-nav`, `table.orders--stack`, `.badge*`, `.notice`, `.btn`, `.select`, los
    campos de formulario de la 002 y `AdminNotice`.
  - Componentes nuevos en `design/styles.css`, solo con tokens:
    - `.admin-filters`: pestañas de estado con su recuento, en un `<nav>` con `aria-current`;
    - `.admin-thumb`: miniatura de la lista;
    - `.image-field`: vista previa y casilla "Quitar foto";
    - `.stock-history`: tabla de movimientos.
  - Colores de los estados (siempre con texto): "Pendiente de pago" ámbar, "Pagado" y "En
    preparación" marino, "Enviado" y "Listo para recoger" cian, "Entregado" menta, "Cancelado"
    neutro. Se usan los tokens de `.badge` existentes o uno nuevo `--color-*` si falta.
  - Acciones: guardar y avanzar estado en marino, cancelar con `.btn--ghost`, éxito en menta.
- **Rationale**: principio I y FR-024. No hay maqueta en `design/`.

## G17. Privacidad y seguridad del detalle de pedido

- **Decision**:
  - El detalle muestra contacto y dirección solo dentro del panel, con `no-store`.
  - Los logs de pino llevan `orderId`, `adminId` y códigos de error, nunca el correo ni la
    dirección.
  - El nombre original del archivo subido no se guarda ni se registra.
  - La subida está limitada a administradores; la acción rechaza un archivo de más de 5 MB antes
    de decodificarlo.
- **Rationale**: principio IV.

## G18. Pruebas mínimas de la feature

- **Decision**:
  - **Unitarias**: `allowedTransitions` (incluida la nueva `pending_payment → paid`), `discountState`,
    los esquemas Zod de producto, ajuste y código, el loader de imágenes subidas y las variantes de
    la plantilla `order-status`.
  - **Integración**:
    - `admin-authz` (listas ampliadas);
    - `admin-products`: alta con foto real y foto falsa, slug único, desactivar con pedidos y
      reactivar;
    - `admin-stock`: ajuste concurrente con `reserveStock`, nunca negativo, y movimientos;
    - `admin-orders`: filtros, recuentos, cada transición con correo e historial con autor,
      estado esperado desactualizado, cancelar pagado con reembolso falso, cancelar enviado
      rechazado y reintentar reembolso;
    - `admin-in-clinic`: confirmar pago, confirmar pago y entrega, y carrera con la caducidad;
    - `admin-discounts`;
    - `content-load-seed` (tienda);
    - `orders-cli`: la transición nueva.
  - **E2E**, con el prefijo `008-` (convención de CLAUDE.md):
    - `008-us1-products`: alta con foto y visible en el catálogo;
    - `008-us3-orders`: avanzar y cancelar;
    - `008-us5-in-clinic`;
    - `008-a11y`: axe en todas las páginas nuevas, también sin JavaScript.
  - **Flujos críticos tocados** (principio III): checkout y pago (movimientos en `reserveStock`) y
    estados de pedido.
  - **Lighthouse**: del catálogo con una foto subida (SC-008).
