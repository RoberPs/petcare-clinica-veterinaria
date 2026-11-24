# Contrato: correo de cambio de estado del pedido (feature 008)

**Tipo**: `order_status` en la bandeja de salida (G11). Lo encola `transitionOrder` cuando
`actor = 'clinic'`, `to ∈ {paid, preparing, shipped, ready_for_pickup, delivered}` y no lleva
`skipEmail`. Se envía con `sendEmailsSoon`, con los reintentos habituales.

**Destinatario**: `orders.email` (con cuenta o como invitado). No se envía si el pedido está
anonimizado.

**Contenido común**:
- asunto `"<prefijo><número>: <estado>"` (por ejemplo, "Pedido PC-1042: enviado");
- nombre de la clínica;
- estado nuevo en texto;
- líneas resumidas (nombre × cantidad) y total con IVA;
- enlace al pedido ("Mis pedidos" o el enlace privado del invitado, como `order-common.ts`);
- aviso de tienda de demostración, si está activo.

Versión en HTML y en texto, sin imágenes remotas.

| Variante | Texto específico |
|---|---|
| `paid` | "Hemos registrado tu pago en la clínica". Recuerda recoger el pedido |
| `preparing` | "Estamos preparando tu pedido" |
| `shipped` | "Tu pedido va de camino" y el plazo de `shop_settings.shipping_text`, más la dirección de entrega |
| `ready_for_pickup` | "Tu pedido está listo para recoger", con la dirección y el horario de la clínica (de la base de datos) y el plazo de recogida |
| `delivered` | "Pedido entregado". Con `combined: true`: "Pago confirmado y pedido entregado" |

**Sin cambios**: la cancelación sigue usando `order_cancelled`, con o sin reembolso (feature 005).
El motivo interno de la clínica **no** aparece en ningún correo.

**Privacidad**: los logs solo llevan el `outboxId` y el `orderId`.
