# Specification Quality Checklist: Reserva de citas online

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (Q1–Q3 resueltas el 2026-11-11)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- "Sin JavaScript" (FR-031) y el color de los CTA (FR-032) se mencionan porque son requisitos de la
  constitución visibles para el usuario, no decisiones de implementación.
- Rama renombrada de `007-online-appointment-booking` a `003-online-appointment-booking`: el
  script contó ramas locales de otro proyecto (`gestor-citas`).
- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`

## Desviaciones encontradas al implementar (`/speckit-implement`, 2026-11-11)

- **Referrer-Policy del enlace de gestión (B7)**: `same-origin` en lugar de `no-referrer`. Con
  `no-referrer` el navegador envía `Origin: null` en los POST sin JavaScript y Next.js rechaza la
  Server Action (CSRF). Con `same-origin` el token tampoco sale nunca del sitio como Referer.
- **Antigüedad del token anti-robots**: se mide con la hora real (`tokenNow`), no con `getNow()`.
  Con la hora de negocio fijada por `x-test-now` la antigüedad sería siempre 0.
- **Hora ocupada al pintar `/pide-cita` con `hora`**: si la hora de la query ya no está libre, el
  paso 3 se pinta igualmente con las horas libres dentro del formulario y el aviso `hora-ocupada`
  (en vez de volver al paso 2). Es lo que permite, sin JavaScript, elegir otra hora tras el POST sin
  perder lo escrito (B5). Una hora mal escrita sigue volviendo al paso 2 con el error.
- **Token del paso 3**: el estado de la acción devuelve el token original (sigue sin usar si no se
  ha creado la cita), para que la página vuelta a pintar sin JavaScript no estrene uno sin los 3 s.
- **`return_to` con la query**: el aviso de cookies y el inicio de sesión vuelven a la ruta con su
  query (`x-return-to` en el middleware), para no perder el paso de `/pide-cita`.
- **Aviso nuevo `error-cita`** (no estaba en contracts/routes.md) para los errores inesperados al
  cancelar o cambiar.
- **`already_cancelled`** también cubre una cita que ya ha empezado o pasado (aviso
  `cita-no-disponible`).
- **"Mis citas"**: una cita futura cancelada aparece en "Próximas" con el estado "Cancelada". En
  pantallas estrechas la tabla se apila (cada cita es un bloque) con roles ARIA explícitos, porque la
  tabla de 7 columnas ensanchaba el viewport móvil.
- **Eliminar una mascota**: sus citas futuras se cancelan como `customer` y solo se avisa a la
  clínica (B12); el cliente ya sabe que la ha eliminado.
- **Pie de página**: el pie de la 001 no tiene enlace "Pide cita"; la cabecera, el menú móvil, la
  portada, los tratamientos y la clínica sí, todos por `sectionHref('reservas')`.
- **Tests de la 001 y la 002 ajustados**: los e2e que esperaban `/proximamente/reservas` para "Pide
  cita", "Mis citas" y "Pedir cita"; `content-load.test.ts` y `us3-services.spec.ts` quitan también los enlaces del bloque `booking:` a
  las fichas que eliminan; `account-export.test.ts` espera la clave `citas`; y `loginAs`
  admite la hora de la sesión para las pruebas con `x-test-now`.

## Ajustes tras las pruebas manuales del quickstart (2026-11-12)

- **Paso de fecha y hora (escenario 4)**: al cambiar la fecha del calendario sin pulsar "Ver horas",
  se seguían viendo las horas del día pintado y la cita iba a ese día. Con JavaScript,
  `SlotDateGuard` oculta esas horas y avisa (`role="status"`) hasta pulsar "Ver horas". No envía el
  formulario al cambiar la fecha (WCAG 3.2.2). Sin JavaScript sigue como en B5. Se añade
  `[hidden] { display: none !important; }` a `design/styles.css`.
- **Aviso nuevo `dia-sin-horas`**: una hora en un día sin horario (cierre, domingo o completo) ya no
  dice "Esa hora se acaba de ocupar".

## Cierre

- **Quickstart manual completado (2026-11-12)**: los 11 escenarios de `quickstart.md` son
  correctos, con y sin JavaScript. La feature 003 queda **cerrada**.
