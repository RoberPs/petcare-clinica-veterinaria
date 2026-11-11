# Quickstart: validar la reserva de citas

## Preparación

```bash
docker compose up -d                                   # PostgreSQL 5434/5433 y correo falso
npm run db:migrate                                     # aplica 0002_appointments (btree_gist)
npm run content:load -- --file content/petcare.yaml    # bloque booking: y reservas.href
npm run dev
```

Para fijar la hora en las pruebas manuales: `TEST_CLOCK_ENABLED=1` y la cabecera `x-test-now`
(R17).

## Escenarios

| # | Qué hacer | Resultado esperado | Spec |
|---|---|---|---|
| 1 | Sin sesión, abrir "Pide cita" en la cabecera, elegir Consulta general y "Sin preferencia", luego un día laborable y una hora, y completar los datos. | Resumen actualizado en cada paso. Confirmación con el profesional asignado. `npm run email:fake:list` muestra 2 correos (al invitado con el teléfono, a la clínica con el enlace de gestión). | US1, FR-017–019 |
| 2 | Recargar la página de confirmación y volver a enviar el paso 3 con el botón Atrás. | Ninguna cita nueva (`submission_id`). | FR-014 |
| 3 | Elegir la misma fecha y hora en otro navegador. | Esa hora ya no aparece. Si la página estaba abierta, al confirmar sale "hora-ocupada" con las horas actualizadas. | FR-006–007 |
| 4 | Elegir un sábado por la tarde, el 8 de diciembre (cierre) o una Cirugía de 60 min a las 13:30. | Sin horas, o sin esa hora; enlace al siguiente día con huecos. | FR-003, FR-005 |
| 5 | Iniciar sesión, ir a Mis mascotas y pulsar "Pedir cita". | Mascota preelegida y datos rellenados. La cita aparece en `/mi-cuenta/citas` y en el resumen. | US2, US3 |
| 6 | Reservar con "Otra mascota…". | La mascota nueva aparece en "Mis mascotas". | FR-011 |
| 7 | Cancelar una cita a más de 24 h y cambiar otra. | Franjas liberadas y ocupadas según toque; correos de cancelación y de cambio. | US4 |
| 8 | Con `x-test-now` a menos de 24 h de una cita, abrirla en "Mis citas". | Sin acciones; se muestra el teléfono. Un POST forzado devuelve `fuera-de-plazo`. | FR-023 |
| 9 | Abrir el enlace de gestión del correo de la clínica y cancelar; luego abrir otra vez el mismo enlace. | Cita cancelada y franja libre. El enlace ya no es válido. El invitado recibe la cancelación. | US5, FR-027 |
| 10 | Reservar como invitado con el correo de una cuenta. | La misma pantalla que con cualquier otro correo. La cita no está en "Mis citas"; el correo sugiere iniciar sesión. | Q2 |
| 11 | Hacer todo lo anterior con JavaScript desactivado y solo con el teclado. | Mismo resultado y foco visible. | FR-031 |

## Pruebas automáticas

```bash
npm run lint
npm test                    # availability, assignStaff, booking-schemas, firmas, plantillas
npm run test:integration    # concurrencia (20 → 1), exclusión, límites, IDOR, plazos, borrados, retención
npm run test:e2e            # us1–us5 en mobile-360, desktop y no-js, con axe
```

**Criterio de cierre**: todo en verde, la comprobación de diseño sin estilos a mano y ningún dato
de la clínica en `src/` (los servicios, los profesionales y las reglas salen del YAML).
