# Tasks: Cuentas de cliente y mascotas

**Input**: documentos de diseño de `specs/002-client-accounts-pets/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **se incluyen**. El registro y el inicio de sesión son un flujo crítico (principio III).
Las reglas de acceso (principio IV) y axe (principio V) forman parte de sus tests. Dentro de cada
historia, las pruebas se escriben **antes** que la implementación y deben fallar primero.

**Organization**: tareas agrupadas por historia de usuario. Cada historia se puede implementar y
probar por separado una vez terminada la Fase 2. Las fixtures de la Fase 2 crean cuentas
verificadas y sesiones directamente en la base de datos, así que US3–US8 no dependen de la
interfaz de US1 ni de US2.

## Formato: `[ID] [P?] [Story] Descripción`

- **[P]**: se puede hacer en paralelo (archivos distintos y sin dependencias pendientes).
- **[Story]**: historia de usuario de la spec (US1–US8).

## Convenciones del proyecto

- Son las mismas de la 001: un solo proyecto Next.js, estilos solo en `design/`, textos en
  español e identificadores en inglés, y ningún dato de la clínica en `src/`.
- **Patrón de las acciones**: la lógica con efectos va en `src/lib/account/<flujo>.ts` y devuelve
  un resultado discriminado. La Server Action, en `src/app/**/actions.ts`, llama a
  `requireCustomer()` si es privada y traduce el resultado a una redirección (`?aviso=`) o a un
  estado de `useActionState`. Es el mismo patrón que
  `src/lib/contact-submission.ts` y `src/app/contacto/actions.ts`.
- **Decisiones**: las referencias A1–A14 son de [research.md](./research.md). Los campos, mensajes
  y resultados están en [contracts/forms.md](./contracts/forms.md), y las rutas en
  [contracts/routes.md](./contracts/routes.md).

---

## Phase 1: Setup (infraestructura compartida)

- [X] T001 Añadir la dependencia `@node-rs/argon2` en `package.json` y declararla en `serverExternalPackages` de `next.config.ts`. Comprobar que `docker build` sobre `node:22-alpine` sigue funcionando (`Dockerfile`).
- [X] T002 [P] Crear `scripts/generate-common-passwords.ts`, que descarga una vez la lista de 10.000 contraseñas de SecLists (MIT) y escribe `src/domain/common-passwords.ts` como un `Set` en minúsculas con la cabecera de licencia. Ejecutarlo y versionar el archivo generado. El script no se ejecuta en el build.
- [X] T003 [P] Añadir al lint (`eslint.config.mjs`) una regla `no-restricted-imports` que impida importar `src/lib/auth/*` y `src/db/*` desde `src/domain/`, y añadir `src/domain/common-passwords.ts` a las excepciones de longitud o formato del lint si hace falta.

---

## Phase 2: Foundational (requisitos que bloquean todo)

**⚠️ CRITICAL**: ninguna historia empieza hasta terminar esta fase.

### Esquema y migración

- [X] T004 Añadir a `src/db/schema.ts` las tablas `customers`, `customer_consents`, `customer_sessions`, `account_tokens`, `species`, `pets` y `processed_submissions`, y los enums `consent_kind` y `token_purpose`, con las columnas, restricciones e índices de [data-model.md](./data-model.md).
- [X] T005 Modificar `email_outbox` en `src/db/schema.ts`: `contact_message_id` admite nulos, se añaden `customer_id` (FK `ON DELETE SET NULL`) y `payload jsonb`, se añade el `CHECK` de data-model.md y los 5 valores nuevos de `outbox_kind`.
- [X] T006 Generar `drizzle/0001_client_accounts.sql` con `npm run db:generate` (tag `0001_client_accounts`), revisar el SQL a mano y comprobar que `npm run db:migrate` lo aplica sobre una base de datos con datos de la 001.

### Contenido

- [X] T007 Añadir la clave `species` (de 1 a 20 elementos, `key` válida y distinta de `other`) al esquema de `src/content/schema.ts`, y en `src/content/load.ts` el upsert por `key` con `sort_order` y el borrado de las especies ausentes, avisando por consola de cuántas mascotas pasan a "Otra" (contracts/content-file.md).
- [X] T008 Actualizar `content/petcare.yaml`:
  - añadir `species` (perro, gato, conejo, hurón, ave);
  - poner `cuenta.href: /mi-cuenta`;
  - ampliar el texto de `privacidad` con el tratamiento de las cuentas (finalidades de FR-002, base jurídica, conservación y derechos) y subir su `version`.
- [X] T009 [P] Ampliar `tests/unit/content-schema.test.ts` con `species` válidas e inválidas (clave reservada, duplicada o vacía), y `tests/integration/content-load.test.ts` con el upsert y el borrado de especies, incluido el paso de una mascota a `species_key = NULL`.

### Dominio puro

- [X] T010 [P] Crear `src/domain/password-policy.ts` con `checkPassword(password, email)`, que devuelve `ok | too_short | too_long | common | contains_email` (A7). Tests en `tests/unit/password-policy.test.ts`.
- [X] T011 [P] Crear `src/domain/account-schemas.ts` con los esquemas Zod `registerSchema`, `loginSchema`, `emailOnlySchema`, `newPasswordSchema`, `changePasswordSchema`, `profileSchema`, `marketingSchema`, `petSchema(speciesKeys, today)` y `deleteAccountSchema`, con los campos y mensajes en español de contracts/forms.md. Tests en `tests/unit/account-schemas.test.ts`, incluidos el teléfono normalizado y la regla de que código postal y localidad van juntos.
- [X] T012 [P] Ampliar `src/domain/rate-limit.ts` con las políticas con nombre `contact`, `login_account`, `login_origin` y `auth_origin` (A6), `toPolicyBucket(policy, key, secret)` y `retryAfterMinutes(oldestHitInWindow, policy, now)`, sin romper la API que usa el contacto. Ampliar `tests/unit/rate-limit.test.ts`.
- [X] T013 [P] Crear `src/domain/pet-age.ts` con `petAge(birthDate: Temporal.PlainDate, today: Temporal.PlainDate)`, que devuelve el texto ("1 año", "4 años", "1 mes", "5 meses", "Menos de 1 mes"), y `todayInClinicZone(clock)`. Tests en `tests/unit/pet-age.test.ts`, con el 29 de febrero y el día exacto del cumpleaños.

### Autenticación (servidor)

- [X] T014 [P] Crear `src/lib/auth/password.ts` con `hashPassword`, `verifyPassword` (devuelve `{ok, needsRehash}`) y `verifyAgainstDummy()` (hash ficticio calculado una vez al arrancar), con los parámetros Argon2id de A1. Tests en `tests/unit/password-hash.test.ts`.
- [X] T015 Crear `src/lib/auth/session.ts`:
  - `createSession(customerId, remember)`: token de 32 bytes, guarda el SHA-256 y fija la cookie `pc_session` con o sin `Max-Age` (A2);
  - `getCurrentSession()`: comprueba la vigencia por `expires_at` y por las 2 h de inactividad, y actualiza `last_seen_at` como mucho una vez por minuto;
  - `revokeSession`, `revokeOtherSessions(customerId, keepHash)`, `revokeAllSessions(customerId)` y `clearSessionCookie()`.

  Las consultas van en `src/db/queries/sessions.ts`.
- [X] T016 Crear `src/lib/auth/require-customer.ts` con `requireCustomer()`, que redirige a `/iniciar-sesion?return_to=<ruta>` (usando `getPathname()` e `isSafeReturnTo`), y `getOptionalCustomer()`. Las consultas van en `src/db/queries/customers.ts` (`getCustomerById`).
- [X] T017 [P] Crear `src/lib/auth/tokens.ts` con `issueToken(tx, customerId, purpose)`, que borra los anteriores del mismo propósito y devuelve el token en claro; `peekToken(token, purpose)`, que solo valida, y `consumeToken(tx, token, purpose)` (A4).
- [X] T018 [P] Crear `src/lib/notice.ts` con el mapa de códigos `?aviso=` a textos fijos (A14), y `src/components/Notice.tsx`, que lo pinta en una región `role="status"` con las clases existentes (`notice` o `form-success`).
- [X] T019 [P] Crear `src/lib/auth/submission.ts` con `claimSubmission(tx, submissionId, scope)`, que inserta en `processed_submissions` con `ON CONFLICT DO NOTHING` y devuelve `fresh | duplicate(resultRef)`. Reutiliza `verifySubmissionToken` de `src/lib/form-token.ts`.

### Correo

- [X] T020 Ampliar `src/email/dispatch.ts`:
  - las filas con `payload` se envían tal cual;
  - al pasar a `sent` o `failed`, el `payload` se pone a NULL;
  - nueva función `dispatchById(outboxId)` para el intento inmediato con `after()`.

  Sin cambios para las filas de contacto. Ampliar `tests/integration/email-dispatch.test.ts`.
- [X] T021 Crear `src/email/account-outbox.ts`:
  - `enqueueAccountEmail(tx, {kind, customerId, to, email})`: calcula `recipient_hash` y aplica el límite de 3 por tipo y hora en `verify_email`, `account_exists` y `password_reset` (estado `skipped_rate_limit`). Devuelve el id.
  - `sendAccountEmailsNow(ids)` con `after()`.

### Interfaz común y cabeceras

- [X] T022 [P] Añadir a `design/styles.css`, **solo con tokens**, lo que falte para el área: la marca de la sección actual de `side-nav` (`[aria-current="page"]`) y el estado de error de `select`. **No** se crea ningún color ni ninguna variante de peligro: los borrados usan `.btn` (marino), según el principio I. Comprobarlo con `npm run check:design`.
- [X] T023 [P] Crear `src/components/PasswordFields.tsx`, con contraseña y repetición, `autocomplete="new-password"`, pista del requisito y errores ARIA, reutilizable en registro, restablecimiento y cambio de contraseña.
- [X] T024 Crear `src/lib/auth/private-metadata.ts`, que exporta `privateMetadata` (`robots: { index: false, follow: false }`), y usarlo en `src/app/mi-cuenta/layout.tsx` y en **todas** las páginas de `crear-cuenta`, `verificar-correo`, `iniciar-sesion`, `recuperar-contrasena` y `restablecer-contrasena` (FR-045). Además, añadir en `next.config.ts` `headers()` la cabecera `Cache-Control: private, no-store` para `/mi-cuenta/:path*`, `/iniciar-sesion`, `/crear-cuenta/:path*`, `/verificar-correo`, `/recuperar-contrasena/:path*`, `/restablecer-contrasena` y `/api/account/:path*`; y añadir `/mi-cuenta` al `disallow` de `src/app/robots.ts` (A3).

### Fixtures de test

- [X] T025 Ampliar `tests/integration/helpers/db.ts` y `tests/e2e/db.ts`:
  - `createCustomer({verified, email, password, …})`, que inserta con un hash real;
  - `createSessionFor(customerId, remember)`, que devuelve el valor de la cookie;
  - `createPet(customerId, …)`;
  - `resetAccountState()`, que vacía las tablas nuevas, `rate_limit_hits` y la bandeja de salida.
- [X] T026 Ampliar `tests/e2e/fixtures.ts` con `loginAs(page, customer)`, que inyecta la cookie `pc_session`; `latestEmailTo(address, kind)`, que lee la bandeja falsa, y `extractLink(email)`.

**Checkpoint**: la base está lista y las historias pueden empezar.

---

## Phase 3: User Story 1 — Crear una cuenta y verificar el correo (P1) 🎯 MVP

**Goal**: un visitante crea su cuenta, recibe el correo y la verifica.

**Independent Test**: registrar una cuenta, abrir el enlace del correo falso, confirmar y comprobar
que `email_verified_at` está relleno y que se llega a "Iniciar sesión" con el aviso.

### Tests (US1)

- [X] T027 [P] [US1] Test de integración `tests/integration/register.test.ts`:
  - alta nueva (cliente, consentimiento `privacy_terms` con las versiones, token y `verify_email` en la bandeja);
  - correo duplicado verificado (`account_exists`, sin segunda fila) y sin verificar (token nuevo y `verify_email`);
  - mayúsculas y espacios en el correo;
  - doble envío con el mismo `submission_id`;
  - contraseñas distintas;
  - sin `accept_terms`;
  - límite `auth_origin`;
  - 4.º correo en una hora (`skipped_rate_limit`).
- [X] T028 [P] [US1] Test de integración `tests/integration/verify-email.test.ts`: token vigente, caducado, usado y manipulado; reenvío que invalida el anterior; cuenta ya verificada; y el GET (`peekToken`) que no consume el token.
- [X] T029 [P] [US1] Test unitario de plantillas en `tests/unit/email-templates.test.ts` para `verifyEmail` y `accountExists`: escapado, aviso de demostración, enlace absoluto con `SITE_URL` y ningún dato aparte del nombre.
- [X] T030 [P] [US1] Test e2e `tests/e2e/us1-register.spec.ts` en los proyectos móvil, escritorio y no-js:
  - errores junto al campo con los datos conservados (sin las contraseñas);
  - "Revisa tu correo";
  - correo duplicado con la misma página;
  - enlace del correo y botón "Confirmar mi correo";
  - "Iniciar sesión" con el aviso y el correo ya escrito;
  - enlace caducado con el reenvío;
  - axe en `/crear-cuenta`, `/crear-cuenta/revisa-tu-correo` y `/verificar-correo`.

### Implementación (US1)

- [X] T031 [P] [US1] Plantillas `src/email/templates/verify-email.ts` y `src/email/templates/account-exists.ts` según contracts/emails.md.
- [X] T032 [US1] `src/lib/account/register.ts` con `processRegistration(form, {ip, now})` según A5: alta o aviso en una transacción, Argon2id siempre, consentimiento, `marketing_opt_in` (más su consentimiento si viene marcado), `claimSubmission`, `issueToken` y `enqueueAccountEmail`. Devuelve `ok | invalid | rate_limited | expired | error`.
- [X] T033 [US1] `src/lib/account/verify.ts` con `processVerification(token)` y `processResendVerification(form, {ip, now})`, este último con una respuesta idéntica exista o no la cuenta.
- [X] T034 [P] [US1] `src/components/RegisterForm.tsx` con la estructura de `design/registro.html` (`auth`, `auth__card`, `form`, `field-row`, `check`), el `submission_id` oculto, el campo trampa, la casilla de privacidad y términos con enlaces a `/privacidad` y `/terminos`, la casilla de consejos desmarcada y separada, `PasswordFields`, `autocomplete` y el resumen de errores enfocable.
- [X] T035 [US1] `src/app/crear-cuenta/page.tsx` y `src/app/crear-cuenta/actions.ts` (`register`), con `noindex` y redirección a `/mi-cuenta` si ya hay sesión (`getOptionalCustomer`). Sin JavaScript, redirección 303 a `/crear-cuenta/revisa-tu-correo`.
- [X] T036 [US1] `src/app/crear-cuenta/revisa-tu-correo/page.tsx` con el formulario de reenvío (`resendVerification`, en `actions.ts`) y el aviso `enlace-reenviado`.
- [X] T037 [US1] `src/app/verificar-correo/page.tsx` (con `peekToken`: botón, "ya verificada" o enlace caducado con reenvío) y `src/app/verificar-correo/actions.ts` (`verifyEmail`: consume, pone la cookie firmada `pc_login_hint` con `Path=/iniciar-sesion` y 10 min, y redirige a `/iniciar-sesion?aviso=correo-verificado`).

**Checkpoint**: US1 funciona y se puede probar por separado.

---

## Phase 4: User Story 2 — Iniciar y cerrar sesión con "Recordarme" (P1)

**Goal**: entrar, mantener la sesión según "Recordarme", salir y proteger las páginas privadas.

**Independent Test**: con una cuenta verificada de la fixture, entrar con y sin "Recordarme",
cerrar sesión y comprobar que `/mi-cuenta` vuelve a pedir iniciar sesión, también con "atrás".

### Tests (US2)

- [X] T038 [P] [US2] Test de integración `tests/integration/login.test.ts`:
  - éxito con y sin `remember` (`expires_at` y `remember` en la fila);
  - correo inexistente y contraseña incorrecta con el mismo resultado;
  - cuenta sin verificar (`unverified` solo con la contraseña correcta);
  - bloqueo `login_account` al 6.º fallo y `login_origin` al 21.º, con `retryMinutes`;
  - rehash cuando los parámetros son más bajos;
  - `return_to` inseguro ignorado.
- [X] T039 [P] [US2] Test de integración `tests/integration/session.test.ts`: caducidad por inactividad de 2 h sin `remember`, tope de 12 h, 30 días con `remember`, `last_seen_at` que no se reescribe antes de un minuto y `revokeSession` tras cerrar sesión.
- [X] T040 [P] [US2] Test e2e `tests/e2e/us2-login.spec.ts` (también no-js):
  - error genérico;
  - "verifica tu correo" con el botón de reenvío;
  - bloqueo con los minutos;
  - `return_to` tras entrar;
  - "Mi cuenta" sin sesión lleva a iniciar sesión y con sesión al resumen;
  - "Cerrar sesión" lleva a la portada con el aviso;
  - axe en `/iniciar-sesion`.
- [X] T041 [P] [US2] Test e2e `tests/e2e/account-no-cache.spec.ts`:
  - `Cache-Control: no-store` en todas las rutas de contracts/routes.md;
  - tras cerrar sesión, `page.goBack()` en `/mi-cuenta` acaba en `/iniciar-sesion`;
  - la cookie sin `remember` no tiene `Expires` y con `remember` tiene unos 30 días (SC-004).

### Implementación (US2)

- [X] T042 [US2] `src/lib/account/login.ts` con `processLogin(form, {ip, now})` según A1, A2 y A6:
  - comprueba antes el bloqueo de las dos políticas;
  - verifica contra el hash ficticio si la cuenta no existe;
  - apunta el intento solo si falla;
  - si la contraseña es correcta pero la cuenta no está verificada, devuelve `unverified`;
  - en el éxito, crea la sesión y rehace el hash si hace falta.

  Eventos de log de contracts/forms.md.
- [X] T043 [P] [US2] `src/components/LoginForm.tsx` con la estructura de `design/login.html`: correo (rellenado desde `pc_login_hint`), contraseña con `autocomplete="current-password"`, "Recordarme", el enlace "¿Olvidaste tu contraseña?" a `/recuperar-contrasena`, "Crear cuenta" y el estado `unverified` con el botón que envía `resendVerification`.
- [X] T044 [US2] `src/app/iniciar-sesion/page.tsx` y `src/app/iniciar-sesion/actions.ts` (`login`): lee y borra `pc_login_hint` en la acción, muestra el `Notice` y redirige a `return_to` seguro o a `/mi-cuenta`. Si ya hay sesión, redirige a `/mi-cuenta`.
- [X] T045 [US2] `src/app/mi-cuenta/layout.tsx`, que llama a `requireCustomer()` y pinta `account-grid` con `src/components/AccountNav.tsx`:
  - entradas Resumen, Mis mascotas, Mis citas (`sectionHref('reservas')`), Mis pedidos (`sectionHref('tienda')`) y Datos personales, con `aria-current="page"`;
  - el botón "Cerrar sesión" con su formulario POST.
- [X] T046 [US2] `src/app/mi-cuenta/cerrar-sesion/actions.ts` (`logout`): `revokeSession`, borra la cookie y redirige a `/?aviso=sesion-cerrada`. Hacer que `src/app/page.tsx` muestre el `Notice` de `sesion-cerrada` y de `cuenta-eliminada`.
- [X] T047 [US2] `src/app/mi-cuenta/page.tsx` mínima (saludo "Hola, {first_name}"), para que US2 sea demostrable. US4 la completa.

**Checkpoint**: US1 y US2 juntas forman el MVP de cuentas.

---

## Phase 5: User Story 3 — Gestionar mis mascotas (P1)

**Goal**: añadir, editar y eliminar mascotas, con la edad visible.

**Independent Test**: con `loginAs` sobre una cuenta de la fixture, añadir dos mascotas, editar
una, eliminar otra y comprobar la lista; intentar editar la mascota de otro cliente y recibir 404.

### Tests (US3)

- [X] T048 [P] [US3] Test de integración `tests/integration/pets.test.ts`:
  - crear, editar y eliminar;
  - especie `other`, que se guarda como NULL;
  - especie inexistente, fecha futura y de más de 40 años;
  - el límite de 30, también con dos altas concurrentes;
  - doble envío con el mismo `submission_id`;
  - orden por nombre.
- [X] T049 [P] [US3] Test de integración `tests/integration/pets-authz.test.ts` (SC-003): el cliente B intenta leer, editar y eliminar la mascota de A con `not_found` en los tres casos, la fila de A sigue intacta y se registra `pet_access_denied` sin datos personales.
- [X] T050 [P] [US3] Test e2e `tests/e2e/us3-pets.spec.ts` (también no-js):
  - estado vacío;
  - añadir y ver "4 años" y "5 meses";
  - editar y ver el cambio en la lista con el aviso;
  - eliminar con la página de confirmación que nombra a la mascota;
  - 404 en `/mi-cuenta/mascotas/<id de otro>/editar`;
  - axe en las cuatro rutas.

### Implementación (US3)

- [X] T051 [P] [US3] `src/db/queries/species.ts` (`listSpecies`) y `src/db/queries/pets.ts` (`listPets`, `getPet`, `insertPet`, `updatePet` y `deletePet`). Todas exigen `customerId` y filtran por él (A9).
- [X] T052 [US3] `src/lib/account/pets.ts` con `processCreatePet`, `processUpdatePet` y `processDeletePet`: validación con `petSchema`, límite de 30 con `FOR UPDATE` sobre el cliente, `claimSubmission` en el alta y `not_found` con el log `pet_access_denied`.
- [X] T053 [P] [US3] `src/components/PetIcon.tsx` con iconos SVG propios por clave de especie y uno genérico, y `src/components/PetCard.tsx` (`pet`, `pet__avatar`, `product__meta`) con nombre, especie ("Otra" si es NULL), edad (`petAge`), "Editar", "Eliminar" y "Pedir cita" (`sectionHref('reservas')`, botón `btn--sky btn--sm`).
- [X] T054 [P] [US3] `src/components/PetForm.tsx` con nombre, `select` de especies más "Otra", `<input type="date">` con `max` igual a hoy y la pista sobre la fecha aproximada, `submission_id` en el alta y errores ARIA.
- [X] T055 [US3] `src/app/mi-cuenta/mascotas/page.tsx` (lista `pets` o `empty-state` con "Añadir mascota", más el `Notice`) y `src/app/mi-cuenta/mascotas/actions.ts` (`createPet`, `updatePet` y `deletePet`, todas con `requireCustomer()`).
- [X] T056 [US3] `src/app/mi-cuenta/mascotas/nueva/page.tsx`, con el aviso del límite si hay 30.
- [X] T057 [US3] `src/app/mi-cuenta/mascotas/[id]/editar/page.tsx` y `src/app/mi-cuenta/mascotas/[id]/eliminar/page.tsx` (confirmación con el nombre, "No se puede deshacer", botón `.btn` "Eliminar a {nombre}" y "Cancelar"). Si la mascota es ajena o no existe, `notFound()`.

**Checkpoint**: las tres historias P1 funcionan.

---

## Phase 6: User Story 4 — Resumen del área personal (P2)

**Goal**: el resumen con el saludo, las mascotas y los accesos.

**Independent Test**: entrar con una cuenta con mascotas y sin ellas, y comprobar el contenido y el
destino de cada acceso.

- [X] T058 [P] [US4] Test e2e `tests/e2e/us4-summary.spec.ts`: saludo con el nombre real, mascotas con especie y edad, estado vacío, "Mis citas", "Mis pedidos" y "Pedir cita" que llevan a `/proximamente/reservas` o `/proximamente/tienda`, `aria-current` en "Resumen" y axe.
- [X] T059 [US4] Completar `src/app/mi-cuenta/page.tsx` con la estructura de `design/cuenta.html` (`page-hero`, la lista `pets` con `PetCard` y "Añadir mascota", o `empty-state`). **No** se pinta el bloque "Últimos pedidos".

---

## Phase 7: User Story 5 — Recuperar la contraseña (P2)

**Goal**: pedir el enlace, fijar una contraseña nueva y cerrar las demás sesiones.

**Independent Test**: pedir la recuperación para una cuenta de la fixture, usar el enlace del correo
falso, entrar con la contraseña nueva y comprobar que la anterior falla.

- [X] T060 [P] [US5] Test de integración `tests/integration/password-reset.test.ts`:
  - respuesta idéntica con correo existente y sin él (y sin correo encolado si no existe);
  - token de 1 h, caducado, usado y nuevo que invalida el anterior;
  - cambio de hash;
  - todas las sesiones borradas;
  - cuenta sin verificar que queda verificada;
  - `password_changed` encolado;
  - límite de 3 por hora.
- [X] T061 [P] [US5] Test e2e `tests/e2e/us5-password-reset.spec.ts` (también no-js): flujo completo con el correo falso, enlace reutilizado que muestra la página de caducado, y axe en `/recuperar-contrasena`, `/recuperar-contrasena/enviado` y `/restablecer-contrasena`.
- [X] T062 [P] [US5] Plantillas `src/email/templates/password-reset.ts` y `src/email/templates/password-changed.ts` (con la fecha en Europe/Madrid), y sus tests en `tests/unit/email-templates.test.ts`.
- [X] T063 [US5] `src/lib/account/password-reset.ts` con `processResetRequest(form, {ip, now})` y `processResetPassword(form, {now})`.
- [X] T064 [US5] `src/app/recuperar-contrasena/page.tsx`, `src/app/recuperar-contrasena/actions.ts`, `src/app/recuperar-contrasena/enviado/page.tsx`, `src/app/restablecer-contrasena/page.tsx` (con `peekToken`: formulario con `PasswordFields` o enlace caducado) y `src/app/restablecer-contrasena/actions.ts`, que redirige a `/iniciar-sesion?aviso=contrasena-restablecida` y borra la cookie de sesión actual.

---

## Phase 8: User Story 6 — Editar mis datos personales (P2)

**Goal**: cambiar nombre, apellidos, teléfono, dirección y contraseña.

**Independent Test**: con `loginAs`, cambiar cada dato, cerrar sesión, volver a entrar y ver los
datos nuevos.

- [X] T065 [P] [US6] Test de integración `tests/integration/profile.test.ts`: actualización de los datos; teléfono y código postal inválidos sin cambios parciales; regla de código postal y localidad; `changePassword` con la actual correcta (otras sesiones borradas, la actual conservada, `password_changed`) e incorrecta (cuenta en `login_account`); y el correo, que no cambia aunque se envíe en el formulario.
- [X] T066 [P] [US6] Test e2e `tests/e2e/us6-profile.spec.ts` (también no-js): guardar los datos y ver el saludo nuevo en el resumen, errores junto al campo, cambio de contraseña con el aviso, correo en solo lectura y axe en `/mi-cuenta/datos`.
- [X] T067 [US6] `src/lib/account/profile.ts` con `processUpdateProfile` y `processChangePassword`.
- [X] T068 [P] [US6] `src/components/ProfileForm.tsx`, con nombre, apellidos, teléfono (`autocomplete="tel"`) y dirección (`street-address`, `postal-code`, `address-level2`, `address-level1`), y un formulario aparte para la contraseña (actual más `PasswordFields`).
- [X] T069 [US6] `src/app/mi-cuenta/datos/page.tsx` (correo en solo lectura, los formularios y el `Notice`) y `src/app/mi-cuenta/datos/actions.ts` (`updateProfile` y `changePassword`, con `requireCustomer()`).

---

## Phase 9: User Story 7 — Descargar mis datos y eliminar mi cuenta (P2)

**Goal**: la portabilidad en JSON y el borrado inmediato y definitivo.

**Independent Test**: descargar el JSON y compararlo con la base de datos; eliminar la cuenta y
comprobar que no se puede entrar, que los enlaces anteriores no sirven y que el correo queda libre.

- [X] T070 [P] [US7] Test unitario `tests/unit/account-export.test.ts`: la forma `format_version: 1` de contracts/export-format.md, sin ids, sin hash y sin tokens.
- [X] T071 [P] [US7] Test de integración `tests/integration/export.test.ts` (SC-008): el JSON tiene todas las columnas de usuario de `customers` y `pets`, los consentimientos y ningún dato de otra cuenta. La ruta rechaza un `Origin` ajeno y la falta de sesión.
- [X] T072 [P] [US7] Test de integración `tests/integration/delete-account.test.ts`:
  - contraseña incorrecta, sin cambios y apuntada en `login_account`;
  - borrado correcto, con cero filas en `customers`, `pets`, `customer_sessions`, `account_tokens` y `customer_consents`;
  - `account_deleted` enviado con `customer_id = NULL`;
  - enlaces previos que no sirven;
  - nuevo registro con el mismo correo como cuenta limpia.
- [X] T073 [P] [US7] Test e2e `tests/e2e/us7-export-delete.spec.ts` (también no-js): la descarga con `Content-Disposition`; la eliminación con la contraseña lleva a la portada con el aviso; después, `/mi-cuenta` pide iniciar sesión y el inicio de sesión da el error genérico; axe en `/mi-cuenta/eliminar-cuenta`.
- [X] T074 [P] [US7] `src/domain/account-export.ts` con `buildAccountExport(data, now)`, que construye el objeto del contrato.
- [X] T075 [US7] `src/app/api/account/export/route.ts` (POST): comprueba `Origin` y `Sec-Fetch-Site` como `src/app/api/consent/route.ts`, usa `requireCustomer()` (o 303 a iniciar sesión), lee los datos, devuelve el JSON con `attachment` y `no-store`, y registra `data_exported`. Añadir el formulario "Descargar mis datos" en `src/app/mi-cuenta/datos/page.tsx`.
- [X] T076 [P] [US7] Plantilla `src/email/templates/account-deleted.ts` y su test.
- [X] T077 [US7] `src/lib/account/delete-account.ts` con `processDeleteAccount(form, customer)` según A12: una transacción con la verificación, la cola del correo y el `DELETE`, y después el envío inmediato.
- [X] T078 [US7] `src/app/mi-cuenta/eliminar-cuenta/page.tsx` (qué se borra, que no se puede deshacer, la contraseña y el botón `.btn` "Eliminar mi cuenta") y `actions.ts` (`deleteAccount`), que borra la cookie y redirige a `/?aviso=cuenta-eliminada`. Enlazar desde `/mi-cuenta/datos`.

---

## Phase 10: User Story 8 — Preferencia de consejos y novedades (P3)

**Goal**: guardar la preferencia al registrarse y cambiarla después.

**Independent Test**: registrarse con la casilla marcada y sin ella, y cambiarla en "Datos
personales".

- [X] T079 [P] [US8] Test de integración `tests/integration/marketing.test.ts`: el registro con la casilla crea `marketing_opt_in = true` y su consentimiento; `updateMarketing` solo registra un consentimiento si el valor cambia y actualiza `marketing_opt_in_changed_at`.
- [X] T080 [P] [US8] Test e2e `tests/e2e/us8-marketing.spec.ts`: la casilla desmarcada por defecto y separada; el estado reflejado en "Datos personales"; desactivarla y guardar.
- [X] T081 [US8] `processUpdateMarketing` en `src/lib/account/profile.ts`, la acción `updateMarketing` en `src/app/mi-cuenta/datos/actions.ts` y el formulario de la preferencia en `src/app/mi-cuenta/datos/page.tsx`.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [X] T082 Ampliar `src/db/retention.ts` (`purgeExpired`) con las purgas de A13 (cuentas sin verificar de más de 7 días, sesiones y tokens caducados, `processed_submissions` y bandeja de cuenta de más de 24 h). Test en `tests/integration/retention-accounts.test.ts`.
- [X] T083 [P] Añadir las rutas nuevas a `tests/e2e/a11y-all-routes.spec.ts`. Las privadas se recorren con `loginAs`.
- [X] T084 [P] Ampliar `tests/e2e/security-headers.spec.ts` con `no-store`, `noindex` y la CSP en las rutas nuevas, y comprobar que `pc_session` es `HttpOnly`, `Secure` (salvo en http local) y `SameSite=Lax`.
- [X] T085 [P] Test `tests/unit/no-pii-logs.test.ts`, que recorre las llamadas al logger en `src/lib/account/` y `src/lib/auth/` y falla si se registran campos `email`, `first_name`, `last_name`, `phone`, `password`, `name` o `token` (FR-037).
- [X] T086 [P] Ampliar `tests/unit/no-design-copy.test.ts` para que falle si aparecen en `src/` o en `content/` los textos de ejemplo de `design/cuenta.html`, `login.html` y `registro.html` ("Hola, María", "Toby", "Luna" o "#1042").
- [X] T087 [P] Actualizar `.env.example` (sin variables nuevas obligatorias; documentar que `SITE_URL` se usa en los enlaces de los correos) y `deploy/README.md` (migración `0001`, recarga del contenido y purgas en el temporizador existente).
- [X] T088 [P] Test e2e `tests/e2e/account-keyboard.spec.ts` en escritorio y no-js (SC-007, principio V): con **solo el teclado** (`Tab`, `Shift+Tab`, `Enter` y `Space`, sin `click`), hacer el registro, la confirmación del correo, el inicio de sesión con "Recordarme", el alta de una mascota, su eliminación y la eliminación de la cuenta. Comprobar el foco visible en cada paso y el foco en el resumen de errores tras un envío inválido.
- [X] T089 Ejecutar [quickstart.md](./quickstart.md) completo, con y sin JavaScript, y después `npm run lint`, `npm test`, `npm run test:integration` y `npm run test:e2e`. Marcar en `specs/002-client-accounts-pets/checklists/requirements.md` cualquier desviación encontrada.

---

## Dependencies & Execution Order

### Fases

- **Setup (F1)** no tiene dependencias.
- **Foundational (F2)** depende de F1 y **bloquea** todas las historias. Dentro de F2:
  - T004 y T005 van antes que T006;
  - T006 va antes que T007, T015–T017, T019–T021 y T025;
  - T014 va antes que T025.
- **Historias (F3–F10)**: todas dependen solo de F2, gracias a las fixtures T025 y T026.
- **Polish (F11)** va después de las historias que se quieran entregar.

### Dependencias reales entre historias

- **US2** necesita la acción `resendVerification` de US1 para el botón del estado `unverified`
  (T043). Si se hace antes que US1, el botón se deja enlazando a `/crear-cuenta/revisa-tu-correo`.
- **US4** completa la `mi-cuenta/page.tsx` de US2 (T047) y usa `PetCard` de US3 (T053).
- **US7** y **US8** añaden formularios a `/mi-cuenta/datos`, que crea US6 (T069). Si US6 aún no
  está, crean la página con solo su formulario.
- El resto de historias son independientes.

### Dentro de cada historia

Tests (que fallan) → consultas y dominio → `src/lib/account/*` → componentes → páginas y acciones.

## Parallel Examples

```text
# F2: en cuanto T006 está aplicada
T010 password-policy · T011 account-schemas · T012 rate-limit · T013 pet-age · T014 password · T018 notice · T022 styles · T023 PasswordFields

# US1: tests a la vez
T027 register.test · T028 verify-email.test · T029 email-templates · T030 us1-register.spec

# Con F2 terminada, en paralelo por personas o agentes
US1 (T027–T037) · US3 (T048–T057) · US5 (T060–T064)
```

## Implementation Strategy

1. **MVP** con F1, F2, US1 y US2. Es lo mínimo con valor real: crear la cuenta, verificarla,
   entrar y salir, con todos los tests del flujo crítico (principio III) en verde.
2. **+ US3**, mascotas: el valor principal para la clínica.
3. **+ US4, US6 y US5**: el área completa y la recuperación de contraseña.
4. **+ US7**: los derechos RGPD. Es **obligatoria** antes de desplegar en producción, porque la
   constitución exige la exportación y el borrado desde el área de cliente.
5. **+ US8 y Polish**: después, la validación del quickstart y la definición de "terminado".

## Notes

- Ninguna tarea añade datos de la clínica en `src/`. Las especies y los textos legales van en
  `content/petcare.yaml`.
- "Pedir cita", "Mis citas" y "Mis pedidos" pasan **siempre** por `sectionHref`, nunca por rutas
  escritas a mano.
- Los commits se hacen solo cuando el responsable lo pide.
