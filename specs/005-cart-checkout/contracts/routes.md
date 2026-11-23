# Contrato: rutas y acciones (feature 005)

Todas las páginas tienen render dinámico, funcionan sin JavaScript y responden 404 (con el patrón
del middleware de la 004) si `sections.carrito.href` es nulo. Las privadas y las de pedido
llevan `no-store` y se añaden a `PRIVATE_ROUTES` o `NO_STORE_ROUTES` de `next.config.ts`.

## Páginas

| Ruta | Acceso | Contenido | Maqueta |
|---|---|---|---|
| `/productos`, `/productos/[slug]` | público | + "Añadir" en la tarjeta; + cantidad, "Añadir al carrito" y "Comprar ahora" en la ficha, solo con stock (FR-001) | `productos.html`, `producto.html` |
| `/carrito` | público | líneas, avisos por línea, código, resumen, "Seguir comprando" y "Finalizar compra"; estado vacío | `carrito.html` |
| `/finalizar-compra` | público | pasos, datos, envío, pago, aviso de demostración, resumen "Tu pedido" y "Confirmar pedido". `?directa=1` usa el carrito `direct`. Si el carrito está vacío, 303 a `/carrito` | `checkout.html` |
| `/pedido/confirmado?ref=&session_id=` | ref firmada, 2 h | concilia con el proveedor (D7); "Pedido PC-… confirmado" con el resumen, o "Estamos confirmando tu pago" con "Comprobar de nuevo" | paso 3 de `checkout.html` |
| `/pedido/pago-no-completado?ref=` | ref firmada, 2 h | "No se ha completado el pago", "Reintentar pago" (mientras la reserva siga vigente), "Volver al carrito" y "Cancelar pedido" | — |
| `/pedido/[token]` | token de invitado (D18) | detalle del pedido e historial; "Reintentar pago" o "Cancelar pedido" si procede; si el enlace ha caducado, aviso y contacto | `cuenta.html` (`table.orders`) |
| `/mi-cuenta` | cliente | + bloque "Últimos pedidos" (3) o invitación a la tienda | `cuenta.html` |
| `/mi-cuenta/pedidos` | cliente | `table.orders` paginada (10) con número, fecha, estado y total | `cuenta.html` |
| `/mi-cuenta/pedidos/[numero]` | cliente propietario | detalle, historial y acciones; un pedido ajeno da 404 | — |
| `/condiciones-de-venta` | público | `LegalPage kind="condiciones-venta"` | — |
| `/pago-simulado/[session]` | solo con `PAYMENT_PROVIDER=fake` | importe y "Pagar", "Simular rechazo" o "Cancelar"; marcada como simulación | — |

La cabecera muestra "Carrito" con el número de unidades (`.cart-count`) y
`aria-label="Carrito, N productos"`. "Mis pedidos" del menú lateral lleva a `/mi-cuenta/pedidos`.

## Server Actions

Todas validan con Zod, comprueban el origen (de forma nativa) y redirigen con PRG. Todas
comprueban también que la tienda está activa (`sections.carrito.href` no nulo) y que el método
de envío o de pago recibido está activo: si no, rechazan la petición aunque se envíe a mano (no
basta con el 404 del middleware, porque las acciones se envían a la ruta de la página que las
contiene, p. ej. `/productos`).

| Acción | Entrada | Éxito | Errores |
|---|---|---|---|
| `addToCart` | `product_id`, `quantity` (1 por defecto), `return_to` | 303 a `return_to` (o la ficha) con `?aviso=carrito-anadido` o `carrito-ajustado` | producto agotado o no publicado: aviso; nunca 500 |
| `buyNow` | `product_id`, `quantity` | sustituye el carrito `direct` y hace 303 a `/finalizar-compra?directa=1` | ídem |
| `updateCartLine` | `product_id`, `quantity` (0 = eliminar) | 303 a `/carrito?aviso=carrito-actualizado` | cantidad acotada y `carrito-ajustado` |
| `removeCartLine` | `product_id` | 303 a `/carrito?aviso=carrito-actualizado` | — |
| `applyDiscount` | `code` | 303 a `/carrito?aviso=descuento-aplicado` | estado con `fieldErrors.code` según el motivo de D12; `rate_limited` |
| `removeDiscount` | — | 303 a `/carrito?aviso=descuento-retirado` | — |
| `confirmOrder` | `token`, `web` (honeypot), `cart` (`main` o `direct`), datos de FR-007, `shipping_method`, `payment_method` | tarjeta: 303 a `checkout_url`; en clínica: 303 a `/pedido/confirmado?ref=` | estado `invalid` (`fieldErrors` y `values`), `cart_changed` y `stock_unavailable` (ajusta las cantidades del carrito y 303 a `/carrito?aviso=carrito-ajustado`), `rate_limited`, `limit_reached`, `expired_token`, `error` |
| `retryPayment` | `ref` o token de pedido | 303 a `checkout_url` si la sesión sigue abierta | "El plazo de pago ha vencido" |
| `cancelOrder` | `ref`, token de invitado o número (cliente) y confirmación | 303 a la vista del pedido con `?aviso=pedido-cancelado` | no es `pending_payment`: aviso |

Mensajes por línea en `/carrito` (FR-006):
- "El precio ha cambiado: antes X, ahora Y";
- "Solo quedan N unidades";
- "Este producto ya no está disponible", con la línea marcada y excluida del total.

## Route Handlers

| Ruta | Método | Contrato |
|---|---|---|
| `/api/pagos/webhook` | POST | [payments.md](payments.md). Sin comprobación de origen; responde 200, 400 o 500 |

## CSP

`form-action 'self' https://checkout.stripe.com` con `PAYMENT_PROVIDER=stripe`, o `'self'` con
`fake`. No cambia nada más (no hay scripts ni iframes de la pasarela).
