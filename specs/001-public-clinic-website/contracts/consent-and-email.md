# Contrato: consentimiento de cookies y correos transaccionales

## `POST /api/consent`

Lo usan el aviso de cookies y `/cookies/configurar`. Funciona sin JavaScript.

- **Petición**: `application/x-www-form-urlencoded` con el campo `choice` (`accept` o `reject`) y
  el campo opcional `return_to`, una ruta relativa interna (se valida que empiece por `/` y no por
  `//`).
- **Comprobaciones**: `Origin` igual al host, o bien `Sec-Fetch-Site: same-origin`. Si no se
  cumple, se responde `403`.
- **Respuesta sin JavaScript**: `303` hacia `return_to`, o `/` si no se indica.
- **Respuesta con JavaScript** (cabecera `Accept: application/json`): `200 { thirdParty: boolean }`.
- **Cookie** `pc_consent`: `Path=/; Max-Age=31536000; SameSite=Lax; Secure; HttpOnly`. El valor es
  `base64url(JSON) + "." + HMAC` y el JSON tiene el formato `{ "v": "<CONSENT_VERSION>",
  "third_party": true|false, "at": "<ISO-8601>" }`.
- **Lectura**: si falta la cookie, la firma no es válida o `v` no coincide con `CONSENT_VERSION`,
  se trata como "sin elección": se muestra el aviso y no se carga ningún recurso de terceros.
- **Retirada**: un `choice=reject` posterior sobrescribe la cookie. El mapa deja de renderizarse
  en la siguiente navegación o, con JavaScript, al momento.

Categorías: `third_party`, que hoy cubre el mapa de OpenStreetMap. La cookie `pc_consent` es
esencial y se fija sin consentimiento, porque lo que guarda es la propia elección.

## Correos (Brevo, `POST https://api.brevo.com/v3/smtp/email`)

Remitente: `EMAIL_FROM` (un dominio verificado). Todos los textos van en español. Cada correo tiene
una versión en texto y otra en HTML sencillo, con todo el contenido escapado.

### `clinic_notification`

- **Para**: `clinic.inbox_email`. **Reply-To**: el correo del visitante.
- **Asunto**: `[Web] <motivo> — <nombre>`.
- **Cuerpo**: nombre, teléfono (o "no indicado"), correo, motivo, el mensaje literal y la fecha y
  hora del envío en `Europe/Madrid`. Al pie, "Mensaje recibido desde el formulario de contacto de
  <clinic.name>".

### `visitor_ack`

- **Para**: el correo del visitante.
- **Asunto**: `Hemos recibido tu mensaje — <clinic.name>`.
- **Cuerpo**: un saludo con el nombre, "Hemos recibido tu mensaje y te responderemos
  <response_time_text>", el teléfono y el horario, y un enlace a la política de privacidad.
  **No incluye** el texto del mensaje ni el motivo (FR-025a).
- Si `demo_banner_enabled` está activado, se añade el párrafo: "Esta es una web de demostración:
  <clinic.name> es una clínica ficticia." (FR-025b).

### Respuestas del proveedor

| Respuesta de Brevo | Efecto en `email_outbox` |
|---|---|
| `201` | `sent`, más `provider_message_id` y `sent_at` |
| `429` o `5xx` o error de red o tiempo de espera de 10 s | `attempts + 1` y, si quedan intentos, `next_attempt_at` según el backoff; si no, `failed` |
| `400`, `401` o `403` | `failed` inmediato y log de error (configuración incorrecta) |
