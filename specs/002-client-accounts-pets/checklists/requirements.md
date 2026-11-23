# Specification Quality Checklist: Cuentas de cliente y mascotas

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-11
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

- Iteración 1: se retiraron dos detalles de implementación de Assumptions (ruta del archivo de
  contenido y formato concreto de la descarga) y se corrigió la redacción de FR-005.
- Sin marcadores [NEEDS CLARIFICATION]: los puntos abiertos se resolvieron con valores por defecto
  documentados en Assumptions (plazos, eliminación inmediata, cambio de correo fuera de alcance,
  verificación sin inicio de sesión automático). Candidatos para `/speckit-clarify`.
- Clarify 2026-11-11: confirmados el borrado inmediato, la fecha de nacimiento obligatoria
  (aproximada si no se conoce) y la verificación sin inicio de sesión automático. Se eliminó la
  contradicción entre US1-3 y Assumptions.
- Implementación 2026-11-11 (T089), desviaciones y precisiones respecto al plan (sin cambiar marcas):
  - **A10, 29 de febrero**: `until()` de Temporal da "11 meses" entre el 29/02 y el 28/02 del año
    siguiente. Se mantiene la regla decidida (cumplen el 28) calculando los meses a mano en
    `src/domain/pet-age.ts`.
  - **A9, 404 de una mascota ajena**: con `htmlLimitedBots` (decisión de la 001), `notFound()` en una
    página dinámica deja el cuerpo del 404 al cliente y sin JavaScript no se ve. Se redirige a
    `/mi-cuenta/mascota-no-encontrada`, una ruta sin página que responde 404 con la página completa
    (el mismo recurso que la reescritura de `src/middleware.ts` en la 001). La URL final cambia.
  - **A5, correo sin verificar**: además de emitir un token nuevo, el último registro sustituye
    nombre, teléfono y contraseña. Así nadie puede "reservar" un correo ajeno con su contraseña.
  - **A7, lista común**: de las 10.000 entradas de SecLists solo 51 tienen 10 caracteres o más; las
    demás ya fallan por longitud, así que solo se guardan esas.
  - **Registro**: como el contacto (R6), un envío en menos de 3 s da un éxito aparente sin efectos.
    En el alta de mascotas no se aplica (el usuario ya está identificado).
