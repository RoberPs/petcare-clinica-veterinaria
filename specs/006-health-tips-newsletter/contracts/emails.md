# Contrato: correos del boletín (feature 006)

Pasan por la bandeja de salida (`enqueueEmail` + `sendEmailsNow` con `after()`), con los
reintentos de `email:dispatch`. Texto y HTML en español, con el aviso de demostración si
`demo_banner_enabled`.

## `newsletter_confirm`

- **Cuándo**: alta nueva desde el formulario, o reenvío a una fila `pending` cuyo último envío fue
  hace 1 hora o más (E9). Nunca a una suscripción confirmada ni a un cliente que se suscribe desde
  su cuenta.
- **Asunto**: `Confirma tu suscripción al boletín de {clinicName}`.
- **Contenido**:
  - saludo genérico (no hay nombre);
  - "Para recibir el boletín, confirma tu correo";
  - enlace `{SITE_URL}/boletin/confirmar?t={token}`;
  - "El enlace caduca el {fecha y hora, Europe/Madrid}. Si no lo pediste, ignora este correo: sin
    confirmar no te enviaremos nada y borraremos tu dirección en 30 días.";
  - enlace a la política del boletín;
  - pie con "Darme de baja": `{SITE_URL}/boletin/baja?t={unsubscribeToken}`.
- **Cabeceras** (campo nuevo `OutgoingEmail.headers`, E10):
  - `List-Unsubscribe: <{SITE_URL}/api/boletin/baja?t={unsubscribeToken}>`
  - `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
- No se copia nada que haya escrito el visitante salvo su dirección como destinatario.

## Cambios en la infraestructura de correo

- `OutgoingEmail` (`src/email/types.ts`) gana `headers?: Record<string, string>`, que se guarda en
  `payload` y que `brevo.ts` envía en el campo `headers` de la API. `fake.ts` lo conserva para que
  los tests lo comprueben.
- `newsletterFooter(ctx, unsubscribeToken)`: bloque de pie reutilizable para cualquier envío futuro
  del boletín (campañas fuera de alcance).
- Sin correos de "ya estabas suscrito" ni de despedida tras la baja.
