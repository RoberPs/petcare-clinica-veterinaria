# Implementation Plan: Consejos de salud y boletín

**Branch**: `006-health-tips-newsletter` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-health-tips-newsletter/spec.md`

## Summary

Sustituir la página provisional de "Consejos de salud" por:
- un listado de artículos y noticias con pestañas de categoría, búsqueda sin tildes y paginación,
  todo sin JavaScript;
- la página de cada publicación, con el cuerpo en Markdown y un bloque final para pedir cita;
- la lista del boletín con doble confirmación, baja de un clic y constancia anónima de la baja;
- la preferencia "consejos y novedades" de la 002 sincronizada con esa lista.

El contenido se carga desde el YAML de la clínica (sigue sin haber panel). Las decisiones están en
[research.md](research.md) (E1–E18) y el modelo en [data-model.md](data-model.md) (migración
`0005_health_tips_newsletter`).

## Technical Context

**Language/Version**: TypeScript strict sobre Node.js 22 LTS.

**Primary Dependencies**: Next.js 15 (App Router, RSC, Server Actions), React 19, Drizzle ORM y
`pg`, Zod, pino, `@js-temporal/polyfill` y `react-markdown`. **Sin dependencias nuevas.**

**Storage**: PostgreSQL 16, con la migración `0005_health_tips_newsletter`:
- 5 tablas nuevas: `post_categories`, `posts`, `newsletter_subscriptions`,
  `newsletter_unsubscribe_records` y `newsletter_settings`;
- enums nuevos y ampliados (`legal_kind` + `boletin`, `outbox_kind` + `newsletter_confirm`);
- backfill de clientes con la preferencia activa (E12).

**Testing**: Vitest (unitarias e integración contra PostgreSQL), Playwright con
`@axe-core/playwright` (móvil, escritorio y sin JavaScript) y Lighthouse CI.

**Target Platform**: Docker Compose en el VPS compartido, detrás de Caddy y Cloudflare. Sin
temporizadores nuevos: la purga entra en `petcare-purge`.

**Project Type**: Aplicación web monolítica (Next.js).

**Performance Goals**:
- Lighthouse móvil ≥ 90 en `/`, `/consejos` y un artículo;
- el listado hace dos consultas indexadas (página y total) por bloque;
- el formulario del boletín responde igual de rápido en todos los estados (correo en `after()`).

**Constraints**:
- respuesta uniforme del boletín (no revela suscriptores);
- doble confirmación y baja sin sesión;
- sin recursos de terceros;
- sin JavaScript obligatorio;
- WCAG 2.2 AA;
- solo tokens y componentes de `design/`;
- ningún dato de la clínica en `src/`;
- `Europe/Madrid`.

**Scale/Scope**:
- demo con 12 publicaciones y una lista de decenas de suscriptores; el diseño aguanta cientos de
  publicaciones con `LIKE`;
- 5 páginas nuevas, 1 modificada (portada), 4 Server Actions nuevas, 1 route handler y 1 correo.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| **I. Design system** | Componentes existentes: `.photo-hero`, `.band`, `.topic-tabs`, `.article-card`, `.chip`, `.search`, `.newsletter`, `.breadcrumb`, `.prose`, `.pagination`, `.page-hero`, `.btn`. Si falta algo (rejilla de tarjetas, etiqueta "Artículo/Noticia" o bloque final del artículo), se añade a `design/styles.css` solo con tokens. Los `style=""` de las maquetas no se trasladan. CTA "Pide cita" en cian; "Suscribirme" en marino (acción neutra); la confirmación en menta. | ✅ |
| **II. Marca propia** | Artículos, noticias e imágenes propios (E17); no se publica nada de `consejos.html` ni de `articulo.html`. | ✅ |
| **III. Tests de flujos críticos** | La feature no toca los flujos críticos de la constitución, salvo la preferencia de la cuenta; aun así, el ciclo de suscripción, la baja y la sincronización con cuentas tienen tests de integración y e2e (E18). | ✅ |
| **IV. Privacidad y seguridad** | Solo se pide el correo (FR-014). Doble confirmación; tokens con hash y caducidad; enlace de baja firmado; respuesta uniforme; límite por origen y regla de 1 hora por dirección; honeypot. Tras la baja se borra el correo y queda una huella HMAC durante 3 años (E7). Pendientes borradas a 30 días. Exportación v3. Logs solo con ids. `NEWSLETTER_HASH_KEY` solo en `.env`. | ✅ |
| **V. WCAG 2.2 AA** | Pestañas con `aria-current`, buscador con etiqueta, "sin resultados" en `role="status"`, errores junto al campo y anunciados, `<time>` en fechas, alternativos en imágenes y marcador decorativo con `alt=""`. axe en todas las rutas nuevas. | ✅ |
| **VI. Rendimiento** | Sin JavaScript propio nuevo salvo el realce del formulario; `next/image` con dimensiones; Lighthouse en `/consejos` y un artículo. | ✅ |
| **VII. Pagos de prueba** | No aplica. | ✅ |
| **VIII. Producto real y adaptable** | Doble confirmación, baja, purgas y sincronización reales. Categorías, publicaciones, textos del boletín y política son datos de la clínica. **Excepción heredada**: sin panel; los artículos se gestionan con el YAML (ver Complexity Tracking). | ⚠️ justificado |
| **Flujo y puertas** | La spec referencia `design/consejos.html`, `articulo.html` e `index.html`. CI con lint, tests y Gitleaks. Migración probada en la base de datos de pruebas. | ✅ |

**Resultado del gate (antes de la Fase 0)**: PASA, con la excepción heredada.

**Re-check tras la Fase 1**: PASA. Las comprobaciones de diseño que lo confirman son:
- una sola función de sincronización (`sync.ts`) escribe la lista y el espejo de la cuenta (SC-006);
- la respuesta de `subscribe` no depende del estado y el correo sale en `after()` (SC-005);
- la baja borra el correo en la misma transacción que crea la constancia;
- la CSP no cambia.

## Project Structure

### Documentation (this feature)

```text
specs/006-health-tips-newsletter/
├── plan.md              # este archivo
├── research.md          # decisiones E1–E18
├── data-model.md        # 0005_health_tips_newsletter y transiciones
├── quickstart.md        # validación manual y automática
├── contracts/
│   ├── routes.md        # páginas, Server Actions, route handler y middleware
│   ├── content-file.md  # bloques post_categories, posts y newsletter del YAML
│   ├── emails.md        # newsletter_confirm y cabeceras List-Unsubscribe
│   └── export-format.md # exportación v3
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
drizzle/0005_health_tips_newsletter.sql   # generada + SQL a mano (CHECK, ALTER TYPE, backfill)
src/
├── domain/
│   ├── posts-query.ts                    # parsePostsQuery, postsView, buildPostsHref
│   ├── search.ts                         # + searchWords (hasta 8 palabras, 100 caracteres)
│   ├── markdown-text.ts                  # texto plano del Markdown para search_text
│   ├── newsletter-schemas.ts             # Zod con mensajes en español
│   ├── rate-limit.ts                     # + newsletter_origin
│   └── account-export.ts                 # + communications.newsletter (v3)
├── db/
│   ├── schema.ts                         # + tablas y enums de data-model.md
│   ├── queries/{posts,posts-visibility,newsletter}.ts
│   └── retention.ts                      # + purgas de E15
├── lib/
│   ├── newsletter/{subscribe,confirm,unsubscribe,sync,tokens,hash}.ts
│   ├── account/{verify,profile,delete-account}.ts   # llaman a sync.ts
│   ├── env.ts                            # NEWSLETTER_HASH_KEY
│   └── notice.ts                         # + boletin-revisa-correo
├── email/
│   ├── types.ts, brevo.ts, fake.ts       # + headers
│   └── templates/{newsletter-confirm,newsletter-footer}.ts
├── content/{schema,load}.ts              # + post_categories, posts, newsletter, legal boletin
├── components/
│   ├── ArticleCard.tsx, ArticleBody.tsx, TopicTabs.tsx, PostsSearch.tsx
│   ├── NewsletterForm.tsx                # Server Action + useActionState, sin JS con PRG
│   └── Pagination.tsx                    # generalizado con hrefFor(page)
├── app/
│   ├── consejos/{page.tsx,[slug]/page.tsx}
│   ├── boletin/{confirmar,baja}/page.tsx + actions.ts
│   ├── api/boletin/baja/route.ts
│   ├── (legal)/politica-del-boletin/page.tsx
│   ├── page.tsx                          # + bloque del boletín
│   └── sitemap.ts                        # + /consejos y publicaciones
└── middleware.ts                         # + postsRouteOk
public/media/comun/placeholder-articulo.svg
public/media/petcare/consejos/*.svg
design/styles.css                         # lo que falte, solo con tokens
content/petcare.yaml                      # sections.consejos.href, post_categories, posts, newsletter, legal boletin y privacidad
next.config.ts                            # /boletin/* no-store
.env.example                              # NEWSLETTER_HASH_KEY
tests/
├── unit/{posts-query,search-words,content-posts,newsletter-tokens,newsletter-email}.test.ts
├── integration/{posts,newsletter-subscribe,newsletter-unsubscribe,newsletter-sync,newsletter-backfill,newsletter-retention,account-export-v3}.test.ts
└── e2e/{us1-posts-list,us2-article,us3-filter-search,us4-newsletter,us5-account-newsletter}.spec.ts
    # + rutas en a11y-all-routes.spec.ts; coming-soon.spec.ts sin "consejos"
```

**Structure Decision**: es la misma estructura monolítica de las features 001–005.
- La lógica pura (consulta del listado, búsqueda y esquemas) va en `src/domain/`.
- Los efectos (BD y correos) van en `src/lib/newsletter/`, como `src/lib/booking/` o
  `src/lib/orders/`.
- Las vistas van en `src/app/` y `src/components/`.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principio VIII: artículos, noticias y categorías sin panel de administración; se gestionan con el YAML (excepción heredada de 001–005) | El panel es una feature propia, todavía sin especificar, y la spec deja fuera la gestión desde el panel. | Un editor solo para artículos duplicaría la autenticación de administración. El loader escribe en las mismas tablas que usará el panel, así que la excepción se cierra sin migrar datos. |
| FR-026 (cambio de correo) solo a medias: hoy no existe el cambio de correo de la cuenta | La función `moveSubscriptionEmail` queda lista y probada en `sync.ts`. | Implementar el cambio de correo de la cuenta es otra feature (verificación del correo nuevo, aviso al anterior). Se anota como desviación en `checklists/requirements.md` durante la implementación. |
