# Contrato: CLI de pedidos y tarea de mantenimiento

Es la excepción temporal al principio VIII, porque no hay panel de administración. Usa las mismas
funciones (`src/lib/orders/`) que usará el panel.

## `npm run orders -- <orden>` (producción: `docker compose exec petcare-app node cli/orders.mjs <orden>`)

| Orden | Efecto | Salida |
|---|---|---|
| `list [--status <estado>] [--limit N]` | lista los pedidos recientes | número, fecha, estado, pago y total |
| `show <número>` | detalle del pedido e historial | incluye los datos del comprador (es el operador de la clínica; no va a los logs) |
| `set-status <número> <estado>` | transición de `order-status.ts` con `actor = clinic` | "PC-000123: Pagado → Enviado" |
| `deliver <número>` | `in_clinic`: `pending_payment → delivered` y fija `paid_at`; los demás: `→ delivered` | |
| `cancel <número> [--note <texto>]` | cancela; si estaba pagado, reembolsa (D9) | indica el estado del reembolso |

Los estados se escriben con su código (`preparing`, `shipped`, `ready_for_pickup` y `delivered`).
Una transición no válida termina con código 2 y "Transición no permitida: Entregado → Enviado".
Un número inexistente termina con código 3.

## `npm run orders:maintain` (temporizador de systemd cada minuto)

1. Concilia los `payments` abiertos con más de 5 minutos (`retrieveCheckout`).
2. Caduca los pedidos vencidos (D8): con tarjeta, `reservation_expires_at + 2 min`; en clínica,
   `pickup_deadline`.
3. Reintenta los reembolsos `pending`.

Cada paso usa `pg_try_advisory_lock`. Al terminar, escribe en el log los contadores (`expired`,
`reconciled` y `refunds_retried`) sin datos personales.
