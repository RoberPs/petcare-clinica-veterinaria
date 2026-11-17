# Research: Consejos de salud y boletín (feature 006)

Decisiones **E1–E18** de la feature 006. Siguen vigentes las R1–R17 (001), A1–A14 (002), B1–B17
(003), C1–C16 (004) y D1–D20 (005). No hay incógnitas abiertas ni dependencias nuevas.

## E1. Modelo de contenido: una tabla `posts` con tipo

- **Decision**: artículos y noticias en una sola tabla `posts` con `kind` (`article` | `news`) y
  categorías en `post_categories` (clave, nombre, orden). `category_key` es obligatoria si
  `kind = 'article'` (CHECK) y opcional en las noticias ("General" se pinta en la vista, no es una
  categoría). Visible = `published AND published_at <= now()`.
- **Rationale**: comparten estructura, página de detalle y búsqueda (aclaración de la spec); una
  tabla simplifica la lista combinada al filtrar o buscar.
- **Alternatives considered**: dos tablas (duplica consultas y la unión al buscar); reutilizar
  `species` como categorías (la spec las declara independientes).

## E2. Cuerpo en Markdown con el componente `Markdown` existente

- **Decision**: `body_md` en Markdown, renderizado con `src/components/Markdown.tsx` (sin HTML
  crudo, `skipHtml`, enlaces `section:<clave>`). Las secciones son `##` y las subsecciones `###`.
  No se añaden elementos permitidos: los artículos usan los mismos que las páginas legales.
  El loader rechaza un `#` (h1) en el cuerpo, porque el título ya es el h1.
- **Rationale**: cumple FR-007 sin dependencias ni `dangerouslySetInnerHTML`.
- **Alternatives considered**: secciones estructuradas en el YAML (`sections[]` con título y texto):
  más rígido y sin ventaja para el lector.

## E3. Rutas y visibilidad de la sección

- **Decision**:
  - `/consejos`: listado con `?categoria=&q=&pagina=` y `?tipo=noticias` para "Ver todas las
    noticias";
  - `/consejos/[slug]`: detalle.
  - `sections.consejos.href` pasa a `/consejos` en `content/petcare.yaml`. Si es nulo, las dos
    rutas dan 404 desde el middleware, con un `postsRouteExists(slug|null)` análogo a
    `catalogRouteExists` (una consulta; si falla, deja pasar, como en la 004).
  - Render dinámico (`force-dynamic`) para que una publicación programada aparezca al llegar su
    fecha sin redespliegue.
- **Rationale**: mismo patrón que `/productos` (C*), 404 sin JavaScript (FR-008).

## E4. Búsqueda y filtro

- **Decision**: columna `posts.search_text` rellenada al cargar con `normalizeSearch` (de
  `src/domain/search.ts`) sobre título + preámbulo + cuerpo sin marcas de Markdown. La consulta
  parte el texto (recortado a 100 caracteres) en hasta 8 palabras y exige que **todas** aparezcan
  (`search_text LIKE %palabra% ESCAPE '\'` con `escapeLike`, unidas con AND). El filtro es
  `category_key = $1` (excluye las noticias sin categoría). Una categoría desconocida se ignora; una
  página fuera de rango se acota con `clampPage`.
- **Rationale**: es la técnica de la 004 (sin `unaccent` ni `tsvector`); con decenas o pocos cientos
  de publicaciones el `LIKE` basta. AND por palabras da resultados más útiles que la frase literal.
- **Alternatives considered**: `tsvector` con configuración `spanish` (stemming útil, pero
  requiere `unaccent` y no acierta con términos cortos); frase exacta (demasiado estricta).

## E5. Presentación del listado y paginación

- **Decision**: lógica pura en `src/domain/posts-query.ts` (`parsePostsQuery`, `postsView`,
  `buildPostsHref`):
  - sin filtro ni búsqueda ni `tipo`: vista `default` con "Artículos" (12 por página, `?pagina=`)
    y "Noticias" (3 últimas + enlace a `?tipo=noticias`);
  - `?tipo=noticias`: solo noticias, 12 por página;
  - con filtro o búsqueda: vista `results`, una sola lista combinada por fecha, 12 por página, con
    la etiqueta "Artículo" o "Noticia" en la tarjeta.
  `Pagination.tsx` se generaliza para recibir una función `hrefFor(page)` en lugar de depender de
  `buildCatalogHref`. Con filtro o búsqueda, `robots: noindex` y canonical a `/consejos`.
- **Rationale**: aplica la aclaración 4 de la spec con un solo parámetro de página.

## E6. Imagen ausente y metadatos

- **Decision**: marcador nuevo `public/media/comun/placeholder-articulo.svg` (propio, neutro, sin
  texto) con `alt=""` en tarjetas y página, porque es decorativo. Los metadatos `og:image` usan la
  imagen de la publicación o, si no tiene, `clinic.hero.image`. `next/image` con dimensiones
  fijas por ranura.
- **Rationale**: FR-002, caso límite "artículo sin imagen" y FR-009.

## E7. Suscripciones: una tabla de suscripciones vivas y otra de constancias

- **Decision**:
  - `newsletter_subscriptions`: solo suscripciones vivas (`pending` | `confirmed`), con
    `email` normalizado `UNIQUE`, `customer_id` opcional `UNIQUE` (FK `ON DELETE SET NULL`),
    `source` (`form` | `account`), `policy_version`, fechas, `confirm_token_hash`,
    `confirm_expires_at` y `confirm_sent_at`.
  - `newsletter_unsubscribe_records`: constancia anónima de cada baja (HMAC del correo, fechas,
    versión de la política, origen y motivo), borrada a los 3 años.
  - Una baja **borra** la fila viva y escribe la constancia en la misma transacción.
- **Rationale**: aplica la aclaración 3 (el correo desaparece tras la baja) y mantiene la prueba
  del consentimiento. La huella es `HMAC-SHA256(NEWSLETTER_HASH_KEY, email)`: no reversible sin la
  clave, y permite comprobar una constancia si el titular reclama.
- **Alternatives considered**: estado `unsubscribed` en la misma tabla (conserva el correo);
  SHA-256 sin clave (reversible por diccionario de correos).
- **Nota**: `NEWSLETTER_HASH_KEY` es un secreto nuevo en `.env` y `.env.example`; lo exige
  `hash.ts` al usarse (error claro si falta) y `content:load` si `newsletter.enabled`; `env.ts` no
  consulta la base de datos al arrancar. Separado de `FORM_SECRET` para que rotar uno no
  invalide el otro.

## E8. Confirmación: token aleatorio, 7 días, GET muestra y POST confirma

- **Decision**: token de 32 bytes `base64url`; se guarda solo su SHA-256 en la fila pendiente, con
  caducidad de 7 días. Pedir otro reemplaza el hash (el anterior deja de valer). `GET
  /boletin/confirmar?t=` comprueba el token sin gastarlo y muestra el botón "Confirmar
  suscripción"; el `POST` confirma de forma atómica (`UPDATE … WHERE confirm_token_hash = $1 AND
  confirm_expires_at > now() AND status = 'pending'`). El hash se conserva tras confirmar, así que
  un segundo uso encuentra la fila `confirmed` y responde "ya confirmada". Estados de la página:
  válido, ya confirmado y "caducado o no válido" (un solo estado para caducado, sustituido o
  manipulado, siempre con formulario para pedir otro enlace).
- **Rationale**: los escáneres de enlaces del correo hacen GET y no deben confirmar (igual que la
  verificación de cuenta, A*). Las tokens de `account_tokens` exigen un cliente, así que el boletín
  guarda el suyo en su propia fila.

## E9. Respuesta uniforme, límites e idempotencia

- **Decision**: `subscribe(email, consent)` responde siempre `ok` tras validar:
  - correo nuevo: crea la fila `pending` y encola la confirmación;
  - `pending`: renueva el token y reenvía, salvo que `confirm_sent_at` sea de hace menos de 1 hora
    (entonces no hace nada);
  - `confirmed`: no hace nada ni envía nada (aclaración 2).
  Límite por origen `newsletter_origin` (5 cada 10 minutos, IPv6 por /64) en `RATE_POLICIES`, con
  honeypot `web`. Superado el límite, se muestra el mensaje de límite con los minutos de espera,
  como en contacto. El formulario lleva `submission_id` firmado (`form-token.ts`, mínimo 3 s):
  repetir el envío choca con la regla de 1 hora y devuelve la misma confirmación.
- **Rationale**: FR-016 y FR-017, y SC-005: el tiempo de respuesta no distingue estados porque el
  envío del correo va por la bandeja de salida (`after()`).

## E10. Baja: enlace firmado sin estado, página con botón y baja de un clic

- **Decision**: token de baja `sign({ s: subscriptionId })` con
  `src/lib/signing.ts` (HMAC con `FORM_SECRET`), sin caducidad.
  - `GET /boletin/baja?t=`: página con el botón "Darme de baja" (sin sesión, sin JavaScript); si la
    suscripción ya no existe, "Ya no estás suscrito" sin error (FR-019, escenario 6).
  - `POST` (Server Action): baja efectiva.
  - `POST /api/boletin/baja?t=` (route handler) para la baja de un clic de RFC 8058; responde 200
    siempre.
  - Los correos llevan `List-Unsubscribe: <https://…/api/boletin/baja?t=…>` y
    `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Para ello `OutgoingEmail` gana un campo
    opcional `headers`, que `brevo.ts` envía en `headers` de la API y `fake.ts` guarda.
  Volver a suscribirse crea una fila nueva (otro id), así que un enlace viejo deja de valer.
- **Rationale**: sin tabla de tokens de baja, enlace estable en cualquier envío futuro (FR-019).

## E11. Sincronización con las cuentas: una sola función

- **Decision**: `newsletter_subscriptions` es la fuente de verdad; `customers.marketing_opt_in` y
  `marketing_opt_in_changed_at` se mantienen como espejo y se escriben **solo** desde
  `src/lib/newsletter/sync.ts`, en la misma transacción, junto con el consentimiento
  `marketing_opt_in` / `marketing_opt_out` de `customer_consents`:
  - verificar el correo con la casilla marcada (`verify.ts`) → fila `confirmed`, `source =
    'account'`, sin correo de confirmación (FR-024). Si existía una fila del formulario con ese
    correo, se vincula y se confirma.
  - activar o desactivar en "Datos personales" (`processUpdateMarketing`) → alta confirmada o baja
    con constancia (motivo `account`).
  - confirmar desde el formulario un correo que coincide con una cuenta → se vincula
    `customer_id` y se activa la preferencia (escenario 4 de la US5).
  - baja desde un correo → si hay `customer_id`, se desactiva la preferencia.
  - eliminar la cuenta (`delete-account.ts`) → baja con constancia (motivo `account_deleted`) antes
    del borrado.
  - registro con la casilla marcada y cuenta sin verificar → nada hasta verificar.
- **Cambio de correo (FR-026)**: hoy no existe en el producto (002 no lo implementa). Se deja
  `moveSubscriptionEmail(customerId, newEmail)` en `sync.ts` con su test, para que la feature que
  añada el cambio de correo lo llame tras verificar el nuevo. Anotado como desviación.
- **Rationale**: un único punto evita que el espejo y la lista diverjan (SC-006).

## E12. Clientes con la preferencia ya activa (FR-028)

- **Decision**: la migración `0005` inserta una fila `confirmed` (`source = 'account'`,
  `policy_version = 'previa'`) por cada cliente con `marketing_opt_in = true` y
  `email_verified_at IS NOT NULL`, con `confirmed_at = marketing_opt_in_changed_at` (o
  `created_at`), y `ON CONFLICT DO NOTHING`.
- **Rationale**: puesta en marcha sin script manual; idempotente.

## E13. Política del boletín y bloque configurable

- **Decision**: nuevo `legal_kind` `boletin` y página `/politica-del-boletin` con `LegalPage`. En el
  YAML, bloque `newsletter: { enabled, title, text }`. Si `enabled`, el loader exige la página legal
  `boletin` (FR-023). El formulario se muestra en la portada y en `/consejos` solo si está activo,
  y la acción lo rechaza si no lo está. La versión aceptada es la `version` de esa página.
- **Rationale**: textos legales por clínica (principio VIII), como `condiciones-venta` en la 005.

## E14. Correos del boletín

- **Decision**: un `outbox_kind` nuevo: `newsletter_confirm`. Plantilla
  `src/email/templates/newsletter-confirm.ts` con `buildAccountEmail` (sin nombre: saludo genérico),
  enlace de confirmación, aviso de caducidad en 7 días, enlace de baja y cabeceras de E10. El
  `recipientHash` de la bandeja se calcula como siempre. No se envía correo de "ya estabas
  suscrito" (aclaración 2) ni de despedida al darse de baja.
- **Rationale**: FR-015, FR-019 y minimización.

## E15. Purgas

- **Decision**: `purgeExpired` (`src/db/retention.ts`, temporizador `petcare-purge` existente) borra
  las suscripciones `pending` creadas hace más de 30 días y las constancias de baja de más de
  3 años. No hay temporizador nuevo.

## E16. Formularios sin JavaScript

- **Decision**: `NewsletterForm` (Server Action con `useActionState`, como contacto): sin JavaScript,
  un envío correcto redirige con PRG a la misma página con el aviso `boletin-revisa-correo` (patrón
  de `src/lib/notice.ts`) y el ancla `#boletin`; los errores se pintan junto al campo
  (`aria-describedby`, `aria-invalid`) y el resumen en `role="alert"`. Los ids de campos se
  prefijan para poder tener el bloque una sola vez por página.

## E17. Contenido de demostración

- **Decision**: 8 artículos y 4 noticias propios en `content/petcare.yaml` (bloques `post_categories`
  y `posts`), con textos prudentes que remiten al veterinario, sin copiar las maquetas, y al menos
  un artículo sin imagen y una noticia sin categoría para ejercitar los casos límite. Imágenes SVG
  propias en `public/media/petcare/consejos/`. La política de privacidad añade la finalidad
  "boletín" y se crea la política del boletín.

## E18. Pruebas

- **Decision**:
  - **Unitarias**: `posts-query`, búsqueda por palabras, esquema del contenido (`posts`,
    `newsletter`, h1 prohibido), firma de baja, plantilla con cabeceras.
  - **Integración** (PostgreSQL real): carga y despublicación de posts; visibilidad por fecha;
    búsqueda y filtro; ciclo de suscripción sustituida y manipulada con un mismo estado, doble confirmación → "ya confirmada"); baja (constancia, idempotencia, un clic); sincronización con
    cuentas en todos los caminos de E11; backfill de E12; purgas de E15; exportación.
  - **e2e** (Playwright + axe, móvil, escritorio y sin JavaScript): `us1`–`us5`, con el correo
    falso para leer los enlaces; rutas nuevas en `a11y-all-routes.spec.ts`; `coming-soon.spec.ts`
    sin "consejos".
  - **Lighthouse**: se añaden `/consejos` y un artículo.
