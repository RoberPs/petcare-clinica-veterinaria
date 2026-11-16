# Quickstart: validar el carrito y el pago (feature 005)

## Requisitos previos

```bash
docker compose up -d                                   # PostgreSQL 5434/5433 y correo falso
npm run db:migrate                                     # incluye 0004_cart_checkout
npm run content:load -- --file content/petcare.yaml    # con checkout: y sections.carrito.href
```

`.env` (los nombres están en `.env.example`): `PAYMENT_PROVIDER=fake` para trabajar sin red. Para
probar Stripe en modo de pruebas:

```bash
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_…        # solo claves de prueba; con otra la app no arranca
STRIPE_WEBHOOK_SECRET=whsec_…      # lo da: stripe listen --forward-to localhost:3000/api/pagos/webhook
```

```bash
npm run dev
```

## Recorridos manuales

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | `/productos`: "Añadir" en dos productos; recargar | contador = 2; el aviso "Añadido al carrito" conserva los filtros |
| 2 | Ficha: cantidad 3 y "Añadir al carrito"; abrir `/carrito` | líneas correctas; resumen con subtotal, "Envío Gratis", total e "IVA incluido" |
| 3 | `/carrito`: cambiar la cantidad, eliminar y "Seguir comprando" | totales recalculados; vuelve a `/productos` |
| 4 | Código `BIENVENIDA10`, luego `NOEXISTE` | línea "Descuento (BIENVENIDA10)"; error junto al campo sin cambiar el total |
| 5 | "Finalizar compra" como invitado, domicilio, tarjeta y "Confirmar pedido" | pasarela (simulada o Stripe con `4242 4242 4242 4242`); al volver, "Pedido PC-… confirmado"; correo en `npm run email:fake:list` |
| 6 | Igual con la tarjeta `4000 0000 0000 0002` (Stripe) o "Simular rechazo" | mensaje de rechazo; "Cancelar" lleva a "No se ha completado el pago" con "Reintentar" |
| 7 | Recogida y "Pago en clínica" | "Pendiente de pago", sin campos de dirección, correo con el plazo de recogida; `npm run orders -- deliver PC-…` lo marca entregado |
| 8 | Domicilio con el código postal `35001` y una variante del YAML con `postal_prefixes` peninsulares | "No enviamos a este código postal…" |
| 9 | Ficha: "Comprar ahora" con el carrito lleno | checkout con solo ese producto; el carrito sigue intacto |
| 10 | Iniciar sesión con un carrito de invitado | los carritos se unen; `/mi-cuenta/pedidos` y "Últimos pedidos" en el resumen |
| 11 | Desactivar JavaScript y repetir 1–5 | todo funciona hasta la pasarela |
| 12 | Pedido con tarjeta y cerrar la pestaña en la pasarela; esperar 32 min o `setTestNow` + `npm run orders:maintain` | pedido cancelado (`expired`), stock devuelto y correo de cancelación |

## Pruebas automáticas

```bash
npm run lint                 # ESLint, tsc y check:design
npm test                     # pricing, discount, shipping, order-status, firma, contenido
npm run test:integration     # concurrencia, avisos duplicados, caducidad, reembolsos, IDOR, CLI
npm run test:e2e             # un spec por historia (móvil, escritorio y sin JS) con axe
npm run test:lighthouse      # /, /productos y una ficha ≥ 90
```

Criterios de aceptación cubiertos: SC-002 (concurrencia), SC-003 (idempotencia), SC-004
(caducidad), SC-005 (totales), SC-006 (IDOR), SC-007 (sin JavaScript y axe) y SC-008
(Lighthouse).

## Despliegue

- `.env` de producción: `PAYMENT_PROVIDER=stripe` con claves de prueba.
- Webhook en el panel de Stripe (modo de pruebas) apuntando a
  `https://${PETCARE_DOMINIO}/api/pagos/webhook`, con los eventos de
  [contracts/payments.md](contracts/payments.md).
- Temporizador nuevo `deploy/systemd/petcare-orders-maintain.{service,timer}` (cada minuto) y
  `cli/orders*.mjs` en `build-cli.mjs`. Se documenta en `deploy/README.md`.
