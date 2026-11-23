# Contrato: correos de pedido

Todos se encolan en `email_outbox` dentro de la transacción del cambio, con `order_id`, y se
intentan enviar al momento (`sendEmailsNow`). Las plantillas están en
`src/email/templates/order-*.ts` y devuelven `{subject, html, text}`. Todo el contenido se escapa.

| `outbox_kind` | Destinatario | Cuándo | Asunto |
|---|---|---|---|
| `order_confirmed` | comprador | pedido con tarjeta pasa a `paid` | "Pedido {número} confirmado" |
| `order_received` | comprador | pedido `in_clinic` creado | "Pedido {número} recibido: pago en la clínica" |
| `order_cancelled` | comprador | cualquier cancelación salvo `replaced` | "Pedido {número} cancelado" |
| `clinic_order` | `clinic.inbox_email` | pedido `paid` o `in_clinic` creado | "Nuevo pedido {número}" |

## Contenido común (comprador)

- Saludo con el nombre, número y fecha (`Europe/Madrid`).
- Tabla de líneas: nombre × cantidad e importe; subtotal, descuento (con el código), envío
  ("Gratis"), total e "IVA incluido: X €". Las cifras salen de la copia guardada en el pedido
  (SC-005).
- Envío: dirección completa, o recogida con la dirección y el horario de la clínica y, si es
  `in_clinic`, la fecha límite de recogida.
- Pago: "Tarjeta" o "Pago en la clínica (pendiente)", y el estado.
- Enlace: `/mi-cuenta/pedidos/{número}` (cliente) o `/pedido/{token}` (invitado, con validez de
  90 días desde el último cambio).
- Pie: "Tienda de demostración: no se ha cobrado nada y no se enviará ningún producto."
- `order_cancelled` añade el motivo en lenguaje claro y, si el pedido estaba pagado, el estado
  del reembolso en el momento de la cancelación:
  - `refunded`: "Te hemos devuelto X € en el mismo medio de pago (simulación)";
  - `pending`: "Estamos tramitando la devolución de X € en el mismo medio de pago (simulación)".
  No se envía un segundo correo cuando un reembolso `pending` pasa a `refunded`. Si pasa a
  `failed`, solo se registra un error para la clínica (D9), que contacta con el comprador.

## Correo a la clínica

Número, líneas, totales, método de envío y de pago, nombre del comprador y dirección (si es envío a
domicilio). Sin enlace de gestión: los cambios se hacen con el CLI (contracts/cli.md).
