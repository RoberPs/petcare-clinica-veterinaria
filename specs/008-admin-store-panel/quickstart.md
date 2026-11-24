# Quickstart: validar el panel de la tienda (feature 008)

## Preparación

```bash
docker compose up -d
npm run db:migrate                                   # aplica 0007_admin_store
npm run content:load -- --file content/petcare.yaml  # siembra; no pisa el panel
npm run admin -- grant <correo-admin> --by "<quién>"
npm run dev
```

`UPLOADS_DIR` en `.env`: `./var/uploads`.

## Recorrido manual (con el teclado y también sin JavaScript)

1. **Productos (US1)**:
   - en `/admin/productos/nuevo`, crea un producto con una foto JPEG del móvil y "Novedad";
   - en `/productos/<slug>` se ve, y la foto no conserva el EXIF (`exiftool` sobre el `.webp`
     servido no debe mostrar GPS);
   - prueba un `.txt` renombrado a `.jpg`: error junto al campo;
   - marca "Oferta" sin precio anterior: error;
   - desactívalo: `/productos/<slug>` da 404 y el carrito lo marca como no disponible;
   - reactívalo.
2. **Stock (US4)**: en `/admin/productos/<id>/stock`, suma 5 ("Reposición"), resta más
   de lo disponible (aviso con el máximo) y revisa el historial.
3. **Pedidos (US2–US3)**:
   - haz dos compras en la tienda: una con tarjeta (pasarela falsa) y envío, y otra con recogida y
     pago en clínica;
   - en `/admin/pedidos`, filtra por "Pagado";
   - avanza el de tarjeta a "En preparación", luego "Enviado" y luego "Entregado", y comprueba en
     `http://localhost:8025/emails` (JSON del correo falso) un correo por paso y en "Mis pedidos" el historial;
   - intenta cancelarlo: la acción no aparece.
4. **Pago en clínica (US5)**: en el detalle del segundo pedido, "Confirmar pago y entrega": dos
   filas en el historial y un solo correo.
5. **Concurrencia**: abre el mismo pedido en dos pestañas y cambia el estado en las dos; la
   segunda muestra "El pedido ha cambiado".
6. **Cancelación con reembolso**: cancela un pedido pagado con un motivo; el estado es
   "Cancelado · Reembolsado", el correo no incluye el motivo y el stock vuelve.
7. **Descuentos (US6)**: crea `VERANO10` (10 %, mínimo 20 €), aplícalo en el carrito, desactívalo
   y recarga el carrito: se retira con aviso.
8. **Acceso**: con una cuenta de cliente, cualquier `/admin/productos…`, `/admin/pedidos…` o
   `/admin/descuentos…` da 404.
9. **Carga de datos**: vuelve a ejecutar `content:load` sin `--force-shop`; el producto creado y
   el stock ajustado se conservan.

## Pruebas filtradas (CLAUDE.md: solo lo nuevo y los flujos críticos tocados)

```bash
npx vitest run tests/unit/order-status tests/unit/discount tests/unit/store-schemas tests/unit/order-status-email
npx vitest run -c vitest.integration.config.ts admin-authz admin-products admin-stock admin-orders admin-in-clinic admin-discounts content-load-seed orders-cli
npx vitest run -c vitest.integration.config.ts checkout-concurrency payment-webhook refunds orders-maintain   # flujos críticos
npx playwright test tests/e2e/008-
npm run test:lighthouse     # el catálogo con una foto subida (SC-008)
npm run lint                # incluye check:design
```
