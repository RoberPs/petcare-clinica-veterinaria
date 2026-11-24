# Research: Web pública de la clínica veterinaria

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-11-10

Este documento recoge las decisiones técnicas de la Fase 0. Las cuatro decisiones de stack
(framework, datos, hosting y correo) las ha tomado el responsable del proyecto. El resto se derivan
de la spec y de la constitución.

---

## R1. Framework y renderizado

- **Decision**: Next.js 15 (App Router) con React 19 y TypeScript estricto sobre Node.js 22 LTS.
  Las páginas son React Server Components con **renderizado dinámico en cada petición**
  (`export const dynamic = 'force-dynamic'` en el layout raíz). No se usa revalidación
  incremental.
- **Rationale**: decisión del responsable. Es el stack del proyecto anterior del repositorio. El
  HTML se entrega completo desde el servidor, de modo que la navegación y el contenido funcionan sin
  JavaScript (FR-049), y escala a los módulos futuros (citas, tienda, cuentas, panel). El
  renderizado dinámico es **obligatorio** por la CSP con nonce (R14): Next.js no puede inyectar un
  nonce por petición en páginas cacheadas. Además, así "Abierto/Cerrado ahora" (FR-018) es exacto,
  el contenido nuevo se ve en cuanto termina `content:load` sin necesidad de invalidar nada, y el
  coste es asumible con el tráfico de la demo (unas pocas consultas indexadas por página). El
  objetivo de Lighthouse de 90 o más se mantiene, porque la página sigue llegando como HTML de
  servidor con muy poco JavaScript.
- **Rejected**: revalidación incremental de 60 s, porque obligaría a una CSP con
  `'unsafe-inline'` en `script-src` (más débil) y a un endpoint de revalidación protegido.
- **Alternatives considered**: Astro (menos JavaScript, pero encaja peor con cuentas, tienda y
  panel) y SvelteKit (cambio de ecosistema respecto al proyecto anterior).

## R2. Persistencia y acceso a datos

- **Decision**: PostgreSQL 16 con Drizzle ORM y `drizzle-kit` para las migraciones versionadas. El
  driver es `pg`. Hay una base de datos por clínica (una instalación = una clínica).
- **Rationale**: decisión del responsable. Las migraciones versionadas las exige el principio VIII,
  y el mismo modelo sirve para las features de citas, tienda y panel.
- **Alternatives considered**: SQLite (habría que migrar más adelante) y contenido en archivos con
  base de datos solo para mensajes (habría que reconstruirlo al llegar el panel).

## R3. Carga de contenido sin panel (excepción temporal al principio VIII)

- **Decision**: todo el contenido de la clínica vive en un **archivo de contenido por clínica**
  (`content/<clinica>.yaml`). Ese archivo se valida con Zod y se carga en la base de datos con
  `npm run content:load -- --file content/petcare.yaml`. La carga es idempotente: hace un upsert por
  clave estable (`slug`) y despublica lo que ya no aparece en el archivo. Como las páginas se renderizan
  en cada petición (R1), los cambios se ven al momento, sin invalidar ninguna caché. Las imágenes van en `public/media/<clinica>/` y el archivo las referencia
  por ruta.
- **Rationale**: cumple FR-041, FR-042 y FR-042a y SC-009: cambiar de clínica es cambiar el archivo
  y las imágenes, nunca el código. Como la base de datos ya es la fuente de lectura de las páginas,
  el panel futuro solo tendrá que escribir en las mismas tablas.
- **Alternatives considered**: seeds escritos en TypeScript (mezclan datos con código e impiden
  editar sin programar) y leer el YAML directamente desde las páginas (habría que reescribir al
  llegar el panel).
- **Contenido de la demo**: `content/petcare.yaml` es contenido ficticio redactado para el
  proyecto. Ningún texto de `design/` se reutiliza (FR-043, SC-010).
- **Datos de contacto de la demo** (para no dirigir a nadie a un tercero real):
  - **Teléfono**: sale de `${CLINIC_PHONE_E164}` y `${CLINIC_PHONE_DISPLAY}`, y tiene que ser un
    número que **controla el responsable de la demo**. Nunca se inventa un número, porque podría
    pertenecer a alguien.
  - **Dirección**: una calle con un nombre claramente inventado (por ejemplo, "Calle de la
    Demostración, 1") y comprobado como inexistente en la ciudad elegida.
  - **Coordenadas**: las de un espacio público genérico, como una plaza o un parque, nunca las de
    una vivienda ni las de un negocio.
  - **Correo público**: solo de un dominio del responsable.
- **Iconos**: los emojis de `design/` (🛍 🩺 💊 📍 🕘 ✆ ✉ 📅) son marcadores de posición
  (principio II). Se sustituyen por iconos SVG propios en `public/media/icons/`, decorativos
  (`alt=""` y `aria-hidden`).

## R4. Integración con el design system

- **Decision**: la aplicación importa `design/tokens.css` y `design/styles.css` tal cual desde el
  layout raíz. No existen otras hojas de estilo ni CSS Modules, y el atributo `style` está
  prohibido (regla de ESLint `react/forbid-dom-props` para `style`, más un script `check:design`
  que falla si hay `.css` fuera de `design/` o valores de color o tamaño escritos en `src/`).
- **Valores escritos a mano en el `styles.css` heredado**: `design/styles.css` tiene hoy 5
  colores y unos 280 valores en `px` escritos a mano, lo que incumple el principio I. En esta
  feature se pasan a tokens (añadiendo en `tokens.css` los tokens de tamaño tipográfico,
  espaciado y anchura que falten), y `check:design` revisa también `design/styles.css`. Solo se
  admiten valores literales en `tokens.css` y en los `@media` (el breakpoint de 900 px).
- **Componentes que faltan**: se añaden a `design/styles.css` **solo con tokens** (principio I):
  - `.skip-link` (saltar al contenido) y un estilo global `:focus-visible`.
  - `.nav-toggle` y `.mobile-nav`. Hoy, por debajo de 900 px, `.main-nav` y los chips "Pide cita"
    y "Contacto" están ocultos sin ninguna alternativa, lo que incumple FR-004 y el principio V.
  - `.demo-banner` (FR-007a), `.cookie-banner` y `.cookie-banner__actions` (con los dos botones del
    mismo tamaño), `.field__error` y `.field--invalid`, `.open-status` (con las variantes
    `--open` y `--closed`), `.map-placeholder`, `.band__row` y `.note--contact`. Los dos últimos
    sustituyen los `style=""` en línea de las páginas de referencia.
- **Rationale**: única fuente visual. Se cubren los huecos de accesibilidad del diseño de
  referencia sin crear hojas paralelas.
- **Tipografía**: Figtree autoalojada con `next/font` (los archivos se sirven desde el propio
  dominio, sin petición a terceros, así que no requiere consentimiento según el principio IV). La
  familia se asigna a `--font-family` en `tokens.css`, y se elimina la referencia a "Guardian Sans",
  que es una fuente propietaria de la referencia.

## R5. Formulario de contacto: envío, validación e idempotencia

- **Decision**: un **Server Action** de Next.js que se usa en el `<form action>`. Funciona como un
  POST normal sin JavaScript y, con JavaScript, añade `useActionState` y el estado "Enviando…".
  - El esquema de validación es único (Zod), compartido por el cliente (atributos HTML y mensajes)
    y el servidor (autoridad, FR-024). El correo se valida con un patrón pragmático y una longitud
    máxima de 254 caracteres. El mensaje admite entre 10 y 2.000 caracteres.
  - **Idempotencia** (FR-026): cada render de `/contacto` incluye un `submission_id` (UUID v4)
    oculto. La tabla `contact_messages` tiene restricción única sobre ese campo. Un reenvío
    (doble clic, recarga o reintento del navegador) devuelve la misma confirmación sin crear otro
    mensaje ni otro correo.
  - Si no hay JavaScript, tras un envío correcto se redirige a `/contacto/enviado` (patrón
    POST-Redirect-GET), de modo que recargar no vuelve a enviar.
- **Rationale**: es la mejora progresiva que pide FR-049 y deja el envío duplicado resuelto en la
  base de datos, no en el navegador.
- **Alternatives considered**: una API REST con `fetch` (no funciona sin JavaScript) y deshabilitar
  el botón como única defensa (no cubre la recarga ni el reenvío).

## R6. Protección frente a abuso

- **Decision**: tres capas, ninguna visible para el visitante (FR-028):
  1. Un **campo trampa** oculto que, si llega relleno, hace que el envío se descarte en silencio
     con una respuesta de éxito aparente.
  2. Un **tiempo mínimo** de 3 s entre el render y el envío, comprobado con el sello temporal del
     token firmado con HMAC (`FORM_SECRET`).
  3. Un **límite por origen** de 5 mensajes cada 10 minutos por IP. Para IPv6 se agrupa por el
     prefijo /64, como en la corrección del proyecto anterior. El recuento se guarda en una tabla
     `rate_limit_hits` de PostgreSQL, que **no guarda la IP en claro**: el `bucket` es
     `HMAC-SHA256(FORM_SECRET, "contact:" + ip_o_prefijo)`. Esas filas se borran a las 24 h. La IP sale de `X-Forwarded-For`, que Caddy reescribe con
     `CF-Connecting-IP`, y solo se confía en ella si la petición viene de `TRUSTED_PROXY_IPS`
     (ver R16).
  Al superar el límite se muestra el mensaje "Has enviado varios mensajes seguidos. Llámanos al …".
- **Rationale**: no añade pasos (no hay CAPTCHA, que además sería un recurso de terceros sujeto a
  consentimiento) y funciona sin JavaScript.
- **Alternatives considered**: CAPTCHA de terceros (fricción y consentimiento) y un límite en
  memoria (se pierde al reiniciar y no se comparte entre réplicas).

## R7. Correo transaccional: Brevo con bandeja de salida

- **Decision**: **Brevo** mediante su API transaccional (`POST https://api.brevo.com/v3/smtp/email`
  con la cabecera `api-key`), detrás de un patrón *outbox*:
  - Registrar el mensaje y crear sus correos pendientes en `email_outbox` (el mensaje para la
    clínica y, si procede, el acuse) ocurre en **una única transacción**.
  - Justo después del commit se intenta enviar. Si falla, un proceso `email:dispatch` (temporizador
    de systemd cada minuto) reintenta con espera exponencial: 1, 5, 15 y 60 minutos y después cada
    6 horas, hasta 8 intentos (unas 24 h). Al agotarse, el estado pasa a `failed` y se registra un
    error en el log (FR-027).
  - **Acuse** (FR-025a): solo se crea si no hay otro acuse a la misma dirección en la última hora.
    La comprobación se hace por el hash SHA-256 de la dirección normalizada; si hay uno, el estado
    es `skipped_rate_limit`. El acuse no incluye el texto del mensaje.
  - El mensaje para la clínica lleva `reply-to` con el correo del visitante, para que la clínica
    responda directamente.
  - El remitente es una dirección del dominio de la demo verificada en Brevo (SPF y DKIM). El buzón
    de destino es `clinic.inbox_email`, que viene de la configuración (FR-025b). La clave
    `BREVO_API_KEY` se guarda solo en variables de entorno.
  - **Tests y local**: `EMAIL_PROVIDER=fake` usa un servidor HTTP falso que imita la API de Brevo y
    guarda los correos para que los tests los consulten.
- **Rationale**: decisión del responsable. El plan gratuito (300 correos al día) basta para la demo,
  y el patrón *outbox* garantiza SC-003: ningún mensaje aceptado se pierde ni se duplica.
- **Alternatives considered**: SMTP de una cuenta personal (peor entregabilidad de los acuses) y
  enviar dentro de la petición sin bandeja de salida (se pierde el correo si falla el proveedor).

## R8. Consentimiento de cookies

- **Decision**: implementación propia, sin plataforma de consentimiento de terceros.
  - La única cookie no esencial prevista es la de terceros que pone el **mapa**. Hoy no hay
    analítica.
  - La elección se guarda en una cookie propia y esencial, `pc_consent`, con versión de política,
    categorías y fecha. Dura 12 meses (`Max-Age`), es `SameSite=Lax` y `Secure`. Si cambia
    `CONSENT_VERSION`, se vuelve a preguntar (FR-037).
  - El aviso es un `<form method="post" action="/api/consent">` con dos botones de envío idénticos
    ("Aceptar" y "Rechazar"), así que funciona sin JavaScript. Con JavaScript se aplica sin recargar
    (FR-035 y US7). "Configurar cookies" en el pie abre la misma página o panel para cambiar o
    retirar la elección.
  - El servidor lee `pc_consent` y solo renderiza el `<iframe>` del mapa si la categoría
    `third_party` está aceptada (FR-036).
- **Rationale**: cumple la guía de la AEPD (rechazar cuesta lo mismo que aceptar, se puede retirar)
  sin añadir JavaScript de terceros.
- **Alternatives considered**: plataformas de consentimiento comerciales (scripts de terceros, peso
  y coste).

## R9. Mapa

- **Decision**: incrustación de **OpenStreetMap** (`openstreetmap.org/export/embed.html` con
  `bbox` y `marker` calculados a partir de las coordenadas configuradas), solo con consentimiento.
  Sin consentimiento se muestra `.map-placeholder` con la dirección, un enlace externo "Abrir en el
  mapa" y el botón "Aceptar y ver el mapa" (FR-020).
- **Rationale**: no necesita clave de API ni cuenta y no mete publicidad.
- **Alternatives considered**: Google Maps Embed (clave, más cookies y más peso) y un mapa estático
  generado (requiere un servicio de mosaicos con licencia).

## R10. Horario y "Abierto/Cerrado ahora"

- **Decision**: una función pura `getOpenStatus(now, weeklyHours, closures)` en la zona horaria
  `Europe/Madrid`, con `@js-temporal/polyfill`. Devuelve `open`, que incluye `closesAt`, o
  `closed`, que incluye `opensAt` (día y hora de la siguiente apertura, teniendo en cuenta los
  cierres excepcionales), y busca hasta 14 días por delante. Se usa en la clínica, en contacto y en
  el pie.
- **Rationale**: es testeable con pruebas unitarias (cambios de hora, festivos, varios tramos al
  día) y coherente con el proyecto anterior.
- **Alternatives considered**: `date-fns-tz` (válido, pero Temporal ya es el estándar en camino y
  el equipo lo conoce).

## R11. Textos legales y contenido enriquecido

- **Decision**: los textos legales y las respuestas de preguntas frecuentes se escriben en
  Markdown dentro del archivo de contenido y se renderizan con `react-markdown`, sin HTML crudo
  (opción por defecto) y solo con enlaces, listas, negritas y títulos de nivel 2 y 3. Los enlaces a
  secciones no disponibles se escriben como `section:tienda` y se resuelven al destino actual de la
  sección (US6, escenario 5).
- **Rationale**: no se interpreta HTML del contenido, con lo que la salida es segura (principio IV),
  y la clínica edita texto plano.
- **Alternatives considered**: HTML en el contenido (riesgo de XSS) y texto plano (sin formato
  mínimo).

## R12. Secciones "Próximamente"

- **Decision**: una tabla `sections` con `key` (`reservas`, `tienda`, `carrito`, `consejos` y
  `cuenta`), `label` y `href`, este último nulo mientras no exista la sección. Un helper
  `sectionHref(key)` devuelve `href` o `/proximamente/<key>`. Las páginas `/proximamente/[key]`
  llevan `noindex` y quedan fuera del sitemap.
- **Rationale**: cuando una sección exista, se cambia el dato y no las páginas (FR-006).

## R13. Accesibilidad, SEO y rendimiento

- **Decision**:
  - El menú móvil está montado sobre `<details>`/`<summary>`, así que funciona sin JavaScript. Con
    JavaScript gana el cierre con Escape, la devolución del foco y la retención del foco mientras
    está abierto (FR-004 y casos límite).
  - Las preguntas frecuentes usan `<details class="faq__item">`, que es nativo y funciona con
    teclado y sin JavaScript (FR-033).
  - Los errores del formulario usan `aria-invalid`, `aria-describedby` y un resumen con
    `role="alert"`, y el foco va al primer error (FR-024).
  - Las imágenes usan `next/image` con `width` y `height`, AVIF/WebP y `loading="lazy"` fuera de la
    primera pantalla. La imagen principal de la portada lleva `priority` (FR-048).
  - Cada ruta tiene sus metadatos (`generateMetadata`), con `robots: noindex` en "Próximamente" y
    "No encontrada", más un `sitemap.xml` y un `robots.txt` (FR-046).
- **Verificación**: Playwright con `@axe-core/playwright` en todas las rutas (SC-006), pruebas de
  teclado en Playwright y Lighthouse CI (`@lhci/cli`) en la portada en perfil móvil con un umbral
  de 90 (SC-007 y principio VI).

## R14. Seguridad

- **Decision**:
  - Cabeceras: la CSP se genera en `src/middleware.ts`, con un nonce por petición, como
    `default-src 'self'`, `frame-src https://www.openstreetmap.org`, `img-src 'self' data:` y
    `script-src 'self' 'nonce-…' 'strict-dynamic'`. Next.js aplica el nonce a sus scripts gracias
    al renderizado dinámico (R1). Las demás cabeceras van en `next.config.ts` `headers()`. También HSTS (a través de Caddy),
    `X-Content-Type-Options`, `Referrer-Policy: strict-origin-when-cross-origin` y
    `Permissions-Policy`.
  - Los Server Actions validan `Origin` frente al host, una protección CSRF integrada.
    `/api/consent` comprueba `Origin` y `Sec-Fetch-Site`.
  - Toda la salida pasa por el escapado de React. No se usa `dangerouslySetInnerHTML`, y lo
    comprueba una regla de ESLint.
  - Los secretos (`DATABASE_URL`, `BREVO_API_KEY` y `FORM_SECRET`) solo van en variables de
    entorno, con un `.env.example` sin valores reales. Gitleaks se ejecuta en CI.
  - Los logs se escriben en JSON con `pino`, **sin datos personales**: se registran `message_id` y
    códigos de error, nunca el correo ni el texto del mensaje. El visitante solo ve mensajes
    genéricos.

## R15. Conservación y tareas programadas

- **Decision**: un script `retention:purge` diario (temporizador de systemd) borra los
  `contact_messages` con más de 12 meses y sus filas de `email_outbox` (FR-030), y vacía
  `rate_limit_hits` de más de 24 h. `email:dispatch` se ejecuta cada minuto (R7).
- **Rationale**: es el mismo patrón que funcionó en el proyecto anterior (temporizadores de
  systemd en `deploy/`).

## R16. Despliegue

- **Decision**: un VPS Linux con Docker Compose. La aplicación usa la salida `standalone` de Next.js
  en una imagen basada en Node 22 Alpine, sin root, y `postgres:16` va con un volumen persistente.
  Caddy en el host hace de proxy inverso con HTTPS automático. Las copias se hacen con `pg_dump`
  diario rotado (temporizador de systemd). En local, `docker-compose.yml` levanta PostgreSQL y el
  proveedor de correo falso.
- **Dominio y Cloudflare** (decisión del responsable, igual que en otros proyectos):
  - La demo se publica en un **subdominio de un solo nivel** del dominio activo del responsable,
    **`example.com`** (confirmado), gestionado en **Cloudflare**. Se propone
    `petcare.example.com`; el nombre se fija en la configuración (`PETCARE_DOMINIO`),
    así que ni la aplicación ni Caddy lo llevan escrito. Un solo nivel es necesario porque el
    certificado gratuito de Cloudflare no cubre dos.
  - Registro `A` del subdominio a la IPv4 del VPS, **con proxy** (nube naranja) y sin `AAAA`. SSL en
    **Full (strict)**. «Always Use HTTPS» apagado, porque rompe el desafío HTTP-01 de Caddy. «Email
    Address Obfuscation» y «Rocket Loader» apagados, porque la CSP bloquearía lo que inyectan. Si
    el certificado falla con un 526, se usa temporalmente una *Configuration Rule* con SSL «Full»
    solo para el subdominio.
  - **VPS compartido**: se reutiliza el VPS y el Caddy del chatbot multicliente, igual que en el
    proyecto anterior. Se añade un bloque `{$PETCARE_DOMINIO} { import instancia petcare-app }` al
    Caddyfile del chatbot, y la aplicación se conecta a la red `chatbot_proxy`. La base de datos
    queda en una red interna sin puertos publicados.
  - **IP real del visitante** (es necesaria para el límite por origen de R6): el snippet
    `instancia` reemplaza `X-Forwarded-For` por `CF-Connecting-IP`. La aplicación solo confía en
    el primer salto cuando `TRUSTED_PROXY_IPS` no está vacío, y una prueba de despliegue
    comprueba que no se puede falsear (equivalente a `deploy/prueba-ip.sh`).
  - **Brevo**: el remitente se verifica con SPF y DKIM sobre el dominio en Cloudflare, y la clave de
    API es solo para este proyecto. Si está activo el bloqueo por IP de las claves, se añade la
    IPv4 del VPS.
- **Rationale**: decisión del responsable. Es el mismo enfoque que el proyecto anterior (`deploy/`
  con Caddy, systemd y copias de seguridad) y que sus otros despliegues en Cloudflare.
- **Alternatives considered**: Vercel con Neon (tareas programadas limitadas y menos control) y un
  VPS dedicado con su propio Caddy (duplica la infraestructura que ya existe).

## R17. Testing y CI

- **Decision**:
  - **Vitest** para pruebas unitarias: validación, `getOpenStatus`, límites, generación de URLs de
    mapa y esquema del archivo de contenido.
  - **Vitest** para pruebas de integración contra PostgreSQL real (servicio de Docker): carga de
    contenido idempotente, registro del mensaje con su bandeja de salida, deduplicación, reintentos
    y purga.
  - **Playwright** para las pruebas de extremo a extremo de las 8 historias de usuario, más el
    perfil sin JavaScript (`javaScriptEnabled: false`) para el formulario, el menú y las preguntas
    frecuentes, y `@axe-core/playwright`.
  - **Lighthouse CI** en la portada.
  - **GitHub Actions**: `lint` (ESLint, `tsc --noEmit`, `check:design`), unitarias, integración
    (con un servicio de PostgreSQL), extremo a extremo, Lighthouse y Gitleaks. Cualquier fallo
    bloquea el merge.
- **Rationale**: el principio III no incluye el contacto entre los flujos críticos, pero es el
  único flujo con escritura de esta feature y el principio VIII exige que funcione de punta a
  punta, así que se cubre igualmente.
