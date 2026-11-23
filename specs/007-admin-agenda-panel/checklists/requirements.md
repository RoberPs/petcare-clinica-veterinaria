# Specification Quality Checklist: Panel de administración de la agenda

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-23
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
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

- Las 3 dudas se resolvieron el 2026-11-23 (Q1: A, Q2: A, Q3: A) y constan en la sección
  Clarifications de la spec. Todos los puntos pasan.
- Las menciones a `design/`, `Europe/Madrid` y la herramienta de operación vienen de la
  constitución y de decisiones previas (R, A, B, C, D, E), no son decisiones de implementación
  nuevas.

## Desviaciones de la implementación (`/speckit-implement`)

- **F3, middleware**: además de las cabeceras, el middleware consulta la sesión (solo lectura) en
  `/admin/*`. Una sesión vigente sin rol, o un id inexistente con sesión de admin, se reescribe al
  404 normal: un `notFound()` dentro de una página dinámica no se ve sin JavaScript (lo advierte el
  propio middleware). La guardia de verdad sigue siendo `requireAdmin()` en el layout, en cada
  página y al principio de cada Server Action.
- **`admin_audit_log`**: sin el CHECK "`actor_id` o `actor_label`", porque `ON DELETE SET NULL`
  lo violaría al borrar la cuenta de un administrador. Lo exige `recordAdminAction` al insertar.
- **T020, admin sin verificar**: una cuenta sin verificar nunca tiene sesión (feature 002), así que
  la guardia la trata como anónima (a iniciar sesión), no con el 404. `requireAdmin()` exige además
  el correo verificado.
- **T016, `loginAs(page, { admin })`**: se añade `loginAsNew(page, { admin })` y se mantiene la
  firma de `loginAs` que usan los tests existentes. `seedBookingConfig` y las cargas de los e2e
  usan `--force-booking`.
- **Alta de veterinario**: `team_members.specialty` es obligatoria; un alta del panel guarda
  "Sin especificar" (no se publica: nace con `published = false`).
- **Avisos**: en servicios, `afectadas=N` se lee como "citas futuras que se mantienen"; se añaden
  los avisos `elige-franja` y `elige-decision`.
- **Mover**: `?veterinario=` lleva el id del veterinario (en la agenda, el slug).
- **Exportación**: `is_admin` no se exporta (es el rol del panel, no un dato aportado por el
  cliente).
- **Vitest de integración**: `oxc.jsx.runtime = 'automatic'` para que `admin-authz` pueda llamar
  a las páginas TSX del panel.
## Recorrido manual en el navegador (quickstart, 23/11/2026)

Pasos 1 a 5 y 7 del quickstart hechos en Chrome contra `npm run dev`: todo correcto. El paso 6
(sin JavaScript) queda cubierto por el perfil `no-js` de Playwright. Correcciones del recorrido:

- **Aviso a la clínica al cancelar**: decía "con el enlace de gestión" también desde el panel;
  ahora dice "la clínica" (`clinic-appointment.ts`).
- **Concordancia con una sola cita**: "quedaría" en la revisión del bloqueo y "se ha avisado al
  cliente" en el aviso tras cancelar.
- **Fechas y horas vacías en bloqueos**: "Elige la fecha." / "Elige la hora." en lugar del error de
  formato.
- **Quickstart y Independent Test de US3 en `tasks.md`**: con `slot_step_minutes: 30` la última franja es las 12:00, no las
  12:15.
