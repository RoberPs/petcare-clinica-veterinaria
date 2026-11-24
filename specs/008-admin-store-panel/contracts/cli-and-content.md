# Contrato: CLI de pedidos y carga de datos (feature 008)

## `npm run orders` (`cli/orders.mjs`, feature 005)

No cambia su interfaz. Al compartir `ORDER_TRANSITIONS` y `transitionOrder` con el panel:

- `set-status <número> paid` funciona en pedidos `in_clinic` pendientes y vigentes (G7);
- cualquier cambio a `paid`, `preparing`, `shipped`, `ready_for_pickup` o `delivered` hecho por la
  clínica encola ahora el correo `order_status` (FR-017);
- el historial deja `admin_id` nulo, y el detalle del panel lo muestra como "Clínica (CLI)".

Códigos de salida, sin cambios: 0 si va bien, 1 por uso incorrecto, 2 por transición no
permitida y 3 si el pedido no existe.

## `npm run content:load -- --file <yaml> [--force-booking] [--force-shop]`

| Datos | Sin `--force-shop` | Con `--force-shop` |
|---|---|---|
| Categorías y mascotas del catálogo | Upsert completo y despublicación de las ausentes (como hasta ahora) | Igual |
| `shop_settings`, métodos de envío y de pago | Upsert completo (como hasta ahora) | Igual |
| Productos y sus mascotas | **Solo crea** los slugs nuevos, con un movimiento `initial`. No toca los existentes ni despublica los ausentes | Upsert completo y despublicación de los ausentes. Cada stock cambiado deja un movimiento `content_load` |
| Códigos de descuento | **Solo crea** los códigos nuevos. No desactiva los ausentes | Upsert completo y desactivación de los ausentes |

Al final, el resumen indica cuántos productos y códigos se han creado, conservado o restaurado.

`--force-shop` es independiente de `--force-booking`. Las fotos subidas en el panel que una
restauración sustituye se quedan en el disco; la limpieza de huérfanos queda fuera de alcance.

`deploy/README.md` documenta la regla nueva, el volumen `petcare-uploads` y su inclusión en las
copias de seguridad.
