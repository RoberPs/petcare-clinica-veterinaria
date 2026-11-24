# Implementation Plan: Web pública de la clínica veterinaria

**Branch**: `001-public-clinic-website` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-public-clinic-website/spec.md`

## Summary

Web pública de la clínica de demostración PetCare: portada, tratamientos, la clínica, contacto con
formulario, preguntas frecuentes, páginas legales y páginas "Próximamente". Está pensada sobre
todo para el móvil, cumple WCAG 2.2 AA y funciona sin JavaScript.

Enfoque técnico:

- Next.js 15 (App Router) con renderizado en servidor sobre PostgreSQL y Drizzle.
- Todo el contenido sale de la base de datos y se carga desde un archivo YAML por clínica, porque
  todavía no hay panel.
- El formulario es un Server Action con idempotencia y protección contra abuso. Los correos se
  envían con Brevo a través de una bandeja de salida con reintentos.
- El consentimiento de cookies es propio y el mapa de OpenStreetMap solo se carga tras aceptarlo.
- La interfaz se construye solo con `design/tokens.css` y `design/styles.css`, ampliados con los
  componentes que faltan.
- Se despliega en el VPS compartido con Docker y Caddy, detrás de un subdominio de Cloudflare.

Las decisiones y sus alternativas están en [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x en modo `strict`, sobre Node.js 22 LTS.

**Primary Dependencies**:

- Next.js 15 (App Router y Server Actions) y React 19.
- Drizzle ORM, drizzle-kit y `pg`.
- Zod, `@js-temporal/polyfill`, `react-markdown`, `yaml` y `pino`.
- Brevo, mediante su API HTTP con `fetch`, sin SDK.

**Storage**: PostgreSQL 16, con una base de datos por clínica y migraciones versionadas. Las
imágenes de cada clínica van en `public/media/<clinica>/`.

**Testing**: Vitest (unitarias y de integración contra PostgreSQL real), Playwright con
`@axe-core/playwright` (de extremo a extremo, también sin JavaScript) y Lighthouse CI (`@lhci/cli`).

**Target Platform**: un VPS Linux con Docker Compose, el Caddy compartido del chatbot y Cloudflare
(proxy y Full strict) sobre un subdominio de un solo nivel de `example.com`
(propuesto: `petcare.example.com`). Navegadores
de móvil y escritorio de las dos últimas versiones.

**Project Type**: aplicación web full-stack (un solo proyecto Next.js).

**Performance Goals**: Lighthouse móvil de 90 o más en `/`. En el percentil 75, LCP ≤ 2,5 s,
INP ≤ 200 ms y CLS ≤ 0,1. Titular y contacto legibles en menos de 4 s con 3G lento (SC-008).

**Constraints**:

- Funciona sin JavaScript (FR-049).
- Ningún recurso de terceros sin consentimiento.
- Ningún dato de una clínica concreta en `src/`.
- No hay CSS fuera de `design/` ni atributos `style`.
- Todo en español de España y en la zona horaria `Europe/Madrid`.

**Scale/Scope**: unas 14 rutas públicas y una sola clínica por instalación. Tráfico de demo bajo
(menos de 1.000 visitas al día) y menos de 300 correos al día, dentro del plan gratuito de Brevo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | La interfaz importa `design/tokens.css` y `design/styles.css` y no tiene más CSS. Los valores escritos a mano que hoy tiene `styles.css` (5 colores y unos 280 `px`) se pasan a tokens en esta feature, y `check:design` revisa también ese archivo (R4). Los emojis de las maquetas se sustituyen por iconos propios. Los componentes que faltan (menú móvil, enlace para saltar, franja de demo, aviso de cookies, errores de campo, estado de apertura, marcador del mapa) se añaden a `styles.css` solo con tokens (R4). `check:design` y ESLint impiden `style=""` y CSS paralelo. Los CTA usan cian para pedir cita y rosa para contacto. | ✅ |
| **II. Marca propia** | Contenido ficticio propio en `content/petcare.yaml` y franja de demostración (FR-007a). Una prueba falla si se reutilizan textos de `design/`. No se usa nada de `design/reference/` ni marcas de terceros. Se elimina "Guardian Sans" de `--font-family`. | ✅ |
| **III. Tests de flujos críticos** | Esta feature no toca registro, citas, checkout ni pedidos. Aun así, el flujo de contacto (el único con escritura) tiene pruebas de integración y de extremo a extremo con axe, y la CI bloquea el merge si fallan. | ✅ (N/A + cobertura voluntaria) |
| **IV. Privacidad y seguridad** | Cada campo tiene su finalidad (FR-023) y no se guardan IP ni agente de usuario con el mensaje. Los mensajes se conservan 12 meses. El consentimiento es propio, rechazar cuesta lo mismo y se puede retirar (R8). Hay CSP, Origin en los Server Actions, validación en servidor y escapado. Los secretos van solo en el entorno, con Gitleaks en CI. El responsable del tratamiento es real (FR-040a). No hay cuentas, así que no aplican la exportación ni el borrado. | ✅ |
| **V. WCAG 2.2 AA** | Enlace para saltar al contenido, `:focus-visible` global, menú móvil con teclado y Escape, errores con ARIA, objetivos táctiles de 24 px o más y `prefers-reduced-motion`. axe se ejecuta en todas las rutas (SC-006). | ✅ |
| **VI. Rendimiento** | HTML de servidor renderizado en cada petición (necesario para la CSP con nonce, R1), `next/image` con dimensiones y carga diferida, fuente autoalojada y el mapa solo tras consentimiento. Lighthouse CI con umbral de 90 en `/`. El catálogo no existe en esta feature. | ✅ |
| **VII. Pagos de prueba** | No hay pagos en esta feature. | N/A |
| **VIII. Producto real y adaptable** | El flujo de contacto funciona de punta a punta con persistencia, bandeja de salida, reintentos y purga. Todo es configuración o datos (archivo de contenido y entorno) y cambiar de clínica no toca `src/` (SC-009). Hay migraciones versionadas, copias de seguridad y páginas legales configurables. **Excepción**: no hay panel de administración (ver Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec referencia `design/`. La CI existe **desde la Fase 1**, con lint, pruebas y Gitleaks, y en cada fase se le añaden integración, extremo a extremo, axe y Lighthouse. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA con una excepción justificada.
**Re-check tras la Fase 1**: PASA. El diseño (modelo de datos, contratos y quickstart) no
introduce violaciones nuevas, y el modelo de datos ya es la fuente de lectura que usará el panel
futuro, de modo que la excepción no genera deuda de reescritura.

## Project Structure

### Documentation (this feature)

```text
specs/001-public-clinic-website/
├── plan.md              # este archivo
├── research.md          # Fase 0: decisiones R1–R17
├── data-model.md        # Fase 1: tablas y estados
├── quickstart.md        # Fase 1: guía de validación
├── contracts/
│   ├── routes.md            # rutas, cabecera, pie y destinos
│   ├── contact-form.md      # Server Action submitContact
│   ├── consent-and-email.md # /api/consent y correos de Brevo
│   └── content-file.md      # esquema de content/<clinica>.yaml
├── checklists/requirements.md
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
design/                      # design system (única fuente visual), ampliado con tokens (R4)
├── tokens.css
└── styles.css

content/
└── petcare.yaml             # contenido ficticio de la demo (R3)

public/media/petcare/        # imágenes propias de la demo

src/
├── app/
│   ├── layout.tsx           # importa design/*.css, la fuente, la franja, la cabecera, el pie y las cookies
│   ├── page.tsx             # /
│   ├── tratamientos/page.tsx
│   ├── la-clinica/page.tsx
│   ├── contacto/{page.tsx,actions.ts,enviado/page.tsx}
│   ├── preguntas-frecuentes/page.tsx
│   ├── (legal)/{aviso-legal,privacidad,politica-de-cookies,terminos}/page.tsx
│   ├── proximamente/[key]/page.tsx
│   ├── cookies/configurar/page.tsx
│   ├── api/{consent,health}/route.ts
│   ├── not-found.tsx · sitemap.ts · robots.ts
├── components/              # SiteHeader, MobileNav, SiteFooter, DemoBanner, CookieBanner,
│                            # OpenStatus, MapEmbed, ContactForm, FaqList, Markdown…
├── domain/                  # lógica pura y testeable: openStatus, contactSchema, rateLimit, sectionHref
├── db/                      # schema.ts (Drizzle), client.ts, queries/
├── content/                 # schema.ts (Zod) y load.ts (carga idempotente)
├── email/                   # outbox.ts, dispatch.ts, brevo.ts, fake.ts, templates/
└── lib/                     # consent cookie, form token (HMAC), client-ip, logger (pino)

drizzle/                     # migraciones versionadas
scripts/                     # content-load.ts, email-dispatch.ts, retention-purge.ts,
                             # fake-email-provider.ts, check-design.ts

tests/
├── unit/                    # domain/*, content schema, email templates
├── integration/             # PostgreSQL real: carga, outbox, deduplicación, límite, purga
└── e2e/                     # Playwright US1–US8, perfil sin JavaScript, axe y teclado

deploy/
├── docker-compose.prod.yml  # app + postgres (red interna) + red chatbot_proxy
├── caddy/petcare.caddy      # bloque {$PETCARE_DOMINIO} para el Caddyfile compartido
├── systemd/                 # email-dispatch, retention-purge y backup (.service y .timer)
├── backup.sh · prueba-ip.sh
└── README.md                # Cloudflare (subdominio, Full strict), Brevo (SPF/DKIM) y VPS

Dockerfile · docker-compose.yml (local) · .env.example · .github/workflows/ci.yml
```

**Structure Decision**: un solo proyecto Next.js en la raíz. La lógica de negocio pura vive en
`src/domain`, sin dependencias de Next ni de la base de datos, para probarla con pruebas unitarias.
El acceso a datos está en `src/db`, y la interfaz en `src/app` y `src/components`. `design/` sigue
siendo la única fuente de estilos y la aplicación lo importa directamente.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Principio VIII**: el contenido (servicios, equipo, preguntas frecuentes, horario, cierres y datos de la clínica) no se gestiona desde el panel de administración, sino con el archivo `content/<clinica>.yaml` y `content:load`. | Es una decisión del responsable (Clarifications, Q1): primero la web pública con datos ficticios, iterando página a página, y el panel en una feature posterior. | Construir ahora el panel exige autenticación de administrador, roles y CRUD para 12 tablas, lo que multiplica el alcance y retrasa la validación de las páginas. Para mitigarlo, las páginas leen solo de la base de datos y no del YAML, la carga es idempotente y está documentada, y cambiar el contenido no toca `src/`. El panel escribirá en las mismas tablas sin rehacer las páginas. **Caducidad**: la excepción se cierra con la feature del panel de administración. |
