# Specification Quality Checklist: Consejos de salud y boletín

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-16
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

- Validado en la primera iteración. Decisiones tomadas por defecto (sin marcadores): doble
  confirmación, enlace válido 7 días, pendientes borradas a 30 días, respuesta idéntica para no
  revelar suscriptores, cuentas verificadas sin segunda confirmación y sincronización en ambos
  sentidos con la preferencia de la 002. Se pueden revisar en `/speckit-clarify`.

## Desviaciones de la implementación (T059)

- **FR-026, parcial**: el producto no permite cambiar el correo de la cuenta (002), así que
  `moveSubscriptionEmail` (`src/lib/newsletter/sync.ts`) existe y tiene test, pero ningún flujo la
  llama todavía. La feature que añada el cambio de correo debe usarla tras verificar el nuevo.
- **Exportación v3**: el contrato mostraba `marketing_opt_in_changed_at`, pero también decía que los
  campos de la v2 se mantienen por compatibilidad; se conserva `changed_at` (nombre de la v1) y se
  ha corregido el ejemplo de `contracts/export-format.md`.
- **Aviso tras suscribirse con JavaScript**: Next.js no conserva `#boletin` al redirigir desde una
  Server Action. Sin JavaScript, el PRG lleva a `#boletin`; con JavaScript, el mensaje
  (`NewsletterNotice`) toma el foco al montarse, lo que lo desplaza a la vista y lo anuncia.
- **Accesibilidad corregida en T059**: el resumen de errores del bloque del boletín heredaba el
  texto blanco (contraste 1,2:1) y el botón "Suscribirme", al pasar a su propia línea en 360 px,
  medía 16 px de alto. Corregido en `design/styles.css` con tokens (`--size-target`).
- **Tests de features anteriores actualizados**: `us1-home` (destino `/consejos` y bloque del
  boletín en la portada), `us8-legal` (privacidad actualizada el 16-11-2026 por la finalidad del
  boletín), `coming-soon` (sin "consejos") y los de la exportación (`format_version` 3).
- **Test intermitente de la 005 corregido**: `orders-access` alteraba el último carácter de la
  firma; en base64url sus 2 bits bajos son relleno y a veces la firma seguía siendo válida.
- **Entorno**: con el reloj de la máquina virtual de Docker adelantado (2 s), `email-dispatch` y
  `delete-account` fallan porque `next_attempt_at` sale del reloj de PostgreSQL y el envío filtra
  con el de Node. No es un fallo del código: pasan con los relojes sincronizados.
- **Lighthouse**: el rendimiento varía mucho entre pasadas en local (TBT); todas las URL alcanzan
  ≥ 90 en móvil y la accesibilidad es 100 en todas.
- **Quickstart**: los pasos 1–14 se han validado con los e2e `us1`–`us5` en los tres perfiles
  (`mobile-360`, `desktop` y `no-js`). Los pasos 8–13 se han recorrido además contra el servidor
  local con la base de desarrollo y el buzón falso: todos correctos.
- **Servidor local en modo producción** (`npm start`): exige `PAYMENT_FAKE_ALLOWED=true` si
  `PAYMENT_PROVIDER=fake` (regla de la 005); sin ella, las Server Actions fallan al validar el
  entorno. Con `npm run dev` no hace falta.
