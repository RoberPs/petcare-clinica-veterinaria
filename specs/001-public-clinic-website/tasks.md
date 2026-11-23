# Tasks: Web pública de la clínica veterinaria

**Input**: documentos de diseño de `specs/001-public-clinic-website/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **se incluyen**. Los exigen el plan (R17), la definición de "terminado" de la
constitución (pruebas, axe y Lighthouse) y el principio VIII (flujo de contacto de punta a punta).
Dentro de cada historia, las pruebas se escriben **antes** que la implementación y deben fallar
primero.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado una vez terminada la Fase 2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: historia de usuario de la spec (US1–US8).

## Convenciones del proyecto

- Un solo proyecto Next.js en la raíz: `src/`, `tests/`, `content/`, `drizzle/`, `scripts/` y
  `deploy/` (estructura en [plan.md](./plan.md#project-structure)).
- Estilos: **solo** `design/tokens.css` y `design/styles.css`. Cualquier componente nuevo se añade
  a `design/styles.css` usando solo tokens. No se permiten `style=""` ni otros `.css`.
- Textos, comentarios y mensajes en español. Identificadores en inglés.
- Ningún dato de la clínica en `src/`: todo sale de la base de datos (cargada desde
  `content/petcare.yaml`) o del entorno.

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: inicializar el proyecto y sus herramientas.

- [X] T001 Inicializar el proyecto Next.js 15 (App Router) con TypeScript strict (`noUncheckedIndexedAccess`), React 19 y Node 22 en `package.json`, `tsconfig.json` y `next.config.ts`, con `output: 'standalone'` y sin plantillas de ejemplo ni CSS por defecto
- [X] T002 Añadir las dependencias del plan a `package.json`: `drizzle-orm`, `pg`, `zod`, `@js-temporal/polyfill`, `react-markdown`, `yaml` y `pino`. Como dependencias de desarrollo: `drizzle-kit`, `tsx`, `vitest`, `@playwright/test`, `@axe-core/playwright`, `@lhci/cli`, `eslint`, `typescript-eslint`, `eslint-config-next` y `prettier`
- [X] T003 [P] Configurar ESLint en `eslint.config.mjs`, con las reglas `react/forbid-dom-props` (prohíbe `style`) y `react/no-danger` (prohíbe `dangerouslySetInnerHTML`). Añadir Prettier (`.prettierrc`, `.prettierignore`)
- [X] T004 [P] Crear `docker-compose.yml` local con `db` (postgres:16, puerto 5432), `db-test` (postgres:16, puerto 5433) y `email-fake` (ejecuta `scripts/fake-email-provider.ts`)
- [X] T005 [P] Crear `.env.example` sin valores reales con `DATABASE_URL`, `DATABASE_URL_TEST`, `EMAIL_PROVIDER`, `BREVO_API_KEY`, `EMAIL_FROM`, `FORM_SECRET`, `CONSENT_VERSION`, `CLINIC_INBOX_EMAIL`, `CLINIC_PHONE_E164`, `CLINIC_PHONE_DISPLAY`, `LEGAL_OWNER_NAME`, `LEGAL_CONTACT_EMAIL`, `TRUSTED_PROXY_IPS`, `SITE_URL` y `FAKE_EMAIL_URL`, cada una con un comentario en español. Crear `.gitignore` con `.env`, `.next`, `node_modules` y `test-results`
- [X] T006 [P] Configurar Vitest en `vitest.config.ts` (unitarias, `tests/unit`) y en `vitest.integration.config.ts` (`tests/integration`, con `DATABASE_URL_TEST`)
- [X] T007 [P] Configurar Playwright en `playwright.config.ts` con los proyectos `mobile-360` (360×640), `desktop` y `no-js` (`javaScriptEnabled: false`), y `webServer` con `npm run build && npm start`
- [X] T008 [P] Configurar Lighthouse CI en `lighthouserc.json`: preset móvil sobre `/` y aserción `categories:performance >= 0.9`
- [X] T009 Añadir a `package.json` los scripts del plan: `dev`, `build`, `start`, `lint` (eslint + `tsc --noEmit` + `check:design`), `test`, `test:integration`, `test:e2e`, `test:lighthouse`, `db:migrate`, `db:generate`, `content:load`, `email:dispatch`, `email:fake`, `email:fake:list`, `retention:purge` y `check:design`
- [X] T010 [P] Crear `scripts/check-design.ts`. Debe fallar si hay archivos `.css` fuera de `design/`, imports de CSS distintos de `design/tokens.css` y `design/styles.css`, valores hexadecimales o `rgb(` en `src/`, atributos `style=` en `src/`, o, en `design/styles.css`, colores, `px`, `rem` o duraciones literales fuera de `var(--…)` (solo se permite el breakpoint de los `@media`)
- [X] T011 Crear `.github/workflows/ci.yml` **desde el principio** con los trabajos `lint`, `unit` (`--passWithNoTests`), `integration` (servicio postgres:16, `--passWithNoTests`), `e2e` (Playwright con `--pass-with-no-tests`, `db-test` y el correo falso), `lighthouse` (activado a partir de US1) y `gitleaks`. Si cualquiera falla, se bloquea el merge (constitución, flujo y puertas). En cada fase se amplía según haga falta

---

## Phase 2: Foundational (requisitos que bloquean todo)

**Purpose**: base de datos, carga de contenido, design system, layout base y utilidades que usan
todas las historias.

**⚠️ CRITICAL**: no se empieza ninguna historia hasta terminar esta fase.

### Design system (R4)

- [X] T012 Cambiar `--font-family` en `design/tokens.css` a `var(--font-figtree), "Segoe UI", system-ui, sans-serif` (sin "Guardian Sans") y documentar el cambio en `design/README.md`
- [X] T013 Pasar a tokens los valores escritos a mano de `design/styles.css` (hoy son 5 colores y unos 280 `px`). Añadir a `design/tokens.css` la escala que falte (`--fs-*`, `--space-*`, `--size-*`, `--container-*` y similares), sustituir cada literal por `var(--…)` sin cambiar el aspecto (comparar las maquetas de `design/*.html` antes y después con capturas de Playwright) y verificarlo con `npm run check:design`
- [X] T014 Añadir a `design/styles.css`, solo con tokens, un `:focus-visible` global (contorno de 2 px con `--color-navy` y desplazamiento), `.skip-link` (oculto hasta recibir el foco) y `.demo-banner` (franja discreta, con contraste AA y sin `position: fixed`)
- [X] T015 Añadir a `design/styles.css` las clases `.band__row` y `.note--contact`, que sustituyen los `style=""` en línea de `design/tratamientos.html`, `la-clinica.html` y `contacto.html`, y aplicar esas clases en esas maquetas

### Configuración y utilidades

- [X] T016 [P] Crear `scripts/fake-email-provider.ts`, un servidor HTTP que imita Brevo, guarda los correos en memoria, expone `GET /emails` y acepta `--fail N` para simular fallos. Añadir `email:fake:list`. Lo usa el servicio `email-fake` de `docker-compose.yml` (T004)
- [X] T017 [P] Crear `src/lib/env.ts`: validar con Zod las variables de T005 al arrancar y exportar un objeto tipado. Si falta una obligatoria, el error tiene que decir cuál
- [X] T018 [P] Crear `src/lib/logger.ts` con pino en formato JSON, que redacte `email`, `name`, `phone` y `message`
- [X] T019 [P] Crear `src/lib/signing.ts` con `sign(payload)` y `verify(token)` en HMAC-SHA256 sobre `FORM_SECRET`, comparando en tiempo constante. Lo usan el token del formulario y la cookie de consentimiento
- [X] T020 [P] Crear `src/domain/sections.ts` con el tipo `SectionKey` (`reservas | tienda | carrito | consejos | cuenta`) y la función pura `sectionHref(key, sections)`, que devuelve `href` o `/proximamente/<key>` (R12)
- [X] T021 [P] Crear `src/lib/consent.ts` para leer y escribir la cookie `pc_consent` firmada (`{ v, third_party, at }`, Max-Age 12 meses). Debe exportar `getConsent(cookies)`, que devuelve `null` si falta, la firma no es válida o la versión es distinta de `CONSENT_VERSION` ([contracts/consent-and-email.md](./contracts/consent-and-email.md))

### Base de datos (data-model.md)

- [X] T022 Crear `src/db/schema.ts` con todas las tablas de [data-model.md](./data-model.md): `clinic` (con la restricción de fila única), `opening_hours`, `closures`, `services`, `team_members`, `faq_topics`, `faqs`, `activity_stats`, `health_notices`, `contact_reasons`, `legal_pages`, `sections`, `contact_messages`, `email_outbox` (con sus enums y `UNIQUE (contact_message_id, kind)`) y `rate_limit_hits`, cada una con sus índices
- [X] T023 Crear `src/db/client.ts` (pool de `pg` y la instancia de Drizzle) y `drizzle.config.ts`, y generar la primera migración versionada en `drizzle/0000_initial.sql`
- [X] T024 Crear `scripts/migrate.ts`, que aplica las migraciones de `drizzle/` (lo ejecuta `npm run db:migrate`)
- [X] T025 Crear `src/db/queries/site.ts` con `getSiteData()`, que en **una sola consulta** por tabla devuelve `clinic`, `opening_hours`, `closures` vigentes o próximos y `sections`. La usan el layout, la cabecera y el pie

### Contenido (R3, [contracts/content-file.md](./contracts/content-file.md))

- [X] T026 Crear `src/content/schema.ts` con el esquema Zod del archivo de contenido. Debe resolver los marcadores `${VAR}` desde el entorno, impedir tramos solapados y `starts_on > ends_on`, exigir los 4 `legal_pages.kind` y las 5 `sections.key`, y obligar a que `health_notices` tenga `source_url` https
- [X] T027 Crear `src/content/load.ts` con la carga idempotente en una transacción: upsert por `slug`, `published = false` para lo que ya no está, actualización de `clinic` y comprobación de que las imágenes existen en `public/`. No hace falta invalidar ninguna caché: las páginas se renderizan en cada petición (R1)
- [X] T028 Crear `scripts/content-load.ts` (`npm run content:load -- --file <ruta>`). Debe mostrar en español la ruta exacta de cada error de validación y salir con código distinto de 0
- [X] T029 Escribir `content/petcare.yaml` con contenido **ficticio y original** (sin ningún texto de `design/`). Incluye: clínica (nombre PetCare, `demo_banner_enabled: true`, dirección con un nombre de calle claramente inventado y comprobado como inexistente en la ciudad elegida, coordenadas de un espacio público genérico (nunca una vivienda ni un negocio), teléfono como `${CLINIC_PHONE_E164}` y `${CLINIC_PHONE_DISPLAY}` (un número que controla el responsable, nunca inventado), y `inbox_email` y los datos legales como `${VAR}` (R3)), horario de lunes a sábado con tramos partidos, 1 cierre, 8 servicios, 4 profesionales, 3 temas con 3–4 preguntas cada uno, 3 cifras de actividad, 0 avisos de salud, 4 motivos de contacto, las 4 páginas legales en borrador (indicando que PetCare es ficticia y el responsable con `${LEGAL_OWNER_NAME}`) y las 5 secciones con `href: null`
- [X] T030 [P] Crear las imágenes propias de la demo en `public/media/petcare/`: `hero.svg`, `clinica.svg`, `equipo-1.svg`…`equipo-4.svg` y `logo.svg`. Son ilustraciones sencillas hechas para el proyecto, que **no** copian `design/img/` ni `design/reference/`, con dimensiones declaradas. También `placeholder-persona.svg` como imagen neutra de sustitución, y los iconos propios en `public/media/icons/` (`productos`, `tratamientos`, `consejos`, `ubicacion`, `horario`, `telefono`, `correo` y `cita`), que sustituyen a los emojis de `design/` (principio II)

### Layout base

- [X] T031 Crear `src/app/layout.tsx` con `<html lang="es">`, la importación de `design/tokens.css` y `design/styles.css`, Figtree con `next/font/google` (autoalojada, variable `--font-figtree`), el `.skip-link` hacia `#contenido`, `DemoBanner`, una ranura de cabecera, `<main id="contenido">`, una ranura de pie los metadatos base (`title.template`, `metadataBase` desde `SITE_URL`) y `export const dynamic = 'force-dynamic'` (R1, necesario para la CSP con nonce)
- [X] T032 [P] Crear `src/components/DemoBanner.tsx`, que se renderiza solo si `clinic.demo_banner_enabled` y muestra "Web de demostración: {clinic.name} es una clínica ficticia" (FR-007a)
- [X] T033 [P] Crear `src/components/Markdown.tsx` con `react-markdown` sin HTML crudo, limitado a `p`, `a`, `ul`, `ol`, `li`, `strong`, `em`, `h2` y `h3`, y que resuelve los enlaces `section:<key>` con `sectionHref` (R11)
- [X] T034 Crear `src/middleware.ts`, que genera un nonce por petición y fija la CSP de R14 (`default-src 'self'`, `frame-src https://www.openstreetmap.org`, `img-src 'self' data:` y `script-src 'self' 'nonce-…' 'strict-dynamic'`), y añadir en `next.config.ts` `headers()` las cabeceras `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`. Añadir una prueba de extremo a extremo en `tests/e2e/security-headers.spec.ts` que compruebe la CSP con nonce y que no hay errores de CSP en la consola en `/`, `/la-clinica` (con mapa) y `/contacto`
- [X] T035 Crear `src/app/api/consent/route.ts` (POST) según [contracts/consent-and-email.md](./contracts/consent-and-email.md): comprueba `Origin` y `Sec-Fetch-Site`, valida `return_to`, escribe `pc_consent` y responde `303` o JSON según `Accept`. Va aquí porque lo usan US4 y US7
- [X] T036 Crear `src/app/api/health/route.ts`, que hace `SELECT 1` y responde `200 { ok: true }` o `503`
- [X] T037 [P] Crear los helpers de pruebas: `tests/integration/helpers/db.ts` (migra y vacía `db-test`) y `tests/e2e/fixtures.ts` (carga `content/petcare.yaml` en la base de datos de pruebas antes de la suite y expone `axeCheck(page)` con las etiquetas `wcag2a`, `wcag2aa`, `wcag21aa` y `wcag22aa`)
- [X] T038 [P] Prueba unitaria del esquema de contenido en `tests/unit/content-schema.test.ts`: `petcare.yaml` es válido, falla si los tramos se solapan, falla un aviso de salud sin fuente y falla si falta una página legal
- [X] T039 [P] Prueba unitaria en `tests/unit/no-design-copy.test.ts` (SC-010): ningún texto de `content/petcare.yaml` coincide con un texto de más de 20 caracteres extraído de `design/*.html`
- [X] T040 Prueba de integración de la carga en `tests/integration/content-load.test.ts`: cargar dos veces da el mismo resultado, y eliminar un servicio del YAML lo despublica

**Checkpoint**: la base está lista: `db:migrate` y `content:load` funcionan y el layout se renderiza
con la franja de demostración. Las historias pueden empezar.

---

## Phase 3: User Story 1 — Portada con propuesta y accesos directos (P1) 🎯 MVP

**Goal**: la portada muestra la propuesta de la clínica, los tres CTA y los tres accesos rápidos,
cada uno con destino en un clic, y las cifras ficticias sin avisos de salud sin fuente.

**Independent Test**: con un ancho de 360 px, abrir `/` y pulsar los 6 accesos. Cada uno llega a
su destino (`/contacto`, `/la-clinica`, `/tratamientos` o `/proximamente/<key>`) en un clic.

### Tests for User Story 1

- [X] T041 [P] [US1] Prueba de extremo a extremo en `tests/e2e/us1-home.spec.ts`: en `mobile-360`, el titular y los 3 CTA son visibles sin scroll; los 6 accesos llegan a su destino en un clic; el bloque de cifras muestra los valores del YAML; no hay boletín; no aparece ningún aviso de salud sin fuente; con `tests/fixtures/content-with-notice.yaml` (un aviso de salud con fuente), el aviso aparece junto a la cita de su fuente; y axe no da errores
- [X] T042 [P] [US1] Prueba de extremo a extremo en `tests/e2e/coming-soon.spec.ts`: las 5 rutas `/proximamente/<key>` muestran el nombre de la sección, el teléfono, el enlace a Contacto y la vuelta a la portada, llevan `noindex`, y una clave desconocida da 404

### Implementation for User Story 1

- [X] T043 [P] [US1] Crear `src/db/queries/home.ts` con `getHomeData()`, que devuelve el hero de `clinic`, las `activity_stats` publicadas por `position` y las `health_notices` publicadas (que siempre tienen fuente por esquema)
- [X] T044 [P] [US1] Añadir a `design/styles.css`, solo con tokens, la variante `.notice__source` para citar la fuente de un aviso de salud
- [X] T045 [US1] Crear `src/app/page.tsx` según `design/index.html` **sin** la sección `newsletter`: `.hero` con `hero__card` (titular, `preamble`, "Pide cita online" `btn--sky` → `sectionHref('reservas')`, "Contacto" `btn--pink` → `/contacto` y "Conoce la clínica" `btn--ghost` → `/la-clinica`) y `hero__media` con `next/image` `priority`; `.band .cards` con los 3 accesos y los iconos SVG propios de `public/media/icons/` en `card__icon` (decorativos, `alt=""`, **sin emojis**); `.stats` solo si hay cifras; y `.notice` por cada aviso con su fuente. Se renderiza en cada petición (heredado del layout) y lleva sus metadatos
- [X] T046 [US1] Crear `src/app/proximamente/[key]/page.tsx` con `generateStaticParams` para las 5 claves y `notFound()` para el resto, construida con `page-hero`, `breadcrumb` y `cta-box` (teléfono `tel:`, Contacto y portada), con `robots: { index: false }`
- [X] T047 [US1] Crear `src/app/not-found.tsx` (No encontrada) con un mensaje en español, enlaces a la portada y a Contacto y `noindex`

**Checkpoint**: la portada y "Próximamente" funcionan y se prueban de forma independiente.

---

## Phase 4: User Story 2 — Cabecera y pie comunes con menú móvil (P1)

**Goal**: la misma cabecera y el mismo pie en todas las páginas, con un menú móvil completo,
operable con teclado y sin JavaScript.

**Independent Test**: en cada ruta, con 360 px, abrir el menú, recorrer las 5 secciones más "Pide
cita" y "Contacto" con Tab, cerrar con Escape y comprobar que el foco vuelve a "Menú". Con el
perfil `no-js`, el menú también se abre y se cierra.

### Tests for User Story 2

- [X] T048 [P] [US2] Prueba unitaria en `tests/unit/sections.test.ts` de `sectionHref`: con `href` nulo da `/proximamente/<key>` y con `href` lo devuelve tal cual
- [X] T049 [P] [US2] Prueba de extremo a extremo en `tests/e2e/us2-navigation.spec.ts`: el orden de la cabecera cumple FR-003; en móvil se ven las 7 entradas; Escape cierra el menú y devuelve el foco; la página actual tiene `aria-current="page"`; Mi cuenta y Carrito van a "Próximamente"; el pie tiene contacto, secciones, los 4 enlaces legales y "Configurar cookies"; el skip link es el primer foco; la franja de demostración aparece en todas las rutas con `demo_banner_enabled: true` y desaparece al cargar un YAML con `false` (FR-007a); y axe no da errores. Se ejecuta también en el proyecto `no-js`

### Implementation for User Story 2

- [X] T050 [US2] Añadir a `design/styles.css`, solo con tokens y dentro de `@media (max-width: 900px)`: `.mobile-nav` (un `<details>`), `.nav-toggle` (un `summary` con objetivo táctil de 24 px o más) y `.mobile-nav__panel` con las 5 secciones y los chips "Pide cita" y "Contacto". En escritorio `.mobile-nav` está oculto. Además, `.open-status` con sus variantes `--open` y `--closed`
- [X] T051 [P] [US2] Crear `src/domain/open-status.ts` con la función pura `getOpenStatus(now, weeklyHours, closures)` en `Europe/Madrid` con Temporal, que devuelve `{ state: 'open', closesAt }` o `{ state: 'closed', opensAt }` mirando hasta 14 días por delante (R10)
- [X] T052 [P] [US2] Prueba unitaria en `tests/unit/open-status.test.ts`: tramos partidos, día cerrado, cierre excepcional de varios días, cambio de hora en marzo y octubre, y ningún tramo en 14 días
- [X] T053 [P] [US2] Crear `src/components/OpenStatus.tsx`, que renderiza "Abierto ahora · cierra a las HH:MM" o "Cerrado ahora · abre el <día> a las HH:MM" con `.open-status`
- [X] T054 [US2] Crear `src/components/SiteHeader.tsx` (Server Component): logo o nombre → `/`; `.main-nav` con las 5 entradas en el orden de FR-003 (`aria-current` según la ruta); `.header-cta` con Mi cuenta → `sectionHref('cuenta')`, Pide cita `btn--sky`, Contacto `btn--pink` y Carrito `icon-link` el último → `sectionHref('carrito')`; y `MobileNav`
- [X] T055 [US2] Crear `src/components/MobileNav.tsx`, un `<details class="mobile-nav">` que funciona sin JavaScript, más el componente cliente `MobileNavEnhancer.tsx`, que cierra con Escape, devuelve el foco al `summary`, retiene el foco mientras está abierto y cierra al navegar
- [X] T056 [US2] Crear `src/components/SiteFooter.tsx` con `.site-footer` y `.footer__grid`: nombre, teléfono `tel:`, correo `mailto:` (si hay), dirección, horario resumido con `OpenStatus`, La clínica, Tratamientos, Contacto, Preguntas frecuentes, los 4 enlaces legales y "Configurar cookies" → `/cookies/configurar`
- [X] T057 [US2] Conectar `SiteHeader` y `SiteFooter` en `src/app/layout.tsx` con los datos de `getSiteData()`

**Checkpoint**: la navegación completa funciona en móvil, con teclado y sin JavaScript.

---

## Phase 5: User Story 3 — Consultar tratamientos y servicios (P1)

**Goal**: la lista de servicios publicados, con nombre y descripción, y los CTA de cita y contacto.

**Independent Test**: abrir `/tratamientos` y comprobar que salen los 8 servicios del YAML en orden,
cada uno con nombre y descripción. Con un servicio despublicado, no aparece. Sin servicios, sale el
mensaje que invita a contactar.

### Tests for User Story 3

- [X] T058 [P] [US3] Prueba de extremo a extremo en `tests/e2e/us3-services.spec.ts`: los servicios en orden con nombre y descripción, la ausencia de un servicio despublicado (recargando un YAML modificado en la base de datos de pruebas), el estado vacío, los CTA finales (Pide cita → "Próximamente" y Contacto) y axe

### Implementation for User Story 3

- [X] T059 [P] [US3] Crear `src/db/queries/services.ts` con `getPublishedServices()`, ordenada por `position` y `slug`
- [X] T060 [P] [US3] Añadir a `design/styles.css`, solo con tokens, `.service-list` y `.service` (tarjeta con nombre `h3` y descripción, sobre la base de `link-card`, pero sin flecha porque no hay página de detalle)
- [X] T061 [US3] Crear `src/app/tratamientos/page.tsx` según `design/tratamientos.html`: `photo-hero` con su tarjeta, `section` con la lista de servicios o el estado vacío (texto y botón Contacto), y una `band` con `band__row` y los CTA "Pide cita" (`btn--sky`) y "Contacto" (`btn--pink`). Se renderiza en cada petición (heredado del layout) y lleva sus metadatos

**Checkpoint**: US1, US2 y US3 forman el MVP P1 completo.

---

## Phase 6: User Story 4 — Conocer la clínica (P2)

**Goal**: dirección, horario con su estado, contacto, equipo (foto, nombre y especialidad) y el mapa
sujeto a consentimiento.

**Independent Test**: abrir `/la-clinica` y comprobar todos los datos y el equipo. Sin
consentimiento no hay petición a `openstreetmap.org` y se ve el marcador; tras aceptar desde el
marcador, aparece el mapa.

### Tests for User Story 4

- [X] T062 [P] [US4] Prueba unitaria en `tests/unit/map-url.test.ts` de `buildOsmEmbedUrl(lat, lng)` y `buildOsmLink(lat, lng)`: `bbox` correcto y coordenadas con 6 decimales
- [X] T063 [P] [US4] Prueba de extremo a extremo en `tests/e2e/us4-clinic.spec.ts`: dirección, horario de los 7 días, `OpenStatus` (reloj simulado con `page.clock` en un domingo → "Cerrado ahora · abre el lunes…"), aviso de cierre próximo, el equipo con `alt` y el sustituto sin foto, `tel:` y `mailto:`, ninguna petición a `openstreetmap.org` sin consentimiento, el mapa tras pulsar "Aceptar y ver el mapa", y axe

### Implementation for User Story 4

- [X] T064 [P] [US4] Crear `src/domain/map.ts` con `buildOsmEmbedUrl` y `buildOsmLink` (R9)
- [X] T065 [P] [US4] Crear `src/db/queries/clinic.ts` con `getClinicPageData()`, que devuelve `clinic`, `opening_hours`, `closures` vigentes o próximos (30 días) y los `team_members` publicados
- [X] T066 [P] [US4] Añadir a `design/styles.css`, solo con tokens, `.map-placeholder` (dirección, enlace y botón) y `.closure-notice`
- [X] T067 [US4] Crear `src/components/MapEmbed.tsx`: si `getConsent()?.third_party`, un `<iframe>` de OpenStreetMap con `title` y `loading="lazy"`. Si no, `.map-placeholder` con la dirección, el enlace externo "Abrir en el mapa" (`rel="noopener"`) y un `<form method="post" action="/api/consent">` con `choice=accept` y `return_to` que hace de botón "Aceptar y ver el mapa". Si no hay coordenadas, no renderiza nada
- [X] T068 [P] [US4] Crear `src/components/WeeklyHours.tsx` (los 7 días, con "Cerrado" en los días sin tramos y varios tramos por día) y `src/components/ClosureNotice.tsx`
- [X] T069 [P] [US4] Crear `src/components/TeamMember.tsx` con `.member`: `next/image` con `alt` (o `placeholder-persona.svg` y "Foto de {name}" si no tiene foto), nombre `h3` y especialidad
- [X] T070 [US4] Crear `src/app/la-clinica/page.tsx` según `design/la-clinica.html`: `photo-hero` (imagen `about`, CTA Pide cita `btn--sky`), `info-grid` (Dónde estamos, Horario con `OpenStatus` y `ClosureNotice`, Contacto con `btn--pink`, con iconos SVG propios y **sin emojis**), `team`, "Cómo llegar" con `MapEmbed` y la `band` final. Se renderiza en cada petición (heredado del layout) y lleva sus metadatos

**Checkpoint**: La clínica funciona de forma independiente y respeta el consentimiento.

---

## Phase 7: User Story 5 — Enviar un mensaje de contacto (P2)

**Goal**: el formulario valida, registra el mensaje una sola vez, confirma, envía el mensaje a la
clínica y el acuse al visitante mediante la bandeja de salida con reintentos, y funciona sin
JavaScript.

**Independent Test**: enviar un mensaje válido y comprobar que hay 1 fila en `contact_messages`, 1
correo a la clínica y 1 acuse sin el texto en el buzón falso. Repetir el envío con el mismo token y
comprobar que no hay duplicados. Con `no-js`, el envío redirige a `/contacto/enviado`.

### Tests for User Story 5

- [X] T071 [P] [US5] Prueba unitaria en `tests/unit/contact-schema.test.ts`: cada regla y cada mensaje de error de [contracts/contact-form.md](./contracts/contact-form.md) (correo inválido, teléfono opcional, mensaje de 10 a 2.000 caracteres, privacidad obligatoria)
- [X] T072 [P] [US5] Prueba unitaria en `tests/unit/rate-limit.test.ts` de `toBucket(ip)`: IPv4 completa, IPv6 agrupada en /64 e IPv4 mapeada en IPv6, y el resultado es un HMAC que no contiene la IP en claro
- [X] T073 [P] [US5] Prueba unitaria en `tests/unit/email-templates.test.ts`: `clinic_notification` incluye todos los datos y `reply-to`; `visitor_ack` **no** incluye el mensaje ni el motivo y añade el aviso de demostración si `demo_banner_enabled`; y todo el contenido va escapado
- [X] T074 [P] [US5] Prueba de integración en `tests/integration/contact-submit.test.ts`: un envío válido crea el mensaje y las 2 filas de la bandeja de salida en una transacción; el mismo `submission_id` no crea nada nuevo y devuelve `ok`; un segundo mensaje del mismo correo en menos de una hora deja el acuse en `skipped_rate_limit`; con 5 envíos por IP en 10 minutos el sexto da `rate_limited`; el campo trampa o un envío en menos de 3 s no persisten nada; y `purge_after` está a 12 meses
- [X] T075 [P] [US5] Prueba de integración en `tests/integration/email-dispatch.test.ts` contra el proveedor falso: un `201` deja `sent`; un `5xx` incrementa `attempts` y aplica el backoff; con 8 fallos queda `failed` y se registra en el log; un `401` da `failed` inmediato; y fallar el acuse no afecta a `clinic_notification`
- [X] T076 [P] [US5] Prueba de extremo a extremo en `tests/e2e/us5-contact.spec.ts`: envío válido con confirmación y plazo; correo inválido con error junto al campo, el foco en él, `aria-invalid` y datos conservados; campos vacíos con el foco en el primer error; doble clic → 1 mensaje; estado "Enviando…" con la red ralentizada; teléfono marcado como opcional; contador de 2.000 caracteres; axe. Con `no-js`: envío → `/contacto/enviado` y recarga sin duplicado

### Implementation for User Story 5

- [X] T077 [P] [US5] Crear `src/domain/contact-schema.ts` con el esquema Zod y los mensajes en español del contrato, compartido por el cliente y el servidor
- [X] T078 [P] [US5] Crear `src/domain/rate-limit.ts` con `toBucket(ip)` (IPv4 completa o IPv6 /64, devuelto como `HMAC-SHA256(FORM_SECRET, "contact:" + clave)`, nunca la IP en claro) y la regla de 5 envíos en 10 minutos, y `src/lib/client-ip.ts`, que lee `X-Forwarded-For` solo si el que hace la petición está en `TRUSTED_PROXY_IPS` (R6 y R16)
- [X] T079 [P] [US5] Crear `src/lib/form-token.ts`, que genera `submission_token` (UUID y sello temporal firmados con `signing.ts`) y lo verifica (de 3 s a 24 h)
- [X] T080 [P] [US5] Crear las plantillas en texto y HTML escapado de [contracts/consent-and-email.md](./contracts/consent-and-email.md) en `src/email/templates/clinic-notification.ts` y `src/email/templates/visitor-ack.ts`
- [X] T081 [P] [US5] Crear `src/email/provider.ts` con la interfaz `EmailProvider.send(msg)`, que devuelve `{ ok, providerMessageId?, retryable, code }`, y sus dos implementaciones: `src/email/brevo.ts` (`POST /v3/smtp/email` con `api-key` y un tiempo de espera de 10 s) y `src/email/fake.ts` (que publica en `FAKE_EMAIL_URL`)
- [X] T082 [US5] Crear `src/db/queries/contact.ts` con `createContactMessage()`, que en una transacción hace `INSERT … ON CONFLICT (submission_id) DO NOTHING` con `privacy_accepted_at = now()`, `privacy_version` (el `legal_pages.version` vigente de `privacidad`, FR-029) y `purge_after`, crea la bandeja de salida (`clinic_notification` y `visitor_ack` o `skipped_rate_limit` según `recipient_hash` en la última hora) e inserta en `rate_limit_hits`. Añadir `countRecentHits(bucket)`
- [X] T083 [US5] Crear `src/email/dispatch.ts` con `dispatchPending(limit)`, que bloquea filas con `FOR UPDATE SKIP LOCKED`, compone el correo desde `contact_messages` y `clinic`, lo envía y actualiza el estado con el backoff 1/5/15/60 min y luego cada 6 h hasta 8 intentos, y registra `failed` en el log con `message_id` y `code`. Añadir `dispatchForMessage(id)`, que es el intento inmediato
- [X] T084 [US5] Crear `scripts/email-dispatch.ts` (`npm run email:dispatch`), que procesa los pendientes y termina
- [X] T085 [US5] Crear `src/app/contacto/actions.ts` con el Server Action `submitContact`, que sigue en orden [contracts/contact-form.md](./contracts/contact-form.md): campo trampa, token, límite por IP, validación, `createContactMessage` y `after(() => dispatchForMessage(id))`. Devuelve `ContactResult`, y si no hay JavaScript hace `redirect('/contacto/enviado')`
- [X] T086 [P] [US5] Añadir a `design/styles.css`, solo con tokens, `.field--invalid`, `.field__error`, `.field__hint` (con la indicación "opcional" y el contador), `.form-summary` (resumen de errores) y `.form-success`
- [X] T087 [US5] Crear `src/components/ContactForm.tsx` (componente cliente con `useActionState`): campos con `<label>`, `autocomplete`, `required`, `maxLength`, `aria-invalid` y `aria-describedby`; el campo trampa `web` oculto y fuera del orden de tabulación; `submission_token` oculto; motivos desde la base de datos; enlace a `/privacidad`; foco al primer error; botón deshabilitado con "Enviando…"; contador de caracteres; y, si hay error, valores conservados y teléfono como alternativa. Usa `btn--pink`
- [X] T088 [US5] Crear `src/app/contacto/page.tsx` (dinámica) según `design/contacto.html`: `page-hero` con `breadcrumb`, `contact-grid` con `ContactForm` y un lateral con `note--contact` (teléfono, horario, `OpenStatus` y `ClosureNotice`, FR-019), dirección, correo y `MapEmbed`, con iconos SVG propios y **sin emojis**. Genera un token nuevo en cada petición. Lleva sus metadatos
- [X] T089 [US5] Crear `src/app/contacto/enviado/page.tsx`, la confirmación del patrón PRG con `.form-success`, el plazo de respuesta (`clinic.response_time_text`) y un enlace a la portada, con `noindex`

**Checkpoint**: contacto de punta a punta, sin duplicados ni pérdidas, con y sin JavaScript.

---

## Phase 8: User Story 6 — Preguntas frecuentes por tema (P2)

**Goal**: las preguntas publicadas agrupadas por tema, en acordeón nativo.

**Independent Test**: abrir `/preguntas-frecuentes` y comprobar los 3 grupos en orden, y que cada
pregunta se despliega con clic, Enter y Espacio, y también sin JavaScript.

### Tests for User Story 6

- [X] T090 [P] [US6] Prueba de extremo a extremo en `tests/e2e/us6-faq.spec.ts`: grupos en el orden del YAML, un tema sin preguntas publicadas que no aparece, despliegue con teclado, un enlace `section:tienda` que lleva a `/proximamente/tienda`, el CTA a Contacto, el proyecto `no-js` y axe

### Implementation for User Story 6

- [X] T091 [P] [US6] Crear `src/db/queries/faq.ts` con `getFaqByTopic()`, que devuelve los temas con preguntas publicadas, ordenados por `position`
- [X] T092 [US6] Crear `src/app/preguntas-frecuentes/page.tsx` según `design/faqs.html`: `page-hero` con `breadcrumb` y, en `.faq`, un `h2` por tema y `<details class="faq__item">` con `<summary>` y la respuesta en `Markdown`, más una `cta-box` con Contacto (`btn--pink`). Se renderiza en cada petición (heredado del layout) y lleva sus metadatos

**Checkpoint**: las preguntas frecuentes funcionan de forma independiente.

---

## Phase 9: User Story 7 — Aceptar o rechazar cookies no esenciales (P2)

**Goal**: el aviso de cookies con "Aceptar" y "Rechazar" equivalentes, la elección recordada 12
meses y la posibilidad de cambiarla o retirarla desde el pie.

**Independent Test**: en un contexto nuevo, rechazar, navegar y abrir `/la-clinica`: no hay
peticiones a terceros y el aviso no vuelve. Desde "Configurar cookies", aceptar: el mapa aparece.
Con `no-js` funciona igual.

### Tests for User Story 7

- [X] T093 [P] [US7] Prueba unitaria en `tests/unit/consent.test.ts`: una firma no válida da `null`, una versión distinta da `null`, y se respetan el Max-Age y el formato de la cookie
- [X] T094 [P] [US7] Prueba de extremo a extremo en `tests/e2e/us7-cookies.spec.ts`: el aviso en la primera visita con dos botones del mismo tamaño (se comparan sus `boundingBox`) y el enlace a la política; "Rechazar" quita el aviso, que no vuelve, y no hay peticiones a terceros en ninguna ruta; "Aceptar" carga el mapa sin recargar; desde `/cookies/configurar` se puede retirar y el mapa desaparece; con un cambio de `CONSENT_VERSION` se vuelve a preguntar; y el proyecto `no-js` y axe

### Implementation for User Story 7

- [X] T095 [P] [US7] Añadir a `design/styles.css`, solo con tokens, `.cookie-banner` (fijo abajo, sin tapar el contenido principal: añade un `padding-bottom` al `body` mientras se ve), `.cookie-banner__actions` (dos botones con el mismo `flex`, mismo tamaño y misma prominencia: los dos usan la clase base `.btn`, que es marino, la acción neutra) y `.cookie-settings`
- [X] T096 [US7] Crear `src/components/CookieBanner.tsx`, que se renderiza en el servidor si `getConsent()` es `null`. Es un `<form method="post" action="/api/consent">` con `return_to` igual a la ruta actual, dos `<button name="choice">` ("Aceptar" y "Rechazar") y un enlace a `/politica-de-cookies`, con `role="region"` y `aria-label="Aviso de cookies"`. Se acompaña de `CookieBannerEnhancer.tsx`, que envía con `fetch` (`Accept: application/json`), oculta el aviso y hace `router.refresh()` para que el mapa aparezca sin recargar
- [X] T097 [US7] Crear `src/app/cookies/configurar/page.tsx` (dinámica y con `noindex`), que muestra el estado actual y la fecha, explica la categoría "terceros (mapa)" y ofrece el mismo formulario para aceptar o rechazar y volver
- [X] T098 [US7] Conectar `CookieBanner` en `src/app/layout.tsx` después del pie

**Checkpoint**: el consentimiento cumple la guía de la AEPD en todas las rutas.

---

## Phase 10: User Story 8 — Páginas legales desde el pie (P3)

**Goal**: aviso legal, privacidad, cookies y términos, configurables y con fecha de actualización.

**Independent Test**: desde el pie, abrir las 4 páginas y comprobar el título, la fecha, el
responsable real, la mención de que PetCare es ficticia y la ausencia de NIF.

### Tests for User Story 8

- [X] T099 [P] [US8] Prueba de extremo a extremo en `tests/e2e/us8-legal.spec.ts`: los 4 enlaces del pie llevan a su página con título y "Última actualización"; el aviso legal muestra `LEGAL_OWNER_NAME` y `LEGAL_CONTACT_EMAIL` del entorno de pruebas y la mención de clínica ficticia, sin NIF; el enlace de privacidad del formulario y el de cookies del aviso apuntan a las mismas rutas; y axe

### Implementation for User Story 8

- [X] T100 [P] [US8] Crear `src/db/queries/legal.ts` con `getLegalPage(kind)`
- [X] T101 [P] [US8] Crear `src/components/LegalPage.tsx` con `page-hero`, `breadcrumb`, `prose`, el cuerpo en `Markdown`, la fecha "Última actualización: <updated_on>" en formato español y un bloque con los datos del titular (solo los no nulos)
- [X] T102 [US8] Crear `src/app/(legal)/aviso-legal/page.tsx`, `privacidad/page.tsx`, `politica-de-cookies/page.tsx` y `terminos/page.tsx`, que usan `LegalPage`, con renderizado dinámico y sus metadatos
- [X] T103 [US8] Completar en `content/petcare.yaml` los 4 textos legales de la demo: finalidad de cada campo del formulario (FR-023), 12 meses de conservación, derechos y correo para ejercerlos, Brevo como encargado del tratamiento, la cookie `pc_consent` y el mapa de OpenStreetMap como tercero, y la mención expresa de que PetCare es ficticia

**Checkpoint**: las 8 historias funcionan de forma independiente.

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: SEO, conservación, despliegue, CI y verificación final.

- [X] T104 [P] Crear `src/app/sitemap.ts` (solo las rutas indexables) y `src/app/robots.ts`, y revisar que cada página tiene un título y una descripción propios en español (FR-046)
- [X] T105 [P] Crear `scripts/retention-purge.ts` (`npm run retention:purge`), que borra los `contact_messages` con `purge_after < now()` (y su bandeja de salida, en cascada) y los `rate_limit_hits` de más de 24 h. Añadir su prueba en `tests/integration/retention-purge.test.ts`
- [X] T106 [P] Prueba de extremo a extremo transversal en `tests/e2e/a11y-all-routes.spec.ts`: axe en todas las rutas de [contracts/routes.md](./contracts/routes.md), con zoom al 200 % sin scroll horizontal en 360 px y con `prefers-reduced-motion` (SC-006)
- [X] T107 [P] Prueba de extremo a extremo en `tests/e2e/slow-network.spec.ts`: con 3G lento emulado (CDP), el titular y el teléfono son visibles en menos de 4 s y el CLS es 0,1 o menos (SC-008)
- [X] T108 [P] Crear `Dockerfile` en varias etapas: build de Next standalone más los scripts compilados con esbuild a `cli/*.mjs` (`content-load`, `email-dispatch`, `retention-purge` y `migrate`), y una imagen final `node:22-alpine` sin root con `HEALTHCHECK` sobre `/api/health`
- [X] T109 [P] Crear `deploy/docker-compose.prod.yml` con `petcare-app` (redes `chatbot_proxy` e interna) y `petcare-db` (postgres:16, solo en la red interna, con un volumen y sin puertos)
- [X] T110 [P] Crear `deploy/caddy/petcare.caddy` con el bloque `{$PETCARE_DOMINIO} { import instancia petcare-app }` para el Caddyfile compartido, con comentarios sobre `CF-Connecting-IP` y el nivel único del subdominio
- [X] T111 [P] Crear las unidades de systemd en `deploy/systemd/`: `petcare-email-dispatch.service` y `.timer` (cada minuto), `petcare-purge.service` y `.timer` (diario) y `petcare-backup.service` y `.timer` (diario), además de `deploy/backup.sh` (`pg_dump` rotado a 14 días)
- [X] T112 [P] Crear `deploy/prueba-ip.sh`, que comprueba que falsear `X-Forwarded-For` no salta el límite de envíos a través de Cloudflare
- [X] T113 Escribir `deploy/README.md`, la guía paso a paso: Cloudflare (registro `A` `petcare` en `automatizacionro.work`, proxy, Full strict, «Always Use HTTPS», «Rocket Loader» y «Email Obfuscation» apagados, y la regla temporal si hay un 526), Brevo (dominio con SPF y DKIM, clave dedicada), el entorno del VPS, la migración, la carga de contenido, los temporizadores y las comprobaciones
- [X] T114 Actualizar `README.md` y `CLAUDE.md` de la raíz: estado "implementada", comandos reales y la ruta de `deploy/README.md`
- [X] T115 Ejecutar [quickstart.md](./quickstart.md) completo (comprobaciones manuales US1–US8, el perfil sin JavaScript, el reintento de correo y el cambio de clínica con un `content/otra.yaml` temporal) y anotar el resultado en `specs/001-public-clinic-website/checklists/quickstart-run.md`

---

## Dependencies & Execution Order

### Dependencias entre fases

- **Setup (F1)**: no depende de nada.
- **Foundational (F2)**: depende de F1 y **bloquea todas las historias**.
- **Historias (F3–F10)**: dependen solo de F2 y se pueden hacer en paralelo o en orden de
  prioridad: US1 → US2 → US3 → US4 → US5 → US6 → US7 → US8.
- **Polish (F11)**: después de las historias que se quieran publicar. T106 y T115 necesitan todas.

### Dependencias entre historias (todas débiles: no bloquean las pruebas independientes)

- **US1, US3, US4 y US6** muestran la cabecera y el pie cuando US2 ya está hecha, pero sus pruebas
  no dependen de ellos.
- **US4 y US5** usan `MapEmbed`: lo crea US4 (T067). Si US5 va antes, T088 crea `MapEmbed`.
- **US2** (pie) y **US5** (formulario) enlazan a las páginas legales de **US8**. El enlace existe
  desde el principio, pero no tiene destino hasta US8. Las pruebas de US2 y US5 comprueban el
  `href`, no el destino.
- **US7** y **US4** comparten `/api/consent`, que está en F2 (T035).
- **US2** crea `getOpenStatus` (T051), que también usan US4 y US5. Si US4 o US5 van antes, la
  tarea T051 pasa a esa historia.

### Dentro de cada historia

Primero las pruebas, que deben fallar. Después las consultas, la lógica de dominio y los estilos
(en paralelo), luego los componentes y por último la página.

---

## Parallel Examples

```text
# F2, una vez creado el esquema (T022):
T017 env.ts · T018 logger.ts · T019 signing.ts · T020 sections.ts · T021 consent.ts · T030 media

# US1:
T041 e2e portada · T042 e2e próximamente · T043 home.ts · T044 .notice__source

# US2:
T048 test sections · T051 open-status.ts · T052 test open-status · T053 OpenStatus.tsx

# US5 (las pruebas primero, todas en paralelo):
T071 · T072 · T073 · T074 · T075 · T076
# después, en paralelo:
T077 contact-schema · T078 rate-limit · T079 form-token · T080 templates · T081 providers · T086 estilos

# Con varias personas, tras F2:
Persona A: US1 → US3   ·   Persona B: US2 → US6   ·   Persona C: US5   ·   Persona D: US4 → US7 → US8
```

---

## Implementation Strategy

### MVP primero (las historias P1)

1. F1 Setup y F2 Foundational.
2. **US1** (portada y "Próximamente"). **Parar y validar**: ya es una demo enseñable.
3. **US2** (navegación común) y **US3** (tratamientos), que completan el MVP P1: qué ofrece la
   clínica y cómo moverse por la web.

### Entrega incremental

4. **US4** (dónde está) → **US5** (contacto real) → **US6** (preguntas frecuentes) → **US7**
   (cookies; obligatorio antes de publicar con el mapa).
5. **US8** (legales; **obligatorio antes de publicar**, porque el formulario recoge datos
   personales reales).
6. F11: despliegue en `petcare.automatizacionro.work` y CI.

> **Requisito para publicar**: US5 no se publica sin US7 y US8, porque el formulario trata datos
> reales y la política de privacidad tiene que existir. El mapa no se publica sin US7.

### Iteración del contenido

Tal y como decidió el responsable, el contenido se amplía página a página editando
`content/petcare.yaml` y ejecutando `npm run content:load`, sin tocar `src/`.

---

## Notes

- `[P]` = archivos distintos y sin dependencias pendientes.
- Cada componente nuevo de `design/styles.css` usa solo variables de `tokens.css`. `npm run lint`
  (con `check:design`) lo vigila.
- Commit al terminar cada tarea o grupo lógico, **solo cuando el usuario lo pida**.
- Se puede parar en cualquier checkpoint para validar la historia por separado.
