# Tasks: Consejos de salud y boletín

**Input**: documentos de diseño de `specs/006-health-tips-newsletter/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/) y [quickstart.md](./quickstart.md).

**Tests**: **se incluyen**. La definición de terminado de CLAUDE.md exige que pasen los tests de la
feature, y el plan los detalla en E18. Los de cada historia se escriben antes de implementarla y
deben fallar.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado sobre la fase 2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: la historia a la que pertenece (US1–US5).

## Convenciones del proyecto

- Son las mismas de la 001 a la 005:
  - un solo proyecto Next.js;
  - estilos solo en `design/` y con tokens, sin `style=""`;
  - textos en español e identificadores en inglés;
  - ningún dato de la clínica en `src/`: todo sale de `post_categories`, `posts`,
    `newsletter_settings`, `legal_pages` y `sections`, cargados desde `content/petcare.yaml`.
- **Capas**:
  - `src/domain/` es puro (sin Next, React, Drizzle ni `pg`): consulta del listado, búsqueda,
    texto plano del Markdown y esquemas Zod;
  - los efectos van en `src/lib/newsletter/`;
  - las lecturas van en `src/db/queries/{posts,posts-visibility,newsletter}.ts`;
  - las vistas van en `src/app/**` y `src/components/`.
- **Visibilidad**: una publicación es visible si `published AND published_at <= now()`. Ese filtro
  vive en una sola función (`visiblePosts()` en `src/db/queries/posts.ts`) que usan el listado,
  el detalle, el middleware y el sitemap.
- **Sincronización**: `customers.marketing_opt_in`, `marketing_opt_in_changed_at` y los
  consentimientos `marketing_opt_*` se escriben **solo** desde `src/lib/newsletter/sync.ts` (E11).
  Ningún otro módulo hace `UPDATE customers SET marketing_opt_in`.
- **Respuesta uniforme**: `subscribe()` devuelve el mismo resultado en todos los estados (E9).
  Ningún log ni mensaje distingue un correo nuevo de uno ya suscrito.
- **Decisiones**: las referencias E1–E18 son de [research.md](./research.md). Las rutas y acciones
  están en [contracts/routes.md](./contracts/routes.md); el YAML en
  [contracts/content-file.md](./contracts/content-file.md); los correos en
  [contracts/emails.md](./contracts/emails.md); y la exportación en
  [contracts/export-format.md](./contracts/export-format.md).
- **Firmas**: `sign`/`verify` de `src/lib/signing.ts` (clave derivada de `FORM_SECRET`, propósito
  `newsletter-unsubscribe`); huella de baja con `NEWSLETTER_HASH_KEY` (E7).
- **Tests de integración**: usan `setupTestDb` y `truncateAll` de `tests/integration/helpers/db.ts`
  y `EMAIL_PROVIDER=fake`. Los e2e usan `loadPetcare` de `tests/e2e/db.ts`, corren en los proyectos
  `mobile-360`, `desktop` y `no-js`, y pasan axe en cada página nueva. Ninguno usa la red.
- **Logs**: solo `post_id`, `subscription_id` y códigos de error; nunca el correo ni el texto
  buscado (FR-032).

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Comprobar el entorno: `docker compose up -d`, `npm run db:migrate` hasta `0004_cart_checkout` en desarrollo (5434) y en pruebas (5433), y que `npm run lint`, `npm test` y `npm run test:integration` pasan en verde antes de empezar (anotar cualquier fallo previo en `specs/006-health-tips-newsletter/checklists/requirements.md`)
- [X] T002 [P] Añadir `NEWSLETTER_HASH_KEY=` a `.env.example` (comentario: 32 bytes aleatorios en base64; solo hace falta si el boletín está activo) y un valor de prueba en el entorno de Vitest de integración y de `playwright.config.ts`; no se valida en `src/lib/env.ts` al arrancar (no consulta la base de datos): lo exige `src/lib/newsletter/hash.ts` al usarse y `content:load` si `newsletter.enabled` (E7)
- [X] T003 [P] Crear las carpetas `src/lib/newsletter/`, `public/media/petcare/consejos/` y el helper vacío `tests/integration/helpers/newsletter.ts` (se rellena en T032)

---

## Phase 2: Foundational (prerrequisitos bloqueantes)

**Purpose**: esquema, migración, carga de contenido y piezas compartidas que necesitan todas las
historias.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

- [X] T004 Añadir a `src/db/schema.ts` los enums `post_kind`, `newsletter_status`, `newsletter_source` y `newsletter_unsubscribe_reason`; ampliar `legal_kind` con `boletin` y `outbox_kind` con `newsletter_confirm`; y las tablas `post_categories`, `posts`, `newsletter_subscriptions`, `newsletter_unsubscribe_records` y `newsletter_settings` con columnas, CHECK, UNIQUE e índices parciales de [data-model.md](./data-model.md); ampliar el CHECK de `processed_submissions.scope` con `newsletter`
- [X] T005 Generar `drizzle/0005_health_tips_newsletter.sql` con `drizzle-kit generate` y completarla a mano con los `ALTER TYPE … ADD VALUE`, los CHECK, los índices parciales y el backfill de E12 (sección "Backfill" de data-model.md); aplicarla en 5434 y 5433 y comprobar que `npm run db:migrate` es idempotente
- [X] T006 [P] Test unitario del esquema del contenido en `tests/unit/content-posts.test.ts`: `post_categories`, `posts` (categoría obligatoria en `article`, opcional en `news`, slug único, categoría existente, `image_alt` obligatorio con imagen, `body_md` sin `#` de nivel 1, ≤ 40 000), `newsletter` opcional y `legal_pages.boletin` obligatoria si `newsletter.enabled` ([contracts/content-file.md](./contracts/content-file.md))
- [X] T007 [P] Crear `src/domain/markdown-text.ts` con `markdownToPlainText(md)` (quita marcas de encabezado, énfasis, listas y enlaces conservando su texto) y su test en `tests/unit/markdown-text.test.ts`
- [X] T008 Ampliar `src/content/schema.ts` con `post_categories`, `posts` y `newsletter`, el `legal_kind` `boletin` y las reglas cruzadas de T006 (mensajes en español con la ruta del campo); `meta_description` por defecto = preámbulo recortado a 160
- [X] T009 Ampliar `src/content/load.ts`: `loadPostCategories` (upsert por `key`; borrar las ausentes sin publicaciones y fallar con el slug si las tienen), `loadPosts` (upsert por `slug`, `published_at` = fecha a las 00:00 `Europe/Madrid` con Temporal, `search_text` = `normalizeSearch(title + lead + markdownToPlainText(body_md))`, `unpublishMissing`), `loadNewsletter` (fila única de `newsletter_settings`, `enabled = false` si falta el bloque); añadir `posts[].image` a `checkImages`; ampliar `LoadSummary` y el `console.log` de `scripts/content-load.ts`
- [X] T010 [P] Test de integración de la carga en `tests/integration/posts-load.test.ts`: carga, recarga idempotente, despublicación de un slug ausente, categoría ausente con y sin publicaciones, `search_text` sin tildes y `newsletter` ausente → desactivado
- [X] T011 Crear `src/db/queries/posts.ts` con `visiblePosts()` (filtro único de visibilidad), `listCategories()`, `getVisiblePostBySlug(slug)`, `listVisiblePostSlugs()` y la consulta paginada `listPosts({ kind?, categoryKey?, words[], page, pageSize })` + `countPosts(...)` (AND de `search_text LIKE %palabra% ESCAPE '\'` con `escapeLike`, orden `published_at DESC, id`)
- [X] T012 [P] Crear `src/db/queries/newsletter.ts` con `getNewsletterSettings()` y `src/db/queries/posts-visibility.ts` con `postsRouteExists(slug | null)` (una consulta: sección `consejos` con `href` no nulo + publicación visible si hay slug)
- [X] T013 Generalizar `src/components/Pagination.tsx` para recibir `hrefFor(page: number): string` en lugar de `buildCatalogHref`/`CatalogState`, y adaptar su uso en `src/app/productos/page.tsx` sin cambiar el HTML resultante (los e2e de la 004 deben seguir en verde)
- [X] T014 [P] Crear el marcador propio `public/media/comun/placeholder-articulo.svg` (neutro, sin texto, colores que no rompan el contraste) y las imágenes SVG propias de `public/media/petcare/consejos/`
- [X] T015 Redactar en `content/petcare.yaml`: `sections.consejos.href: /consejos`, `post_categories` (perro, gato, otros-animales), 8 artículos y 4 noticias propios y prudentes (E17; al menos un artículo sin imagen, una noticia sin categoría y una publicación con fecha futura), el bloque `newsletter`, la página legal `boletin` (versión 1.0) y la finalidad "boletín" en la página `privacidad`; ningún texto de `design/`

**Checkpoint**: `npm run content:load -- --file content/petcare.yaml` carga todo y `npm run lint`
pasa. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Ver el listado de artículos y noticias (Priority: P1) 🎯 MVP

**Goal**: `/consejos` muestra "Artículos" (12 por página) y "Noticias" (3 + "Ver todas las
noticias"), con imagen, categoría y título, y la cabecera ya no lleva a "próximamente".

**Independent Test**: con el contenido de demo, abrir `/consejos` desde la cabecera y la portada,
ver los dos bloques ordenados por fecha, sin la publicación futura, paginar artículos y abrir "Ver
todas las noticias".

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] Test unitario de `src/domain/posts-query.ts` en `tests/unit/posts-query.test.ts`: `parsePostsQuery` (categoría desconocida ignorada, `q` vacío o solo espacios = sin búsqueda, recorte a 100, `tipo` distinto de `noticias` ignorado, página ≥ 1), `postsView` (`default`, `news`, `results`) y `buildPostsHref` (conserva filtro y búsqueda, omite la página 1)
- [X] T017 [P] [US1] Test de integración en `tests/integration/posts.test.ts`: `listPosts` y `countPosts` por tipo, orden por fecha, exclusión de despublicadas y de fecha futura, paginación de 12 y `clampPage` fuera de rango
- [X] T018 [P] [US1] Test e2e en `tests/e2e/us1-posts-list.spec.ts`: enlace de cabecera y portada → `/consejos`, dos bloques, tarjetas con imagen o marcador, categoría o "General" y título, 3 noticias y "Ver todas las noticias", paginación de artículos, bloque vacío con mensaje (contenido sin noticias), axe en los tres proyectos

### Implementation for User Story 1

- [X] T019 [US1] Crear `src/domain/posts-query.ts` (`parsePostsQuery` con Zod, `postsView`, `buildPostsHref`, tamaños 12 y 3) según E5
- [X] T020 [P] [US1] Crear `src/components/ArticleCard.tsx`: `article.article-card` con `next/image` (dimensiones fijas; marcador con `alt=""` si no hay imagen), `chip` con la categoría o "General", etiqueta opcional "Artículo"/"Noticia", título enlazado con enlace extendido a `/consejos/<slug>`
- [X] T021 [US1] Crear `src/app/consejos/page.tsx` (`force-dynamic`): `photo-hero`, vista `default` con "Artículos" paginado y "Noticias" (3 + `?tipo=noticias`), vista `news` con todas las noticias, estados vacíos por bloque, `generateMetadata` con título y descripción de la sección; añadir a `design/styles.css` solo con tokens lo que falte (rejilla de tarjetas, etiqueta de tipo)
- [X] T022 [US1] Añadir `postsRouteOk(pathname)` a `src/middleware.ts` con `postsRouteExists` para `^/consejos(/slug)?/?$` (rewrite a `/__no-encontrada`; si la consulta falla, deja pasar), y quitar "consejos" de `tests/e2e/coming-soon.spec.ts`
- [X] T023 [US1] Añadir `/consejos` y cada publicación visible (`lastModified = updated_at`) a `src/app/sitemap.ts` con `listVisiblePostSlugs()`, y el enlace "Consejos de salud" con `sectionHref('consejos')` a `src/components/SiteFooter.tsx` (FR-005), comprobado en `tests/e2e/us1-posts-list.spec.ts`

**Checkpoint**: US1 completa y probada por separado.

---

## Phase 4: User Story 2 - Leer un artículo (Priority: P1)

**Goal**: `/consejos/[slug]` con migas, categoría, fecha, preámbulo, imagen, secciones y bloque
final "Pide cita"; 404 si no existe o no es visible; metadatos propios.

**Independent Test**: abrir un artículo de demo y el que no tiene imagen; comprobar cada parte, las
migas, la categoría enlazada, "Pide cita" → reserva y 404 en un slug inexistente o futuro.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Test e2e en `tests/e2e/us2-article.spec.ts`: migas (Inicio › Consejos de salud › título), `chip` enlazado a `?categoria=`, noticia "General" sin enlace, `<time datetime>`, preámbulo, imagen con `alt` o marcador, `h2` de secciones, "Pide cita" → `sectionHref('reservas')`, 404 en slug inexistente y en publicación futura (también sin JavaScript), `og:title`, `og:description` y `og:image` (imagen propia o `clinic.hero.image`), axe en los tres proyectos

### Implementation for User Story 2

- [X] T025 [P] [US2] Crear `src/components/ArticleBody.tsx`: `Markdown` existente dentro de `.prose`, sin ampliar `allowedElements`, con `sections` para los enlaces `section:<clave>`
- [X] T026 [US2] Crear `src/app/consejos/[slug]/page.tsx` (`force-dynamic`, `notFound()` si no es visible): `Breadcrumb`, `chip`, h1, fecha en español (`Europe/Madrid`) en `<time>`, preámbulo, `next/image` o marcador, `ArticleBody`, bloque final "Ponte en contacto con un veterinario" con `btn btn--sky` "Pide cita"; `generateMetadata` con `meta_description`, `og:image` (E6), `og:type=article` y `article:published_time`; añadir a `design/styles.css` solo con tokens el bloque final si falta

**Checkpoint**: US1 y US2 → sección de consejos completa sin filtros: **MVP**.

---

## Phase 5: User Story 3 - Filtrar por categoría y buscar (Priority: P2)

**Goal**: pestañas de categoría y buscador que combinan condiciones en una lista única con etiqueta
de tipo, mensaje de "sin resultados" y todo sin JavaScript.

**Independent Test**: filtrar por cada categoría, buscar "baño" y "BANO", combinar ambos, buscar
"zzzz", y repetir sin JavaScript.

### Tests for User Story 3 ⚠️

- [X] T027 [P] [US3] Test unitario de `searchWords` en `tests/unit/search-words.test.ts`: normalización sin tildes ni mayúsculas, hasta 8 palabras, recorte a 100, comodines `%` y `_` tratados como literales
- [X] T028 [P] [US3] Ampliar `tests/integration/posts.test.ts`: filtro por categoría (excluye noticias sin categoría), búsqueda por palabras en título, preámbulo y cuerpo, combinación AND, sin resultados
- [X] T029 [P] [US3] Test e2e en `tests/e2e/us3-filter-search.spec.ts`: pestaña activa con `aria-current="page"`, URL compartible, lista combinada con etiqueta "Artículo"/"Noticia", paginación que conserva criterio, "No hay resultados para «…»" en `role="status"` con "Quitar filtros", categoría desconocida ignorada, `robots noindex` con filtros, axe; en los tres proyectos

### Implementation for User Story 3

- [X] T030 [P] [US3] Añadir `searchWords(q)` a `src/domain/search.ts` (reutiliza `normalizeSearch`; máx. 8 palabras, 100 caracteres)
- [X] T031 [US3] Crear `src/components/TopicTabs.tsx` (`band` > `topic-tabs`, "Todas" + categorías de `listCategories()`, enlaces GET que conservan `q`) y `src/components/PostsSearch.tsx` (`form.search` GET con etiqueta visible o `aria-label`, conserva `categoria`), e integrarlos en `src/app/consejos/page.tsx` con la vista `results`, el mensaje de "sin resultados" y `robots: noindex` + canonical a `/consejos` cuando hay criterio

**Checkpoint**: US3 completa y probada por separado.

---

## Phase 6: User Story 4 - Suscribirse al boletín (Priority: P2)

**Goal**: formulario en la portada y en `/consejos` con doble confirmación, respuesta uniforme,
límites, baja desde el enlace del correo y baja de un clic.

**Independent Test**: suscribirse con un correo nuevo, leer `newsletter_confirm` en el correo falso
(con `List-Unsubscribe`), confirmar, repetir con el mismo correo (sin correo nuevo), darse de baja
y comprobar la constancia anónima.

### Tests for User Story 4 ⚠️

- [X] T032 [P] [US4] Rellenar `tests/integration/helpers/newsletter.ts` (crear suscripciones en cada estado, leer el último correo del proveedor falso y extraer los tokens) y escribir `tests/integration/newsletter-subscribe.test.ts`: correo nuevo → `pending` + un correo; `pending` < 1 h → nada; `pending` ≥ 1 h → token nuevo y el anterior inválido; `confirmed` → nada y ningún correo; mismo resultado en todos; política sin aceptar o correo no válido → error; límite `newsletter_origin`; honeypot; reenvío del mismo `submission_id`; boletín desactivado → rechazo; confirmar con token vigente; caducado (7 días), sustituido y manipulado → mismo estado "caducado o no válido"; dos veces → "ya confirmada"
- [X] T033 [P] [US4] Test de integración `tests/integration/newsletter-unsubscribe.test.ts`: baja de `confirmed` y de `pending` → fila borrada + constancia con `email_hmac`, fechas, versión y motivo; segunda baja → "ya no suscrito" sin error; token manipulado; token de una suscripción anterior tras volver a suscribirse; `POST /api/boletin/baja` → 200 siempre y motivo `one_click`; `GET` → 405
- [X] T034 [P] [US4] Test unitario `tests/unit/newsletter-email.test.ts`: plantilla `newsletter-confirm` (asunto, enlace de confirmación, fecha de caducidad en `Europe/Madrid`, enlace a la política, pie de baja, cabeceras `List-Unsubscribe` y `List-Unsubscribe-Post`) y firma/verificación del token de baja
- [X] T035 [P] [US4] Test e2e `tests/e2e/us4-newsletter.spec.ts`: bloque en `/` y `/consejos` (casilla desmarcada, enlace a la política), errores junto al campo y anunciados, "Revisa tu correo" con PRG sin JavaScript, confirmar desde el enlace del correo falso, página de enlace caducado con formulario para pedir otro, baja desde el enlace, `/politica-del-boletin`, axe en todas las páginas; en los tres proyectos

### Implementation for User Story 4

- [X] T036 [P] [US4] Añadir `headers?: Record<string, string>` a `OutgoingEmail` en `src/email/types.ts`, guardarlo en el `payload` de la bandeja, enviarlo en el campo `headers` de `src/email/brevo.ts` y conservarlo en `src/email/fake.ts`; test de `brevo.ts` con las cabeceras
- [X] T037 [P] [US4] Crear `src/domain/newsletter-schemas.ts` (Zod: correo normalizado ≤ 254, `accept_policy` obligatoria, `return_to` de lista cerrada; mensajes en español) y añadir `newsletter_origin` (5 cada 10 minutos, clave `origin`) a `RATE_POLICIES` en `src/domain/rate-limit.ts`
- [X] T038 [P] [US4] Crear `src/lib/newsletter/tokens.ts` (token de confirmación de 32 bytes `base64url` + SHA-256, caducidad de 7 días; `unsubscribeToken(id)` y `verifyUnsubscribeToken` con `sign`/`verify` y propósito `newsletter-unsubscribe`) y `src/lib/newsletter/hash.ts` (`emailHmac(email)` con `NEWSLETTER_HASH_KEY`; error claro si falta)
- [X] T039 [P] [US4] Crear `src/email/templates/newsletter-footer.ts` (`newsletterFooter(ctx, unsubscribeToken)` y las cabeceras de E10) y `src/email/templates/newsletter-confirm.ts` con `buildAccountEmail`, según [contracts/emails.md](./contracts/emails.md); añadir el kind a `RenderedEmailKind`
- [X] T040 [US4] Crear `src/lib/newsletter/subscribe.ts` (`subscribe(form, { ip })`: Zod, honeypot, `processed_submissions` con scope `newsletter`, `checkPolicy('newsletter_origin')`, transacción con `SELECT … FOR UPDATE` por correo, ramas de E9, `enqueueEmail('newsletter_confirm')` con `policy_version` de la página `boletin`; resultado uniforme `{ status: 'ok' }`; logs solo con `subscription_id`) y `resendConfirmation`
- [X] T041 [US4] Crear `src/lib/newsletter/unsubscribe.ts` (`unsubscribe(subscriptionId, version, reason)`: en una transacción, borrar la fila, insertar la constancia con `emailHmac` y llamar al espejo de `sync.ts` si hay `customer_id`; idempotente) y `src/lib/newsletter/confirm.ts` (`peekConfirmation(token)` sin gastar, que devuelve `valid`, `already` o `invalid`, y `confirmSubscription(token)` atómico según E8, conservando `confirm_token_hash` tras confirmar; si el correo coincide con una cuenta, delega en `sync.ts` para vincularla, ver T050)
- [X] T042 [US4] Crear `src/components/NewsletterForm.tsx` (`section.newsletter#boletin`, `form.search` con etiqueta del correo, casilla de la política con enlace, honeypot `web`, `submission_id`, ids prefijados, errores con `aria-describedby`/`aria-invalid` y resumen en `role="alert"`, `useActionState` y PRG sin JavaScript) y la Server Action `subscribeNewsletter` en `src/app/boletin/actions.ts` (redirige a `return_to` con el aviso `boletin-revisa-correo` añadido a `src/lib/notice.ts` y `#boletin`); botón en marino
- [X] T043 [US4] Insertar `NewsletterForm` al final de `src/app/page.tsx` (sustituye el comentario "Sin boletín") y de `src/app/consejos/page.tsx`, solo si `newsletter_settings.enabled`, con título y texto de la base de datos
- [X] T044 [US4] Crear `src/app/boletin/confirmar/page.tsx` y las acciones `confirmNewsletter` y `resendNewsletterConfirmation` en `src/app/boletin/actions.ts` (estados `ok`, `ya` e `invalido` de E8, este último siempre con el formulario para pedir otro enlace; botón en marino y mensaje de éxito en menta; `noindex`)
- [X] T045 [US4] Crear `src/app/boletin/baja/page.tsx` y la acción `unsubscribeNewsletter` (estados `ok`, `ya` e `invalido`; botón en marino; `noindex`) y `src/app/api/boletin/baja/route.ts` (`POST` de un clic → 200 siempre; `GET` → 405)
- [X] T046 [P] [US4] Crear `src/app/(legal)/politica-del-boletin/page.tsx` con `LegalPage kind="boletin"` (404 si el boletín está desactivado), añadir el enlace "Política del boletín" al pie cuando está activo, `/politica-del-boletin` al sitemap y `/boletin/*` a `NO_STORE_ROUTES` en `next.config.ts`; las rutas del boletín responden 404 si está desactivado

**Checkpoint**: US4 completa y probada por separado.

---

## Phase 7: User Story 5 - Cliente con "consejos y novedades" (Priority: P3)

**Goal**: la preferencia de la cuenta y la lista del boletín coinciden siempre, en ambos sentidos.

**Independent Test**: registrar y verificar una cuenta con la casilla → suscrita sin otro correo;
desactivar en "Datos personales" → fuera de la lista con constancia; darse de baja desde un correo
→ preferencia desactivada; eliminar la cuenta → fuera de la lista.

### Tests for User Story 5 ⚠️

- [X] T047 [P] [US5] Test de integración `tests/integration/newsletter-sync.test.ts`: verificar cuenta con y sin preferencia; registro sin verificar → nada; activar y desactivar en el perfil (consentimientos `marketing_opt_in`/`marketing_opt_out` y fecha); baja por enlace con `customer_id` → preferencia desactivada; confirmar desde el formulario el correo de una cuenta → vinculada y preferencia activada; fila `pending` del formulario con el correo de una cuenta que verifica → confirmada y vinculada; eliminar la cuenta → constancia `account_deleted`; `moveSubscriptionEmail`; ningún correo `newsletter_confirm` en los caminos de cuenta
- [X] T048 [P] [US5] Test de integración `tests/integration/newsletter-backfill.test.ts`: la migración inserta `confirmed`/`account`/`previa` solo para clientes con la preferencia y el correo verificado, y es idempotente
- [X] T049 [P] [US5] Test e2e `tests/e2e/us5-account-newsletter.spec.ts`: registro con la casilla, verificación con el correo falso, "Datos personales" activada, baja desde el enlace del correo y preferencia desactivada; axe; en los tres proyectos

### Implementation for User Story 5

- [X] T050 [US5] Crear `src/lib/newsletter/sync.ts`: `subscribeFromAccount(tx, customerId)`, `unsubscribeFromAccount(tx, customerId, reason)`, `linkCustomerOnConfirm(tx, subscription)`, `mirrorUnsubscribe(tx, customerId)` y `moveSubscriptionEmail(tx, customerId, newEmail)`; cada una escribe la lista, `customers.marketing_opt_in`, `marketing_opt_in_changed_at` y el consentimiento en la misma transacción (E11)
- [X] T051 [US5] Conectar las cuentas: `src/lib/account/verify.ts` llama a `subscribeFromAccount` si la preferencia está marcada; `processUpdateMarketing` de `src/lib/account/profile.ts` y la rama de cuenta existente de `src/lib/account/register.ts` delegan en `sync.ts` (sin `UPDATE` directo de `marketing_opt_in`); `src/lib/account/delete-account.ts` llama a `unsubscribeFromAccount(…, 'account_deleted')` antes de borrar
- [X] T052 [US5] Ampliar la exportación a la versión 3: `communications.newsletter` en `src/domain/account-export.ts` y `src/lib/account/export.ts` según [contracts/export-format.md](./contracts/export-format.md), con su test en `tests/integration/account-export-v3.test.ts` (y actualizar los tests de la v2 que comprueban `format_version`)

**Checkpoint**: todas las historias completas.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T053 [P] Ampliar `purgeExpired` en `src/db/retention.ts` (suscripciones `pending` de más de 30 días y constancias de más de 3 años, devueltas en `PurgeResult`) con su test en `tests/integration/newsletter-retention.test.ts`
- [X] T054 [P] Añadir `/consejos`, un artículo, un artículo sin imagen, `/consejos?q=zzzz`, `/boletin/confirmar` (token no válido), `/boletin/baja` (token no válido) y `/politica-del-boletin` a `tests/e2e/a11y-all-routes.spec.ts`, comprobando además en `/consejos` y en un artículo que todas las peticiones van al mismo origen (FR-031)
- [X] T055 [P] Añadir `/consejos` y un artículo a la configuración de Lighthouse CI (`lighthouserc` del proyecto) y comprobar ≥ 90 en móvil también en `/` con el bloque del boletín
- [X] T056 Revisar `design/styles.css` con `npm run lint` (`check:design`): ningún valor escrito a mano, ningún `style=""` y ningún `.css` nuevo fuera de `design/`
- [X] T057 [P] Revisar los logs de las rutas y acciones nuevas: ningún correo ni texto de búsqueda (FR-032); solo `post_id`, `subscription_id` y códigos
- [X] T058 [P] Actualizar `deploy/README.md` (nuevo secreto `NEWSLETTER_HASH_KEY`, migración 0005, purga en `petcare-purge`) y el estado de la 006 en `CLAUDE.md`
- [X] T059 Recorrer [quickstart.md](./quickstart.md) completo (pasos 1–14, también sin JavaScript), ejecutar `npm run lint`, `npm test`, `npm run test:integration`, `npm run test:e2e` y `npm run test:lighthouse`, y anotar las desviaciones (al menos FR-026 parcial) en `specs/006-health-tips-newsletter/checklists/requirements.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (fase 1)**: sin dependencias.
- **Foundational (fase 2)**: depende de la fase 1 y bloquea todas las historias. T005 depende de
  T004; T009 de T007 y T008; T011 y T012 de T005; T015 de T014.
- **US1 (fase 3)**: depende de la fase 2.
- **US2 (fase 4)**: depende de la fase 2; usa `ArticleCard` solo de forma indirecta, así que puede
  ir en paralelo con US1 salvo el middleware (T022), que comparten.
- **US3 (fase 5)**: depende de US1 (amplía `src/app/consejos/page.tsx`).
- **US4 (fase 6)**: depende de la fase 2; T043 toca `src/app/consejos/page.tsx`, así que va después
  de US1.
- **US5 (fase 7)**: depende de US4 (usa `unsubscribe.ts` y `confirm.ts`); T041 deja el punto de
  enganche que T050 rellena.
- **Polish (fase 8)**: depende de las historias que se entreguen.

### Within Each User Story

- Los tests se escriben primero y deben fallar.
- Dominio → consultas → efectos (`src/lib/`) → vistas y acciones.
- Cada checkpoint se valida antes de pasar a la siguiente prioridad.

### Parallel Opportunities

- Fase 1: T002 y T003.
- Fase 2: T006, T007, T010, T012 y T014 en paralelo (archivos distintos).
- US1: T016, T017 y T018 juntos; T020 en paralelo con T019.
- US2: T024 y T025 juntos.
- US3: T027, T028, T029 y T030 juntos.
- US4: T032–T035 juntos; T036–T039 juntos; luego T040 → T041 → T042–T046.
- US5: T047, T048 y T049 juntos.
- Polish: T053, T054, T055, T057 y T058 juntos.
- Con dos personas: US1/US2/US3 por un lado y US4 (hasta T042) por otro tras la fase 2.

---

## Parallel Example: User Story 4

```text
# Tests de US4, juntos:
Task: "tests/integration/newsletter-subscribe.test.ts"
Task: "tests/integration/newsletter-unsubscribe.test.ts"
Task: "tests/unit/newsletter-email.test.ts"
Task: "tests/e2e/us4-newsletter.spec.ts"

# Piezas independientes de US4:
Task: "src/email/types.ts, brevo.ts y fake.ts (headers)"
Task: "src/domain/newsletter-schemas.ts y RATE_POLICIES"
Task: "src/lib/newsletter/tokens.ts y hash.ts"
Task: "src/email/templates/newsletter-{footer,confirm}.ts"
```

---

## Implementation Strategy

### MVP First

1. Fases 1 y 2.
2. US1 (listado) → validar por separado.
3. US2 (artículo) → las dos P1 completas: **entregable mínimo de la feature**.

### Incremental Delivery

1. P1 (US1–US2) → sección de consejos navegable.
2. P2 (US3) → filtro y búsqueda.
3. P2 (US4) → boletín con doble confirmación y baja.
4. P3 (US5) → sincronización con las cuentas.
5. Polish → purgas, accesibilidad de todas las rutas, Lighthouse, despliegue y quickstart.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Los commits solo cuando el usuario lo pida.
- Si una tarea choca con la constitución, gana la constitución: se anota en
  `checklists/requirements.md`.
