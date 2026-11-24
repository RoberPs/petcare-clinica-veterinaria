# Contrato: rutas y Server Actions de la tienda en el panel (feature 008)

Las rutas `/admin/*` siguen el [contrato de la 007](../../007-admin-agenda-panel/contracts/routes.md):

- guardia con `requireAdmin()` en el layout y en cada acción, y 404 para quien no es
  administrador;
- `noindex` y `no-store`;
- POST-Redirect-GET con `?aviso=`;
- errores junto al campo y resumen con `role="alert"`;
- todo funciona sin JavaScript.

Cada página va en `ADMIN_PAGES` y cada acción en `ADMIN_ACTIONS`.

## Páginas

| Ruta | Contenido | Spec |
|---|---|---|
| `/admin/productos?q=&categoria=&mascota=&estado=publicado\|desactivado&pagina=` | Lista paginada (25): miniatura, nombre, categoría, precio, "Oferta" y "Novedad", disponible y reservado, estado | US1 esc. 6, FR-009 |
| `/admin/productos/nuevo` | Formulario completo con stock inicial y foto | US1 esc. 1–2 |
| `/admin/productos/[id]` | Edición (stock en solo lectura con un enlace a ajustarlo), y Desactivar o Reactivar | US1 esc. 3–5 |
| `/admin/productos/[id]/stock` | Disponible, reservado, formulario de ajuste e historial de movimientos (50 últimos) | US4 |
| `/admin/pedidos?estado=&numero=&pagina=` | Pestañas de estado con su recuento, búsqueda por número, lista paginada (25) y estado vacío | US2 |
| `/admin/pedidos/[id]?volver=` | Detalle: líneas, descuento, envío, totales e IVA, contacto y dirección o recogida, pago y reembolso, historial con autor, y botones con las transiciones permitidas | US2 esc. 3, US3 |
| `/admin/pedidos/[id]/cancelar` | Confirmación con motivo interno; avisa si habrá reembolso | US3 esc. 4 |
| `/admin/descuentos` | Lista con tipo, valor, condiciones, estado calculado y usos/límite | US6 esc. 4 |
| `/admin/descuentos/nuevo` | Formulario de alta | US6 esc. 1–2 |

## Server Actions (`ADMIN_ACTIONS`)

| Acción | Entrada | Efecto | Resultado |
|---|---|---|---|
| `saveProduct` | campos del producto (data-model), `id?`, archivo `image?` | Alta o edición, imagen procesada (G4), movimiento `initial` al crear y log de auditoría | `/admin/productos/[id]?aviso=guardado`. Si no valida, se vuelve a pintar con los errores |
| `setProductPublished` | `id`, `published` | Cambia `published` | `?aviso=desactivado` o `?aviso=reactivado` |
| `adjustStock` | `id`, `delta`, `reason`, `note?` | UPDATE condicionado más movimiento (G5) | `/admin/productos/[id]/stock?aviso=stock-ajustado`. Si no hay unidades suficientes: `?aviso=stock-insuficiente&max=N` |
| `setOrderStatusAdmin` | `id`, `from`, `to` | `transitionOrder(…, 'clinic')` con `admin_id`, más el correo `order_status` | `/admin/pedidos/[id]?aviso=estado-cambiado`. Errores: `pedido-cambiado` y `transicion-no-permitida` |
| `confirmInClinicPayment` | `id`, `from`, `deliver` | `paid` (y `delivered` si `deliver`), con un solo correo | `?aviso=pago-confirmado` o `?aviso=pago-y-entrega`. Si no está vigente: `?aviso=pedido-no-vigente` |
| `cancelOrderAdmin` | `id`, `from`, `note` | `cancelOrder(…, 'clinic')`: libera stock y descuento, y reembolsa si estaba pagado | `?aviso=cancelado` o `?aviso=cancelado-reembolso` |
| `retryRefundAdmin` | `id` | Si `refund_status = 'failed'`, reinicia los intentos y llama a `refundOrder` | `?aviso=reembolso-reintentado` |
| `createDiscountCode` | campos del código | Alta | `/admin/descuentos?aviso=creado`. Si está repetido, error junto al campo |
| `setDiscountEnabled` | `id`, `enabled` | Activa o desactiva | `?aviso=desactivado` o `?aviso=reactivado` |

## Ruta pública nueva

| Ruta | Contrato |
|---|---|
| `GET /media/subidas/productos/[file]` | `file` cumple `^[0-9a-f-]{36}-(480\|960\|1440)\.webp$`; se lee de `${UPLOADS_DIR}/productos/`. Respuesta 200 con `image/webp`, `Cache-Control: public, max-age=31536000, immutable` y `nosniff`; cualquier otro nombre o un archivo ausente da 404. No pasa por la guardia del panel |

## Configuración

- `next.config.ts`: `experimental.serverActions.bodySizeLimit = '6mb'`.
- Entorno: `UPLOADS_DIR`; en local `./var/uploads` y en producción `/app/var/uploads`. Se añade
  a `.env.example`.
