# Contrato: formularios

## Reglas comunes

- Los pasos 1 y 2 son formularios GET y no cambian nada. El resto son Server Actions con
  `useActionState` y PRG sin JavaScript (patrón de `src/app/contacto/actions.ts`).
- La validación usa Zod en `src/domain/booking-schemas.ts` ([data-model.md](../data-model.md#validación-zod-srcdomainbooking-schemasts)).
- CSRF: comprobación de Origin de los Server Actions y cookie `SameSite=Lax`.
- Errores: `{ status: 'invalid', fieldErrors, values }`, junto al campo con `aria-describedby` y un
  resumen enfocable. No se devuelve nada que no haya escrito el usuario.
- La lógica con efectos vive en `src/lib/booking/*` y devuelve un resultado discriminado:
  `ok | invalid | slot_taken | rate_limited(retryMinutes) | limit_reached | expired | not_found |
  out_of_window | error`.

## Paso 1: servicio y profesional (GET `/pide-cita`)

| Campo | name | Regla | Mensaje |
|---|---|---|---|
| Tipo de servicio | `servicio` | servicio reservable publicado | "Elige un servicio." |
| Veterinario/a | `profesional` | `sin-preferencia` o un profesional que atiende el servicio | "Elige un profesional de la lista." |

Sin JavaScript, al cambiar de servicio la lista de profesionales se filtra al recargar: el botón
"Continuar" vuelve al paso 1 si el profesional elegido no atiende el servicio nuevo.

## Paso 2: fecha y hora (GET `/pide-cita`)

| Campo | name | Regla | Mensaje |
|---|---|---|---|
| Fecha | `fecha` | `input type="date"` con `min`/`max`; entre hoy y el horizonte | "Elige una fecha entre hoy y el {fecha máxima}." |
| Hora | `hora` | radio de las horas libres (`fieldset` con `legend` "Horas disponibles") | "Elige una hora libre." |

"Ver horas" envía la fecha. Un día sin huecos muestra "No quedan horas libres el {día}" y un enlace
al siguiente día disponible.

## Paso 3: confirmar (`confirmAppointment`)

Campos ocultos: `servicio`, `profesional`, `fecha`, `hora`, `submission` (token firmado) y el
honeypot `web`.

| Campo | name | Invitado | Cliente | Mensaje |
|---|---|---|---|---|
| Mascota guardada | `mascota` | — | uuid propio u `otra` | "Elige una de tus mascotas." |
| Nombre de la mascota | `nombre_mascota` | obligatorio | si `otra` | "Escribe el nombre de tu mascota (hasta 40 caracteres)." |
| Especie | `especie` | obligatorio | si `otra` | "Elige la especie." |
| Fecha de nacimiento | `fecha_nacimiento` | — | si `otra` (regla de la 002) | (los de la 002) |
| Nombre y apellidos | `nombre` | obligatorio, `autocomplete="name"` | de la cuenta, solo lectura | "Escribe tu nombre y apellidos." |
| Teléfono | `telefono` | obligatorio, `autocomplete="tel"` | de la cuenta; obligatorio si no hay | "Escribe un teléfono de contacto válido." |
| Correo | `correo` | obligatorio, `autocomplete="email"` | de la cuenta, solo lectura | "Escribe un correo válido." |
| Motivo | `motivo` | opcional, ≤ 500, con el aviso de FR-010 | igual | "El motivo no puede pasar de 500 caracteres." |
| Privacidad | `privacidad` | obligatoria, nunca premarcada | igual | "Debes aceptar la política de privacidad." |

**Orden en el servidor**:

1. Honeypot.
2. Token (`expired` o `too_fast`).
3. `booking_origin`.
4. Zod.
5. Transacción:
   1. Bloqueo del día.
   2. Comprobar que la mascota es del cliente.
   3. Límite de citas activas.
   4. Recalcular la disponibilidad.
   5. Asignar el profesional (B4).
   6. Crear la mascota si es nueva.
   7. Insertar la cita (un duplicado de `submission_id` devuelve la existente).
   8. Encolar los correos.
6. `after()` para el envío.
7. 303.

| Resultado | Respuesta |
|---|---|
| `ok` | 303 a la confirmación |
| `slot_taken` | **Sin redirección.** Estado `slot_taken` con `values` del paso 3 y las horas recalculadas de esa fecha. La página vuelve a pintar el paso 3 con los datos escritos, el aviso `hora-ocupada` y un `SlotPicker` dentro del mismo formulario (radio `hora`). El visitante elige otra hora y confirma de nuevo, también sin JavaScript (B5). |
| `limit_reached` | aviso `limite-citas` con el teléfono de la clínica (3 citas por correo de invitado o 9 por cuenta, configurables) |
| `rate_limited` | "Has hecho varias reservas seguidas. Inténtalo en {n} minutos o llámanos al {teléfono}." |
| `expired` | "El formulario ha caducado. Revisa los datos y confirma de nuevo." (con un token nuevo) |
| `not_found` | la mascota no es suya: el mismo error que una mascota inexistente |

## Cancelar (`cancelOwnAppointment`, `clinicCancelAppointment`)

- Un solo botón: "Sí, cancelar la cita" (`.btn`, marino), junto al enlace "Volver".
- Campos ocultos: `cita` (id) o `token`.
- Resultados: `ok`, `out_of_window` (solo el cliente), `not_found` y `already_cancelled` (aviso
  `cita-no-disponible`).

## Cambiar (`rescheduleOwnAppointment`, `clinicRescheduleAppointment`)

- Campos: `fecha`, `profesional` y `hora`, más `cita` o `token`. Es el mismo paso 2 con el servicio
  fijo.
- Resultados: `ok`, `slot_taken`, `out_of_window`, `not_found` y `already_cancelled`.
- Si la hora elegida es la misma que ya tenía la cita, es un `ok` sin cambios y sin correo.
