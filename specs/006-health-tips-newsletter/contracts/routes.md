# Contrato: rutas y acciones (feature 006)

Todas las páginas funcionan sin JavaScript. `/consejos` y `/consejos/[slug]` responden 404 desde
el middleware si `sections.consejos.href` es nulo o la publicación no es visible (E3). Las rutas
del boletín responden 404 si `newsletter_settings.enabled` es false.

## Páginas

| Ruta | Contenido | Maqueta |
|---|---|---|
| `/consejos` | `photo-hero` con el buscador; `band` con `topic-tabs` (categorías, "Todas" y la activa con `aria-current="page"`); vista según E5; mensaje de "sin resultados" en `role="status"` con "Quitar filtros"; bloque del boletín | `consejos.html` |
| `/consejos?categoria=&q=&pagina=` | vista `results` (lista combinada, etiqueta "Artículo"/"Noticia"), `noindex` y canonical a `/consejos` | `consejos.html` |
| `/consejos?tipo=noticias&pagina=` | todas las noticias, 12 por página | `consejos.html` |
| `/consejos/[slug]` | `Breadcrumb` (Inicio › Consejos de salud › título), `chip` de categoría (enlace a `?categoria=`; "General" sin enlace), h1, `<time>`, preámbulo, imagen o marcador, cuerpo `Markdown` en `.prose`, bloque final "Ponte en contacto con un veterinario" con `btn btn--sky` "Pide cita" → `sectionHref('reservas')`; `generateMetadata` con título, descripción, `og:image` (E6) y `article:published_time` | `articulo.html` |
| `/boletin/confirmar?t=` | estados de E8: botón "Confirmar suscripción" (marino); confirmada (mensaje en menta); ya confirmada; caducado o no válido (un solo estado, siempre con formulario para pedir otro enlace con el correo). `noindex`, `no-store` | — |
| `/boletin/baja?t=` | botón "Darme de baja" (marino); baja hecha; ya no suscrito; no válida. `noindex`, `no-store` | — |
| `/politica-del-boletin` | `LegalPage kind="boletin"` | — |
| `/` | + `<section class="newsletter" id="boletin">` al final, si el boletín está activo | `index.html` |

Parámetros de `/consejos` (validados con Zod en `parsePostsQuery`):
- `categoria`: clave existente; si no existe, se ignora.
- `q`: recortado a 100 caracteres; vacío o solo espacios equivale a no buscar.
- `tipo`: solo `noticias`; cualquier otro valor se ignora.
- `pagina`: entero ≥ 1, acotado con `clampPage`.

## Server Actions

Todas validan con Zod, se apoyan en la comprobación de origen de Next.js y siguen PRG sin
JavaScript.

| Acción | Entrada | Efecto | Respuesta |
|---|---|---|---|
| `subscribeNewsletter` | `email`, `accept_policy` (obligatoria), `submission_id` firmado, honeypot `web`, `return_to` (`/` o `/consejos…`, lista cerrada) | E9 | error junto al campo; límite con minutos; si no, PRG a `return_to` con el aviso `boletin-revisa-correo` y `#boletin` (mismo mensaje en todos los casos) |
| `confirmNewsletter` | `t` | E8, E11 | PRG a `/boletin/confirmar?estado=ok|ya|invalido` |
| `resendNewsletterConfirmation` | `email`, `submission_id` | igual que `subscribe` sobre una fila `pending`; nunca crea una fila nueva sin aceptar la política | mismo mensaje uniforme |
| `unsubscribeNewsletter` | `t` | E10, E11 (motivo `link`) | PRG a `/boletin/baja?estado=ok|ya|invalido` |
| `updateMarketing` (existente, 002) | sin cambios de entrada | llama a `sync.ts` (motivo `account`) | sin cambios |

## Route handler

| Ruta | Método | Efecto |
|---|---|---|
| `/api/boletin/baja?t=` | `POST` (RFC 8058, cuerpo `List-Unsubscribe=One-Click`) | baja con motivo `one_click`; responde `200` con cuerpo vacío también si el token no es válido o ya no hay suscripción; `GET` → `405` |

## Middleware, sitemap y cabeceras

- `postsRouteOk(pathname)` para `^/consejos(/slug)?/?$` con `postsRouteExists`.
- `sitemap.ts`: + `/consejos`, cada publicación visible (`lastModified = updated_at`) y
  `/politica-del-boletin` si el boletín está activo.
- `next.config.ts`: `/boletin/*` en `NO_STORE_ROUTES`. La CSP no cambia.
- Pie: enlace a "Política del boletín" si está activo.
