# Research: Cuentas de cliente y mascotas

Las decisiones de la feature 001 (R1–R17) siguen vigentes. Aquí van solo las nuevas, con el
prefijo **A** para no confundirlas con las de la 001.

## A1. Hash de contraseñas

- **Decision**: **Argon2id** con `@node-rs/argon2`, con los parámetros mínimos de OWASP:
  `memoryCost=19456` KiB, `timeCost=2` y `parallelism=1`. El hash se guarda en formato PHC, que
  incluye la sal y los parámetros, de modo que se pueden subir más adelante sin migrar.
  - Al iniciar sesión con un correo que no existe se verifica contra un **hash ficticio**, para
    que el tiempo de respuesta no revele si la cuenta existe.
  - Si los parámetros del hash guardado son más bajos que los actuales, el hash se rehace al
    iniciar sesión.
- **Rationale**: la constitución pide Argon2id o bcrypt. Esta librería trae binarios
  precompilados (también para Alpine) y no necesita node-gyp en la imagen.
- **Alternatives considered**: `argon2`, que compila con node-gyp y complica el Dockerfile;
  `bcrypt`, con su límite de 72 bytes; y `crypto.scrypt`, que no tiene dependencias pero no es la
  opción recomendada por la constitución.

## A2. Sesiones

- **Decision**: sesiones propias guardadas en la base de datos.
  - Al iniciar sesión se generan 32 bytes aleatorios, que van en la cookie `pc_session` en
    base64url. En `customer_sessions` solo se guarda su **SHA-256**.
  - La cookie es `HttpOnly`, `Secure` (salvo en el desarrollo con http), `SameSite=Lax` y
    `Path=/`.
  - **Sin "Recordarme"**: la cookie no lleva `Max-Age`, así que se borra al cerrar el navegador.
    Además, en el servidor la sesión caduca tras **2 h sin actividad**, con un tope absoluto de
    12 h.
  - **Con "Recordarme"**: `Max-Age` de 30 días y caducidad absoluta a los 30 días. La inactividad
    no la cierra.
  - `last_seen_at` se actualiza como mucho una vez por minuto, para no escribir en cada petición.
  - **Rotación**: cada inicio de sesión crea una sesión nueva. Cambiar o recuperar la contraseña
    borra todas las demás sesiones de la cuenta, y eliminar la cuenta las borra todas (FR-016).
  - **Cerrar sesión** es un POST (Server Action) que borra la fila y la cookie, y redirige a
    `/?aviso=sesion-cerrada`.
- **Rationale**: FR-012 y FR-016 exigen poder invalidar sesiones en el servidor, y una sesión
  opaca es lo más simple que lo cumple.
- **Alternatives considered**: JWT sin estado (no se puede revocar sin una lista negra), Auth.js
  (su proveedor de credenciales está desaconsejado y añade una capa que no se necesita) y Lucia
  (abandonada en favor de implementarlo uno mismo).

## A3. Protección de las páginas privadas

- **Decision**:
  - `requireCustomer()` lee la cookie, busca la sesión vigente y devuelve el cliente. Si no hay
    sesión, redirige a `/iniciar-sesion?return_to=<ruta>`, con `isSafeReturnTo` de la 001.
  - La llaman `mi-cuenta/layout.tsx`, **cada** Server Action del área y la ruta de descarga. El
    layout no basta por sí solo, porque las acciones se pueden invocar directamente.
  - No se usa el middleware para la autorización: solo valida la CSP, como ahora.
- **Caché** (FR-013): las rutas privadas y las de autenticación responden con
  `Cache-Control: private, no-store`, fijado en `next.config.ts` `headers()` y ya implícito en las
  páginas dinámicas. Así el navegador no las guarda y "atrás" tras cerrar sesión vuelve a pedirlas
  al servidor, que redirige. Un test de extremo a extremo (`account-no-cache`) lo comprueba.
- **Indexación** (FR-045): `robots: { index: false }` en todas estas rutas, y `/mi-cuenta` se
  añade al `disallow` de `robots.ts`.

## A4. Enlaces de un solo uso

- **Decision**: tabla `account_tokens` con el propósito (`verify_email` o `reset_password`), el
  SHA-256 del token, la caducidad y la fecha de uso.
  - El token son 32 bytes aleatorios en base64url y va en el parámetro `?token=` del enlace.
  - Emitir un token nuevo **borra** los vigentes de la misma cuenta y propósito (FR-006, FR-019).
  - **Se consumen con un POST**. La página del enlace (GET) solo comprueba que el token es válido
    y muestra un botón ("Confirmar mi correo") o el formulario de la nueva contraseña. Así, los
    escáneres de enlaces de los correos, que hacen GET, no gastan el enlace.
  - Si un enlace de verificación llega cuando la cuenta ya está verificada, se muestra "Tu correo
    ya está verificado" con el enlace a "Iniciar sesión", en vez de un error.
  - Caducidad: 24 h para la verificación y 1 h para la recuperación.
  - La recuperación marca también la cuenta como verificada (FR-021).
  - Tras la verificación, la redirección es a `/iniciar-sesion?aviso=correo-verificado`
    (Clarifications). El correo se rellena desde una cookie firmada `pc_login_hint` (`HttpOnly`,
    10 minutos, `Path=/iniciar-sesion`) que pone la acción de verificar y borra la de iniciar
    sesión. No va en la URL, para que no aparezca en los logs de acceso.
- **Riesgo aceptado**: el token aparece en el log de acceso de Caddy. Los tokens son de un solo
  uso y de vida corta, y la `Referrer-Policy` impide que salga en el `Referer`.
- **Alternatives considered**: consumir el enlace con el GET (lo gastan los escáneres de correo) y
  firmar el token con HMAC sin guardarlo (no se puede invalidar ni marcar como usado).

## A5. Registro sin revelar si el correo existe

- **Decision**:
  - El correo se normaliza con `trim().toLowerCase()` y tiene una restricción `UNIQUE` sobre
    `email_normalized`.
  - El alta hace `INSERT … ON CONFLICT DO NOTHING`:
    - Si la fila se crea, se encola `verify_email`.
    - Si ya existía y está verificada, se encola `account_exists`.
    - Si ya existía sin verificar, se emite un token nuevo y se encola `verify_email`.
  - Todo va en una sola transacción, y la respuesta es siempre la redirección a
    `/crear-cuenta/revisa-tu-correo`.
  - Para que el tiempo de respuesta no delate si el correo existía, el hash Argon2id se calcula
    siempre, se cree o no la fila.
- **Idempotencia** (edge case de doble envío): se reutiliza `createSubmissionToken()` de la 001.
  Una tabla `processed_submissions(submission_id PK, scope, created_at)` registra cada envío del
  registro y del alta de mascota en la misma transacción. Un reenvío con el mismo id devuelve la
  misma redirección sin repetir efectos. Las filas se purgan a las 24 h.

## A6. Límites de intentos

- **Decision**: se reutiliza `rate_limit_hits`, que guarda el bucket como HMAC y nunca la IP ni el
  correo en claro. `src/domain/rate-limit.ts` pasa a tener **políticas con nombre**:

  | Política | Clave | Límite |
  |---|---|---|
  | `contact` (sin cambios) | IP o /64 | 5 / 10 min |
  | `login_account` | correo normalizado | 5 fallos / 15 min |
  | `login_origin` | IP o /64 | 20 fallos / 15 min |
  | `auth_origin` | IP o /64 | 10 / 10 min (registro, reenvío de verificación y recuperación) |

  - Solo se apunta un intento en `login_*` cuando **falla**. Un acceso correcto no borra los fallos
    anteriores: caducan por tiempo.
  - Al bloquear se calcula cuándo vuelve a haber hueco (el fallo más antiguo de la ventana más la
    duración de la ventana) y se muestra "Vuelve a intentarlo en N minutos".
  - Los **correos** por dirección (3 por tipo y hora, FR-033) se limitan contando en
    `email_outbox` por `recipient_hash` y `kind`, igual que el acuse de la 001. Si se supera el
    límite, el correo no se encola, pero la respuesta al usuario es la misma.
- **Rationale**: reutiliza la infraestructura ya probada. El bloqueo por cuenta se aplica también
  a correos que no existen, de modo que no sirve para averiguar cuáles tienen cuenta.

## A7. Política de contraseñas

- **Decision**:
  - Entre 10 y 128 caracteres, sin reglas de composición (NIST SP 800-63B).
  - Se rechaza si está en una lista de 10.000 contraseñas comunes (SecLists, licencia MIT),
    generada como `src/domain/common-passwords.ts` mediante un script; la comparación ignora
    mayúsculas.
  - Se rechaza si contiene la parte local del correo.
  - Se aplica en el registro, el restablecimiento y el cambio de contraseña. Los mensajes de error
    explican el requisito concreto que falla.
- **Alternatives considered**: la API de HIBP, rechazada porque es un recurso de terceros y la
  constitución pide minimizar esas llamadas.

## A8. Correos de cuenta y bandeja de salida

- **Decision**: se generaliza `email_outbox` en lugar de crear una bandeja paralela:
  - `contact_message_id` pasa a admitir nulos y se añaden `payload jsonb` (`to`, `subject`,
    `html` y `text` ya renderizados) y `customer_id` (nulo con `ON DELETE SET NULL`).
  - Una restricción `CHECK` exige que haya mensaje de contacto o payload.
  - `outbox_kind` gana `verify_email`, `account_exists`, `password_reset`, `password_changed` y
    `account_deleted`.
  - `dispatch.ts`: si la fila tiene payload lo envía tal cual, y **pone el payload a NULL** al
    pasar a `sent` o `failed`. Así el enlace con el token y la dirección de correo no se quedan
    guardados.
  - Los reintentos son los mismos de la 001: 8 intentos en unas 24 h. Hay un intento inmediato
    con `after()`.
  - El correo `account_deleted` se encola **antes** de borrar la cuenta y en la misma
    transacción. Gracias a `ON DELETE SET NULL` sobrevive al borrado del cliente.
- **Rationale**: los tokens solo se guardan como hash en `account_tokens`, así que el enlace no se
  puede reconstruir al despachar. Por eso el correo se renderiza al encolarlo. Las filas de cuenta
  enviadas se purgan a las 24 h (A13).
- **Contenido**: solo el nombre del cliente y el enlace o aviso. Nunca la contraseña ni datos de
  mascotas. Cada correo incluye el aviso de demostración si está activado (contrato en
  [contracts/emails.md](contracts/emails.md)).

## A9. Autorización de recursos (IDOR)

- **Decision**: todas las consultas de mascotas llevan `WHERE id = $1 AND customer_id = $session`.
  Si no hay fila, se responde con `notFound()`, igual que si la mascota no existiera.
  - El identificador de la mascota es un UUID v4, que no es enumerable.
  - Los intentos sobre un id ajeno se registran como `pet_access_denied`, con el `customer_id`
    pero sin datos personales.
  - Las consultas de mascotas solo aceptan el `customerId` que devuelve `requireCustomer()`; nunca
    lo leen del formulario.
- **Límite de 30 mascotas**: se comprueba dentro de la transacción del alta, con
  `SELECT … FOR UPDATE` sobre la fila del cliente, para evitar carreras.

## A10. Especies y edad

- **Decision**:
  - Hay una tabla `species(key, label, sort_order)` que se carga desde el YAML (nueva clave
    `species`).
  - `pets.species_key` admite nulos y es FK con `ON DELETE SET NULL`. El valor nulo significa
    "Otra", una etiqueta genérica de la interfaz, no un dato de la clínica.
  - `content:load` hace upsert de las especies y borra las que ya no aparecen. Las mascotas de una
    especie borrada pasan a "Otra", lo que se avisa en la salida del comando.
  - **Edad** (`pet-age.ts`): `Temporal.PlainDate` de hoy en `Europe/Madrid`, con
    `since(birth, {largestUnit:'years'})`:
    - 1 año o más: "N año(s)".
    - Menos de 1 año: "N mes(es)".
    - Menos de 1 mes: "Menos de 1 mes".
    - Los nacidos el 29 de febrero cumplen el 28 de febrero en los años no bisiestos (el
      comportamiento por defecto de Temporal).
  - Validación de la fecha: entre hoy menos 40 años y hoy.
- **Icono**: `PetIcon` tiene iconos SVG propios para las claves conocidas y uno genérico para el
  resto. No se usan los emojis de las maquetas.

## A11. Descarga de datos

- **Decision**:
  - Un formulario hace POST a `/api/account/export`, que funciona sin JavaScript y comprueba
    `Origin` y `Sec-Fetch-Site` como `/api/consent`.
  - La respuesta es `application/json; charset=utf-8` con
    `Content-Disposition: attachment; filename="mis-datos-<AAAA-MM-DD>.json"` y `no-store`.
  - Contenido: la cuenta, la dirección, la preferencia de comunicaciones, los consentimientos y
    las mascotas (con la etiqueta de especie y la edad en la fecha de exportación).
  - No incluye el hash de la contraseña, las sesiones ni los tokens: son datos de seguridad
    derivados, no aportados por el usuario.
  - La forma exacta está en [contracts/export-format.md](contracts/export-format.md), con
    `format_version: 1`.

## A12. Eliminación de la cuenta

- **Decision**: una página de confirmación explica qué se borra y pide la contraseña. Al
  confirmar, una sola transacción:
  1. verifica la contraseña;
  2. encola `account_deleted` (con payload y `customer_id`);
  3. hace `DELETE FROM customers`, que por cascada borra `pets`, `customer_sessions`,
     `account_tokens` y `customer_consents`, y deja a nulo el `customer_id` de `email_outbox`.

  Después se borra la cookie y se redirige a `/?aviso=cuenta-eliminada`. Si la contraseña es
  incorrecta, cuenta como intento fallido en `login_account`.
- **Rationale**: es la decisión de Clarifications (borrado inmediato). La cascada garantiza que no
  queda ningún dato personal accesible.

## A13. Conservación y purgas

`retention:purge` (diario, en el mismo temporizador de la 001) añade estas purgas:

| Qué | Cuándo |
|---|---|
| `customers` sin verificar | 7 días desde el alta (FR-008), con todo lo que cuelga de ellos por cascada |
| `customer_sessions` | caducadas (absoluta o por inactividad) |
| `account_tokens` | caducados o usados hace más de 24 h |
| `processed_submissions` | más de 24 h |
| `email_outbox` de cuenta (con `contact_message_id` nulo) | `sent` o `failed` hace más de 24 h |

## A14. Avisos tras redirigir

- **Decision**: no hay mensajes flash en cookie, porque los Server Components no pueden borrar
  cookies al renderizar. Las redirecciones llevan `?aviso=<codigo>`, y `src/lib/notice.ts`
  traduce cada código a un texto fijo. Los códigos son: `enlace-reenviado`, `correo-verificado`,
  `sesion-cerrada`, `mascota-anadida`, `mascota-guardada`, `mascota-eliminada`, `datos-guardados`,
  `contrasena-cambiada`, `contrasena-restablecida` y `cuenta-eliminada`.
  - Un código desconocido se ignora.
  - El aviso se muestra en una región `role="status"`.
  - Nunca llevan datos del usuario.
- **Alternatives considered**: una cookie flash firmada, rechazada porque necesitaría un route
  handler o un middleware que la borre, con más piezas para el mismo resultado.
