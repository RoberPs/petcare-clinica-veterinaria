# Implementation Plan: Cuentas de cliente y mascotas

**Branch**: `002-client-accounts-pets` | **Date**: 2026-11-11 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-client-accounts-pets/spec.md`

## Summary

Registro con verificación de correo, inicio y cierre de sesión con "Recordarme", recuperación y
cambio de contraseña, gestión de mascotas, datos personales, preferencia de comunicaciones,
descarga de datos y eliminación inmediata de la cuenta.

Enfoque técnico (detalle en [research.md](research.md), decisiones A1–A14):

- **Sesiones propias en PostgreSQL** con un token opaco en una cookie `HttpOnly` (`pc_session`), de
  modo que se pueden revocar en el servidor. Las contraseñas se guardan con **Argon2id**.
- **Enlaces de un solo uso** (verificación y recuperación) guardados solo como hash. Se consumen
  con un POST desde la página del enlace, para que los escáneres de correo no los gasten.
- La **bandeja de salida** de la 001 se generaliza para los correos de cuenta, y el **límite por
  origen** de la 001 se reutiliza con políticas con nombre.
- Todas las pantallas usan Server Actions con POST-Redirect-GET y funcionan sin JavaScript, igual
  que el contacto en la 001.

## Technical Context

**Language/Version**: TypeScript 6 en modo `strict`, sobre Node.js 22 LTS (sin cambios).

**Primary Dependencies**: las de la 001, más **`@node-rs/argon2`** (Argon2id con binarios
precompilados, también para Alpine/musl). No se añade ninguna librería de autenticación.

**Storage**: PostgreSQL 16 y Drizzle. Hay una migración nueva `drizzle/0001_client_accounts.sql`
con 6 tablas nuevas, la generalización de `email_outbox` y el catálogo `species` (ver
[data-model.md](data-model.md)).

**Testing**: Vitest para las unitarias y de integración, y Playwright con axe en los proyectos
móvil, escritorio y `no-js` (como en la 001).

**Target Platform**: el mismo VPS con Docker Compose, Caddy y Cloudflare. La imagen
`node:22-alpine` sirve tal cual porque `@node-rs/argon2` publica binarios para musl.

**Project Type**: aplicación web full-stack (un solo proyecto Next.js).

**Performance Goals**:

- Inicio de sesión en menos de 500 ms en el servidor; el hash Argon2id tarda unos 50 ms.
- Las páginas del área no pasan de 2 consultas por petición, más la de la sesión.
- Lighthouse no aplica: la feature no toca la portada ni el catálogo.

**Constraints**:

- Todo funciona sin JavaScript.
- Las páginas privadas no se guardan en caché (`no-store`) y no se indexan.
- No se carga ningún recurso de terceros (en particular, no se consulta HIBP).
- Ningún dato personal aparece en los logs.
- No hay datos de la clínica en `src/`: las especies vienen del YAML.

**Scale/Scope**:

- 13 rutas nuevas y 1 endpoint de descarga.
- Hasta unos pocos miles de cuentas por clínica, con 30 mascotas como máximo por cuenta.
- Bastante menos de 300 correos al día (plan gratuito de Brevo).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | Las maquetas usan `auth`, `auth__card`, `form`, `field`, `field-row`, `check`, `account-grid`, `side-nav`, `pets`, `pet` y `empty-state`, que ya existen en `styles.css`. Lo que falte (marca de la sección actual del menú, estado de error del `select`) se añade solo con tokens. El emoji de la mascota se sustituye por un icono propio por especie, con uno genérico de reserva. Los CTA siguen el color de su intención: marino (`.btn`) para guardar y también para confirmar un borrado, y cian para "Pedir cita". **No se crea ningún color de peligro**: la confirmación de borrado se refuerza con texto ("No se puede deshacer"), con su página propia y, en la cuenta, con la contraseña. | ✅ |
| **II. Marca propia** | Los textos de las maquetas ("Hola, María", Toby, Luna, pedidos de ejemplo) no se publican. Las especies son datos del YAML. | ✅ |
| **III. Tests de flujos críticos** | **Aplica**: registro e inicio de sesión son un flujo crítico. Hay tests de integración (registro, verificación, inicio de sesión, bloqueo, recuperación, autorización de mascotas, descarga y eliminación) y de extremo a extremo con axe y sin JavaScript para cada historia. Bloquean el merge en la CI. | ✅ |
| **IV. Privacidad y seguridad** | Argon2id con sal. Cookie `HttpOnly`, `Secure` y `SameSite=Lax`. CSRF con la comprobación de Origin de los Server Actions y de la ruta de descarga. Límite de intentos por cuenta y por origen (A6). Cada consulta se filtra por el `customer_id` de la sesión (A9). Cada campo tiene su finalidad (FR-002), la exportación es JSON (A11) y el borrado es inmediato (A12). Sin datos personales en los logs, y los tokens solo se guardan como hash. | ✅ |
| **V. WCAG 2.2 AA** | Errores junto al campo con `aria-describedby` y un resumen enfocable. `autocomplete` correcto (`email`, `current-password`, `new-password`, `given-name`, `family-name`, `tel`, `postal-code`…), `aria-current="page"` en el menú del área y confirmaciones de borrado en una página propia. axe se pasa en todas las rutas nuevas. | ✅ |
| **VI. Rendimiento** | Son páginas de servidor ligeras y no tocan la portada. | ✅ |
| **VII. Pagos de prueba** | La feature no tiene pagos. | N/A |
| **VIII. Producto real y adaptable** | Los flujos funcionan de punta a punta con correos reales vía la bandeja de salida, purgas programadas y todos los estados de error y vacíos. Las especies, el nombre de la clínica y los textos legales son datos. **Excepción heredada**: no hay panel de administración y la clínica no ve las cuentas (ver Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec referencia `design/`, y la CI existente (lint, unitarias, integración, extremo a extremo y Gitleaks) cubre las pruebas nuevas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción heredada de la 001.
**Re-check tras la Fase 1**: PASA. El modelo de datos ya es el que usará el panel futuro: las
cuentas y las mascotas se consultarán desde él sin cambiar el esquema.

## Project Structure

### Documentation (this feature)

```text
specs/002-client-accounts-pets/
├── plan.md
├── research.md          # A1–A14
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── routes.md        # rutas, acceso y redirecciones
│   ├── forms.md         # acciones, campos, validación y resultados
│   ├── emails.md        # 5 correos de cuenta
│   ├── export-format.md # JSON de "Descargar mis datos"
│   └── content-file.md  # cambios en content/<clinica>.yaml
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── crear-cuenta/                 # page, actions.ts, revisa-tu-correo/
│   ├── verificar-correo/             # page (formulario POST con el token), actions.ts
│   ├── iniciar-sesion/               # page, actions.ts
│   ├── recuperar-contrasena/         # page, actions.ts, enviado/
│   ├── restablecer-contrasena/       # page, actions.ts
│   ├── mi-cuenta/
│   │   ├── layout.tsx                # requireCustomer() + menú lateral
│   │   ├── page.tsx                  # resumen
│   │   ├── mascotas/                 # lista, nueva/, [id]/editar/, [id]/eliminar/, actions.ts
│   │   ├── datos/                    # datos personales, contraseña, preferencia, actions.ts
│   │   ├── eliminar-cuenta/          # confirmación con contraseña, actions.ts
│   │   └── cerrar-sesion/actions.ts
│   └── api/account/export/route.ts   # POST → descarga JSON
├── domain/                           # TS puro
│   ├── account-schemas.ts            # Zod: registro, acceso, contraseña, datos, mascota
│   ├── password-policy.ts            # longitud, lista común, distinta del correo
│   ├── common-passwords.ts           # lista generada (10.000 entradas)
│   ├── pet-age.ts                    # edad en años/meses (Temporal, Europe/Madrid)
│   ├── rate-limit.ts                 # + políticas con nombre (A6)
│   └── account-export.ts             # forma del JSON exportado
├── lib/
│   ├── auth/
│   │   ├── password.ts               # hash/verify Argon2id + hash ficticio
│   │   ├── session.ts                # create/get/revoke, cookie pc_session
│   │   ├── require-customer.ts       # guardia para páginas, acciones y rutas
│   │   └── tokens.ts                 # enlaces de un solo uso
│   ├── account/                      # register, verify, login, reset, pets, profile, delete
│   └── notice.ts                     # códigos ?aviso= → textos fijos
├── db/
│   ├── schema.ts                     # + tablas nuevas
│   ├── queries/{customers,pets,species,sessions}.ts
│   └── retention.ts                  # + purgas de cuentas, sesiones, tokens e idempotencia
├── email/
│   ├── dispatch.ts                   # + envío desde payload
│   └── templates/                    # + verifyEmail, accountExists, passwordReset, passwordChanged, accountDeleted
├── content/schema.ts, load.ts        # + species
└── components/
    ├── AccountNav.tsx, PetCard.tsx, PetForm.tsx, PetIcon.tsx
    ├── RegisterForm.tsx, LoginForm.tsx, PasswordFields.tsx, ProfileForm.tsx
    └── Notice.tsx

tests/
├── unit/        # password-policy, pet-age, account-schemas, rate-limit (políticas), account-export, email-templates
├── integration/ # register, verify, login-lockout, password-reset, pets-authz, profile, export, delete-account, retention-accounts
└── e2e/         # us1-register … us8-marketing, account-a11y, account-no-cache
```

**Structure Decision**: se mantiene el proyecto único de la 001. La lógica con efectos va en
`src/lib/account/*` y devuelve resultados discriminados (`ok | invalid | rate_limited | …`), como
`contact-submission.ts`. Las Server Actions solo traducen esos resultados a redirecciones o
estados, y las reglas puras van en `src/domain/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Principio VIII (heredada de la 001)**: no hay panel de administración. La clínica no puede consultar las cuentas ni las mascotas, y las especies se gestionan en `content/<clinica>.yaml`. | El panel es una feature posterior que ya decidió el responsable (Clarifications de la 001). | Construir ahora la parte de clientes del panel exige roles de administrador y su propia autorización, lo que duplica el alcance. Para mitigarlo, el esquema (`customers`, `pets`, `species`) ya es el que leerá el panel, y añadir una especie solo requiere editar los datos y volver a cargarlos. **Caducidad**: se cierra con la feature del panel. |
