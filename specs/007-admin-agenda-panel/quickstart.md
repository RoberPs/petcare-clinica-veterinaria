# Quickstart: validar el panel de la agenda (feature 007)

## Preparación

```bash
docker compose up -d
npm run db:migrate                                   # aplica 0006_admin_agenda
npm run content:load -- --file content/petcare.yaml --force-booking
npm run dev
```

Crea una cuenta en `/crear-cuenta`, verifícala con el correo falso y dale el rol:

```bash
npm run admin -- grant <correo> --by "local"
```

## Recorrido manual (por historia)

1. **US1 — Acceso**:
   - Con la cuenta de administrador, `/mi-cuenta` muestra "Panel de administración" y `/admin`
     abre la agenda del día.
   - Con otra cuenta de cliente, `/admin/servicios` da el 404 normal.
   - Sin sesión, te lleva a iniciar sesión y después vuelves a la ruta.
   - `npm run admin -- revoke <correo> --by "local"`: la siguiente recarga da el 404.
2. **US2 — Agenda**:
   - Reserva dos citas en `/pide-cita` con veterinarios distintos.
   - En `/admin/agenda` aparecen en su columna; prueba "Semana", "Siguiente", "Hoy", el filtro por
     veterinario y "Mostrar canceladas".
3. **US3 — Servicios y horarios**:
   - Crea "Servicio de prueba" (45 min) y asígnalo a un veterinario.
   - Deja el horario de ese veterinario solo el martes de 10:00 a 13:00.
   - En `/pide-cita` el servicio ofrece solo franjas del martes para ese veterinario, de 10:00 a
     12:00 (con el paso de 30 min de `slot_step_minutes`; la última termina a las 12:45).
   - Desactívalo y desaparece.
   - Crea un veterinario sin horario: el panel avisa de que no recibe reservas y la reserva no lo
     ofrece.
4. **US4 — Cancelar y mover**:
   - Desde el detalle de una cita, muévela; la franja antigua vuelve a salir en `/pide-cita` y
     `npm run email:fake` muestra el correo con la hora anterior y la nueva.
   - Cancela otra con una nota; el correo incluye "Mensaje de la clínica".
5. **US5 — Bloqueos**:
   - Bloquea a un veterinario un día que tenga una cita: "Revisar" la muestra.
   - Elige "Mantener": la cita sale como "Fuera de horario".
   - Repite con "Cancelarlas todas": se cancelan y sale un correo por cita.
   - Crea un descanso semanal de 11:00 a 11:30 de lunes a viernes y comprueba las franjas.
6. **Sin JavaScript**: repite los pasos 4 y 5 con JavaScript desactivado.
7. **Semilla**: cambia la duración de un servicio en el panel y ejecuta `npm run content:load --
   --file content/petcare.yaml` sin `--force-booking`. La duración del panel se conserva.

## Pruebas imprescindibles (filtradas, ver F18)

```bash
npm run lint
npx vitest run tests/unit/availability tests/unit/blocks tests/unit/staff-schedule tests/unit/outside-schedule tests/unit/admin-schemas
npx vitest run -c vitest.integration.config.ts tests/integration/admin- tests/integration/content-load-seed tests/integration/booking- tests/integration/cancel-reschedule tests/integration/manage-link tests/integration/login
npx playwright test tests/e2e/admin- tests/e2e/a11y-all-routes tests/e2e/us1-guest-booking tests/e2e/us2-customer-booking tests/e2e/us4-cancel-reschedule tests/e2e/us5-clinic-manage tests/e2e/us1-register tests/e2e/us2-login --grep-invert "accesibilidad en todas las rutas|consejos sin recursos|tienda \(feature 005\)"
```

Los e2e se filtran por nombre completo de archivo: `us1`, `us2`… a secas también cogen los de las
features 001 a 006, porque todas numeran sus historias desde US1. El `--grep-invert` deja de
`a11y-all-routes` solo el panel y el área personal.

**Resultado esperado**: todo en verde y axe sin infracciones en `/admin/*`. Lighthouse no aplica
porque no cambian ni la portada ni el catálogo.
