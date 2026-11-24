# Specification Quality Checklist: Panel de administración de la tienda

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-23
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Validado en la primera pasada. Las tres decisiones tomadas como supuesto (no cancelar desde
  "Enviado", códigos no editables, fotos subidas desde el panel) se confirmaron en `/speckit-clarify`
  (sesión 2026-11-23), junto con el descuento del stock al confirmar el pago en clínica.
- Los formatos y el tamaño máximo de la foto (FR-006) son límites visibles para el usuario, no
  detalles de implementación.
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

## Desviaciones de la implementación (`/speckit-implement`)

- **G4, `image_path`**: una foto subida se guarda como `/media/subidas/productos/<uuid>` (con el
  prefijo `/media/`, como las rutas de la demo) en lugar de `subidas/productos/<uuid>`. El route
  handler y el loader usan esa misma ruta. `ProductImage` es un componente de cliente: el `loader`
  es una función y no puede cruzar del servidor al cliente. Se usa también en el carrito.
- **G4, entorno**: `UPLOADS_DIR` es obligatorio con `NODE_ENV=production` (validación de
  `src/lib/env.ts`); también lo fijan el job de Lighthouse de la CI y `tests/test-env.ts`.
- **G7, transiciones**: además de `pending_payment → paid` (clínica), se añade `paid → delivered`
  para la clínica solo con pago en clínica, que necesita el paso doble de "Confirmar pago y
  entrega". `canTransition` recibe `now` (las condiciones `when` lo usan). Las dos filas del
  historial de ese paso van separadas 1 ms para que su orden sea estable.
- **G10, cancelar un pedido pagado en la clínica**: `cancelOrder` solo sigue el camino del
  reembolso si hay un pago cobrado por la pasarela. Un pedido pagado en el mostrador se cancela
  como uno pendiente (sin `refund_status = 'pending'`, que se quedaría así para siempre) y con el
  correo `order_cancelled`; la página de cancelación avisa de que el importe se devuelve en el
  mostrador. Era un hueco de la 005 que el panel hace visible.
- **G11, carga del correo**: la bandeja de salida guarda el correo ya renderizado (A8), así que
  `order_status` no guarda `{ orderId, status, combined }`: la variante combinada se resuelve al
  encolar. Un `pending_payment → delivered` directo (la orden `deliver` de la CLI) usa también la
  variante combinada. El pago en clínica confirmado por la clínica envía `order_status` (`paid`) en
  lugar de `order_confirmed` y `clinic_order`.
- **G5, reservas del checkout**: el pedido se inserta después de reservar el stock, así que
  `reserveStock` devuelve los ids de sus movimientos `order_reserved` y `confirmOrder` los enlaza
  con el pedido (`linkMovementsToOrder`) en la misma transacción. `--force-shop` no escribe
  movimiento si el stock no cambia (el CHECK exige `delta <> 0` salvo en `initial`).
- **G2, nombre único**: se comprueba en la transacción (sin distinguir mayúsculas), sin índice nuevo
  en la base: un índice `lower(name)` podría fallar en una base con nombres ya repetidos.
- **G13, tests**: como con `--force-booking`, los helpers de los tests cargan con `forceShop: true`
  para que cada prueba parta de la tienda del YAML; el comportamiento por defecto lo cubre
  `content-load-seed.test.ts`.
- **SC-008**: la CI siembra la foto con `scripts/seed-uploaded-photo.ts` (sobre `cama-acolchada`) y
  Lighthouse mide también esa ficha. `deploy/backup.sh` copia además el volumen `petcare-uploads`.

## Correcciones del recorrido manual (T077)

- **Miniatura del listado**: `listProductsAdmin` no devolvía `image_width/height` y la miniatura de
  una foto subida caía en el loader por defecto (imagen rota en `/admin/productos`).
- **SC-007, foco tras el aviso**: con JavaScript, Next.js conserva el desplazamiento al redirigir
  desde una Server Action y el aviso quedaba fuera de la vista. `AdminNotice` usa ahora
  `NoticeBox`, que toma el foco al montarse o al cambiar de aviso (como `NewsletterNotice`); afecta
  también a los avisos de la 007.
- **Detalle del pedido**: la entrega con recogida salía duplicada ("Recogida en la clínica
  (Recogida en la clínica)"); se muestra solo el nombre del método.
- **Historial de stock**: la tabla dice "Último movimiento de stock" con un solo movimiento.
- **quickstart.md**: el motivo se llama "Reposición" y el correo falso se consulta en
  `http://localhost:8025/emails`.
