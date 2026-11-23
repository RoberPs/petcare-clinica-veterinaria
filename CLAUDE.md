# CLAUDE.md — PetCare, web de clínica veterinaria

Web de una clínica veterinaria **ficticia** (PetCare), en español, como demo de portfolio y
replicable para cualquier clínica. La clínica es ficticia, pero el producto no: todo funciona de
punta a punta.

**Responde siempre en español de España.** También en español: el texto visible, los errores, los
correos, los metadatos, la documentación, los comentarios del código y los mensajes al usuario.
Los identificadores del código (variables, funciones, tipos, tablas y columnas) van en inglés.

## Normas de trabajo con Claude

1. **Busca primero**: cuando sepas qué buscas, busca con grep antes de leer un archivo entero y
   lee solo lo que necesites.
2. **Explora con un subagente**: cuando haya que recorrer varias carpetas sin saber dónde está
   algo, usa un subagente con el modelo **Sonnet 5.5** (`model: sonnet`) y trae solo el resumen,
   así el contexto principal queda limpio.
3. **Solo el diff**: al cambiar un archivo, muestra el diff, no el archivo completo. Nada de
   reimprimir archivos. Al crear uno nuevo, muestra la ruta y un resumen de 2 o 3 líneas.
4. **No repitas**: no repitas ni reabras lo ya decidido, ni en esta sesión ni lo que ya consta en
   `specs/` y en este archivo.
5. **Contexto limpio**: si cambiamos de tarea, propón `/compact` o una sesión nueva.
6. **Respuestas cortas por defecto**: si hace falta más detalle, el usuario lo pide. Los informes
   que exigen los comandos `/speckit-*` se mantienen, pero en formato compacto.

## Fuente de verdad (orden de prioridad)

1. [`.specify/memory/constitution.md`](.specify/memory/constitution.md) (v1.1.0). **Prevalece
   sobre todo.** Ante un conflicto con una spec, un plan o una tarea, gana la constitución.
2. La spec y el plan de la feature activa, que indica `.specify/feature.json`. Hoy es
   [`specs/006-health-tips-newsletter/`](specs/006-health-tips-newsletter/): `spec.md`, `plan.md`,
   `research.md` (decisiones E1–E18), `data-model.md` y `contracts/`. Siguen vigentes las
   decisiones R1–R17 de la 001, A1–A14 de la 002, B1–B17 de la 003, C1–C16 de la 004 y D1–D20
   de la 005.
3. [`design/README.md`](design/README.md), la guía visual.

## Estado actual

- Feature **001 — web pública**: **implementada** (tareas en `specs/001-public-clinic-website/tasks.md`).
  Despliegue preparado en [`deploy/README.md`](deploy/README.md).
- Feature **002 — cuentas de cliente y mascotas**: **implementada** (tareas en
  `specs/002-client-accounts-pets/tasks.md`; desviaciones anotadas en su `checklists/requirements.md`).
  Añade `@node-rs/argon2` y la migración `0001_client_accounts`.
- Feature **003 — reserva de citas online**: **implementada** (tareas en
  `specs/003-online-appointment-booking/tasks.md`; desviaciones anotadas en su
  `checklists/requirements.md`). Añade la migración `0002_appointments` con `btree_gist` (sin
  dependencias nuevas); la lógica con efectos vive en `src/lib/booking/`.
- Feature **004 — catálogo de la tienda (sin compra)**: **implementada** (tareas en
  `specs/004-product-catalog/tasks.md`; desviaciones anotadas en su `checklists/requirements.md`).
  Añade la migración `0003_product_catalog`, sin dependencias nuevas. El middleware usa el runtime
  Node.js y consulta la base de datos en `/productos/*` para servir el 404 sin JavaScript.
- Feature **005 — carrito y pago**: **implementada** (tareas en `specs/005-cart-checkout/tasks.md`;
  desviaciones anotadas en su `checklists/requirements.md`). Stripe Checkout en modo de pruebas por
  HTTP, sin SDK, con `PAYMENT_PROVIDER=fake` en local y en los tests. Añade la migración
  `0004_cart_checkout`, sin dependencias nuevas. Los pedidos se gestionan con `npm run orders`
  (`cli/orders.mjs` en producción) y el temporizador `petcare-orders-maintain`.
- Feature **006 — consejos de salud y boletín**: **implementada** (tareas en
  `specs/006-health-tips-newsletter/tasks.md`; desviaciones anotadas en su
  `checklists/requirements.md`). Sin dependencias nuevas; añade la migración
  `0005_health_tips_newsletter` y el secreto `NEWSLETTER_HASH_KEY`. La lógica con efectos vive en
  `src/lib/newsletter/`, y la preferencia de la cuenta solo se escribe desde `sync.ts`.
- **Repositorio**: `RoberPs/petcare-clinica-veterinaria` (propio, sin historial de otros
  proyectos). **Rama de git**: `006-health-tips-newsletter`. El script de ramas de Spec Kit cuenta
  también las del remoto `gestor-citas` (otro proyecto), así que hay que revisar el número que
  propone.
- PostgreSQL local: desarrollo en el puerto **5434** (el 5432 lo usa un PostgreSQL nativo) y
  pruebas en el **5433**.

## Stack decidido (feature 001)

- **Next.js 15** (App Router, React Server Components y Server Actions), **React 19** y
  **TypeScript strict**, sobre Node.js 22 LTS.
- **PostgreSQL 16** con **Drizzle ORM**, `drizzle-kit` y `pg`, con migraciones versionadas en
  `drizzle/`.
- **Zod** para validar en servidor, **pino** para los logs (sin datos personales),
  **`@js-temporal/polyfill`** para fechas y horas en `Europe/Madrid` y **`react-markdown`** sin
  HTML crudo.
- **Brevo** por API HTTP (sin SDK), detrás de una bandeja de salida (`email_outbox`). En local y en
  los tests, `EMAIL_PROVIDER=fake`.
- **Tests**: Vitest (unitarias y de integración contra PostgreSQL real), Playwright con
  `@axe-core/playwright` (también con el perfil sin JavaScript) y Lighthouse CI.
- **Despliegue**: Docker Compose en el VPS compartido del chatbot, detrás de su Caddy (red
  `chatbot_proxy`) y de **Cloudflare**, con proxy y Full (strict). El subdominio de un solo nivel
  es `petcare.automatizacionro.work`, fijado en la variable `PETCARE_DOMINIO`. La IP real del
  visitante sale de `CF-Connecting-IP` y solo se confía en ella si la petición viene de
  `TRUSTED_PROXY_IPS`.

## Reglas que no se negocian

### Diseño (principio I)

- Solo `design/tokens.css` y `design/styles.css`. **Prohibido**:
  - escribir a mano colores, tamaños, radios, sombras, espaciados o duraciones;
  - el atributo `style=""`;
  - CSS Modules, Tailwind o cualquier `.css` fuera de `design/`.
- Si falta un componente, se añade a `design/styles.css` usando **solo tokens**. Un valor nuevo se
  añade primero como token.
- Las maquetas de `design/*.html` dan la estructura. **Sus textos, cifras e imágenes no se
  publican.** Nunca se usa nada de `design/reference/`.
- Color de los CTA según su intención: **cian** para pedir cita, **rosa** para contacto, **menta**
  para éxito, **ámbar** para campañas y **marino** para la acción neutra.
- Orden de la cabecera: Tratamientos · La clínica · Nuestros productos · Consejos de salud ·
  Preguntas frecuentes | Mi cuenta · Pide cita · Contacto · Carrito (siempre el último).

### Contenido y adaptabilidad (principios II y VIII)

- **Ningún dato de una clínica concreta en `src/`.** Todo sale de la base de datos, que se carga
  desde `content/<clinica>.yaml` con `npm run content:load`, o de las variables de entorno.
- Los datos personales del responsable y el buzón de destino van en `${VAR}` dentro del YAML y se
  resuelven desde el entorno. **Nunca se escriben en el repositorio.**
- **Hay una excepción temporal al principio VIII**: no hay panel de administración. Las páginas
  leen **solo de la base de datos**, nunca del YAML directamente.
- Las cifras de actividad pueden ser ficticias. Los **avisos de salud** solo se muestran si tienen
  una fuente real.
- En la demo no se inventan razón social ni NIF. El responsable del tratamiento es el responsable
  real de la demo.

### Privacidad y seguridad (principio IV)

- Antes del consentimiento no se carga ningún recurso de terceros, como el mapa de OpenStreetMap.
  Rechazar cuesta lo mismo que aceptar. La cookie del consentimiento es `pc_consent`.
- Toda entrada se valida en el servidor con Zod. No se usa `dangerouslySetInnerHTML`.
- Los secretos (`DATABASE_URL`, `BREVO_API_KEY`, `FORM_SECRET`…) van solo en `.env`, con un
  `.env.example` sin valores reales.
- En los logs no aparecen el correo ni el texto de los mensajes: solo identificadores y códigos de
  error.

### Accesibilidad y rendimiento (principios V y VI)

- WCAG 2.2 AA: teclado, foco visible, enlace para saltar al contenido, errores con ARIA junto al
  campo y `prefers-reduced-motion`.
- **Todo funciona sin JavaScript**: navegación, menú móvil (`<details>`), preguntas frecuentes,
  formulario (Server Action con POST-Redirect-GET) y aviso de cookies (POST a `/api/consent`).
- `next/image` con dimensiones y Lighthouse móvil de 90 o más en `/`.

## Decisiones de diseño técnico que hay que respetar

- **Idempotencia del formulario**: `submission_id` es un UUID firmado y `UNIQUE` en
  `contact_messages`. Un reenvío devuelve la misma confirmación.
- **Bandeja de salida**: el mensaje y sus correos se crean en una sola transacción. Después hay un
  intento inmediato y luego reintentos con `email:dispatch` (8 intentos en unas 24 h).
- El acuse al visitante **no copia su mensaje** y se limita a uno por dirección y hora.
- Límite por origen: 5 envíos cada 10 minutos por IP. En IPv6 se agrupa por el prefijo /64.
- `src/domain/` es TypeScript puro, sin importar Next, React, Drizzle ni `pg`.
- Los enlaces a secciones futuras pasan por `sectionHref(key)`. Si `href` es nulo, llevan a
  `/proximamente/<key>`.

## Comandos

```bash
docker compose up -d                              # PostgreSQL y el correo falso
npm run db:migrate
npm run content:load -- --file content/petcare.yaml
npm run dev
npm run lint              # ESLint, tsc y check:design
npm test                  # unitarias
npm run test:integration
npm run test:e2e          # Playwright, axe y perfil sin JavaScript
npm run test:lighthouse
```

## Flujo de trabajo

- Spec Kit: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
  `/speckit-implement`. Cada plan incluye la comprobación de la constitución, y las excepciones se
  anotan en Complexity Tracking.
- Una feature está **terminada** cuando:
  - funciona de punta a punta con datos persistentes;
  - no tiene datos de una clínica concreta en el código;
  - pasan sus tests y los de los flujos críticos afectados (ver más abajo);
  - no hay estilos escritos a mano;
  - se ha verificado la accesibilidad (teclado y axe);
  - no hay secretos en el diff;
  - y, si afecta a la portada o al catálogo, Lighthouse da 90 o más.
- **Tests reducidos al mínimo en cada spec**: en local, durante una feature, solo se ejecutan las
  pruebas imprescindibles (unitarias, de integración y e2e) de lo nuevo de esa spec, filtrando por
  archivo o por nombre, **más los tests de los flujos críticos que toque** (principio III: registro
  e inicio de sesión, reserva de cita, checkout y pago, estados de pedido) **y Lighthouse si toca
  la portada o el catálogo**. **La batería completa en local** (`npm test`, `test:integration`,
  `test:e2e` y `test:lighthouse` enteros) **se pasa solo al final del proyecto**; la CI la sigue
  pasando en cada cambio. Motivo: cada batería completa tarda demasiado.
- Los commits y los pushes se hacen **solo cuando el usuario lo pide**.
