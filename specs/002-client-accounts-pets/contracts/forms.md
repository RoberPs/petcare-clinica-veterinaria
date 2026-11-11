# Contrato: formularios y acciones

Reglas comunes a todos los formularios:

- Cada formulario es un Server Action. Con JavaScript usa `useActionState` y, sin él, hace
  POST-Redirect-GET.
- La validación está en `src/domain/account-schemas.ts` (Zod). Ante un error se devuelve
  `{status:'invalid', fieldErrors, values}`: los valores se conservan, **salvo las contraseñas**,
  que nunca se devuelven. El resumen de errores recibe el foco, y cada campo lleva
  `aria-invalid` y `aria-describedby` hacia su error.
- La protección CSRF es la comprobación de Origin de los Server Actions más la cookie
  `SameSite=Lax`.
- Todos los resultados de las acciones están en `src/lib/account/*`:
  `ok | invalid | rate_limited(retryMinutes) | expired | not_found | error`.

## Campos y validación

| Campo | `name` | Regla | Mensaje (ejemplo) |
|---|---|---|---|
| Nombre | `first_name` | 1–80 caracteres tras `trim` | "Escribe tu nombre." |
| Apellidos | `last_name` | 1–80 | "Escribe tus apellidos." |
| Correo | `email` | formato pragmático, ≤254 | "Escribe un correo válido, por ejemplo nombre@dominio.es." |
| Teléfono (opcional) | `phone` | tras quitar espacios, puntos y guiones: `^\+?\d{9,15}$` | "Escribe un teléfono válido, por ejemplo 600 123 456." |
| Contraseña | `password` | A7: 10–128, no común, sin la parte local del correo | "Usa al menos 10 caracteres." / "Esa contraseña es muy común; elige otra." |
| Repetir | `password_confirm` | igual a `password` | "Las contraseñas no coinciden." |
| Privacidad y términos | `accept_terms` | obligatorio (`on`) | "Para crear la cuenta debes aceptar la política de privacidad y los términos." |
| Consejos y novedades | `marketing_opt_in` | opcional; desmarcado por defecto | — |
| Recordarme | `remember` | opcional | — |
| Contraseña actual | `current_password` | no vacía; se verifica | "La contraseña actual no es correcta." |
| Mascota: nombre | `name` | 1–40 | "Escribe el nombre de tu mascota." |
| Mascota: especie | `species` | una `species.key` existente u `other` | "Elige una especie." |
| Mascota: nacimiento | `birth_date` | `AAAA-MM-DD` (`<input type="date">`), entre hoy menos 40 años y hoy, en Europe/Madrid | "La fecha no puede ser futura." Pista: "Si no la sabes con exactitud, pon una aproximada." |
| Dirección | `address_line`, `postal_code`, `city`, `province` | opcionales; CP `^\d{5}$`; CP y localidad juntos | "Escribe un código postal de 5 cifras." |

## Acciones

| Acción | Campos | Efectos (en una transacción) | Resultados visibles |
|---|---|---|---|
| `register` | nombre, apellidos, correo, teléfono, contraseña ×2, `accept_terms`, `marketing_opt_in`, `submission_id` | A5: alta o aviso, consentimiento `privacy_terms` (+ `marketing_opt_in`), token, correo a la bandeja e idempotencia | Siempre "revisa tu correo". `rate_limited` (auth_origin) muestra un mensaje con los minutos |
| `resendVerification` | correo | Si existe sin verificar: token nuevo y correo (con el límite de 3 por hora) | Siempre el mismo aviso |
| `verifyEmail` | `token` | Marca `email_verified_at`, consume el token y pone `pc_login_hint` | Va a iniciar sesión. Si el token caducó, a la página de enlace caducado |
| `login` | correo, contraseña, `remember`, `return_to` | A1, A2 y A6. Si la cuenta no está verificada, no crea la sesión | Error genérico; "verifica tu correo" con un botón de reenvío (solo si la contraseña es correcta); bloqueo con minutos |
| `requestReset` | correo | Si existe: token y correo `password_reset` (con el límite) | Siempre el aviso neutro |
| `resetPassword` | `token`, contraseña ×2 | Cambia el hash, consume el token, verifica la cuenta, borra todas las sesiones y encola `password_changed` | Va a iniciar sesión, o a la página de enlace caducado |
| `logout` | — | Borra la sesión y la cookie | Va a la portada con el aviso |
| `createPet` | nombre, especie, nacimiento, `submission_id` | Comprueba el límite de 30 (FOR UPDATE) e inserta | Va a la lista con el aviso; `limit_reached` |
| `updatePet` | `id`, nombre, especie, nacimiento | `UPDATE … WHERE id AND customer_id` | 404 si es ajena o no existe |
| `deletePet` | `id` | `DELETE … WHERE id AND customer_id` | 404 si es ajena o no existe |
| `updateProfile` | nombre, apellidos, teléfono, dirección | `UPDATE customers` | Aviso `datos-guardados` |
| `updateMarketing` | `marketing_opt_in` | Si cambia, actualiza la preferencia y registra el consentimiento `marketing_opt_in` u `opt_out` | Aviso `datos-guardados` |
| `changePassword` | actual, nueva ×2 | Verifica la actual (un fallo cuenta en `login_account`), cambia el hash, borra las demás sesiones y encola `password_changed` | Aviso `contrasena-cambiada` |
| `deleteAccount` | `current_password` | A12 | Va a la portada con el aviso; error junto al campo |

## Eventos de log (sin datos personales)

`account_registered`, `account_exists_notified`, `email_verified`, `login_succeeded`,
`login_failed`, `login_blocked`, `login_unverified`, `logout`, `password_reset_requested`,
`password_reset_completed`, `password_changed`, `pet_created`, `pet_updated`, `pet_deleted`,
`pet_access_denied`, `data_exported` y `account_deleted`.

Cada evento lleva como mucho `customer_id`, `pet_id` y `code`.
