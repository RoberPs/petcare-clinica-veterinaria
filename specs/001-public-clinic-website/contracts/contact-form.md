# Contrato: formulario de contacto (Server Action `submitContact`)

Se invoca desde `<form action={submitContact} method="post">` en `/contacto`. Sin JavaScript es un
POST de formulario normal; con JavaScript usa `useActionState`. Next.js comprueba `Origin` frente
al host (CSRF).

## Campos (FormData)

| Nombre | Obligatorio | Validación (servidor = autoridad) | Mensaje de error (es-ES) |
|---|---|---|---|
| `nombre` | sí | Recortado, de 1 a 100 caracteres | "Escribe tu nombre." |
| `telefono` | no | Vacío, o hasta 20 caracteres con `[0-9 +()]` y entre 9 y 15 dígitos | "Revisa el teléfono: usa solo números, espacios y +." |
| `email` | sí | Hasta 254 caracteres y con formato `local@dominio.tld` | "Escribe un correo válido, por ejemplo nombre@correo.es." |
| `motivo` | sí | `slug` de un `contact_reasons` existente | "Elige un motivo." |
| `mensaje` | sí | Recortado, de 10 a 2.000 caracteres | "Escribe tu mensaje (mínimo 10 caracteres)." o "El mensaje no puede superar los 2.000 caracteres." |
| `privacidad` | sí | Valor `on` | "Para enviar el mensaje tienes que aceptar la política de privacidad." |
| `submission_token` | sí | HMAC válido, con una antigüedad de 3 s como mínimo y 24 h como máximo | (no se muestra un error de campo; ver los resultados) |
| `web` | — | **Campo trampa**: tiene que llegar vacío | (descarte silencioso) |

## Resultados

```ts
type ContactResult =
  | { status: 'ok'; responseTimeText: string }            // también en reenvíos del mismo submission_id
  | { status: 'invalid'; fieldErrors: Record<Field, string>; values: Partial<Record<Field, string>> }
  | { status: 'rate_limited'; phone: string }              // "Has enviado varios mensajes seguidos. Llámanos al …"
  | { status: 'expired' }                                  // token caducado o manipulado: "La página ha caducado. Revisa tus datos y vuelve a enviar."
  | { status: 'error'; phone: string }                     // no se pudo registrar: "No hemos podido enviar tu mensaje. Inténtalo de nuevo o llámanos al …"
```

- `invalid`: devuelve los valores escritos (excepto el token) para volver a pintarlos (FR-024). La
  interfaz muestra un resumen con `role="alert"` y el error de cada campo con `aria-describedby`, y
  pone el foco en el primer campo con error.
- Campo trampa relleno o envío en menos de 3 s: se devuelve `ok` sin persistir nada.
- Sin JavaScript, un `ok` hace `redirect('/contacto/enviado')` (PRG).

## Efectos de un `ok` real (una sola transacción)

1. Se inserta en `contact_messages`. Si hay conflicto en `submission_id`, no se hace nada y se
   devuelve `ok`, que es la idempotencia de FR-026.
2. Se inserta en `email_outbox` el registro `clinic_notification` con estado `pending`.
3. Se inserta en `email_outbox` el registro `visitor_ack`: con estado `pending` si no ha habido un
   acuse al mismo `recipient_hash` en la última hora, y con estado `skipped_rate_limit` si lo ha
   habido.
4. Se inserta un registro en `rate_limit_hits`.
5. Tras el commit, se intenta enviar sin bloquear la respuesta. Los fallos quedan para
   `email:dispatch` (R7).

El límite por origen (5 envíos cada 10 minutos por IP o por prefijo /64) se comprueba **antes**
del paso 1.
