# Contrato: rutas

## Reglas comunes

- Todas las rutas son dinámicas (dependen de la hora y de la ocupación).
- Llevan `noindex` y `Cache-Control: private, no-store`, salvo `/pide-cita` en los pasos 1 y 2:
  esos pasos son indexables y usan `no-store`.
- Funcionan sin JavaScript. Las acciones POST terminan en un 303 (PRG), con `?aviso=` cuando hay
  mensaje.
- Las fechas de la query van en formato `AAAA-MM-DD` y las horas en `HH:MM`, en la zona de la
  clínica.
- Si `reservas.href` es nulo, las rutas de esta feature responden 404 y los enlaces siguen yendo a
  `/proximamente/reservas`.

## Públicas

| Ruta | GET | POST (Server Action) | Comportamiento |
|---|---|---|---|
| `/pide-cita` | Pinta un paso según la query. Sin `servicio`, el paso 1. Con `servicio` y `profesional` pero sin `hora`, el paso 2 (fecha por defecto, el primer día con huecos). Con todo, el paso 3. Siempre se ve el resumen. Admite `?mascota=<id>` (cliente). | `confirmAppointment` → 303 a `/pide-cita/confirmada?ref=…` | Una query no válida (servicio, profesional o fecha) vuelve al paso que toca con el error junto al campo. Una hora ya ocupada al confirmar no redirige: vuelve a pintar el paso 3 con los datos, el aviso `hora-ocupada` y las horas libres actualizadas (forms.md). |
| `/pide-cita/confirmada?ref=` | Confirmación con servicio, profesional, mascota, fecha, hora y dirección si `ref` es válido y tiene menos de 2 h. Si no, un mensaje genérico de "cita confirmada, revisa tu correo". | — | `ref` manipulado: el mismo mensaje genérico, sin datos. |
| `/gestion-cita/[token]` | Datos de la cita y botones "Cancelar cita" y "Cambiar fecha u hora". | `clinicCancelAppointment` → 303 a la misma ruta con `?aviso=cita-cancelada` | Token no válido, versión antigua, cita cancelada o ya pasada: "Este enlace ya no es válido", sin datos. `Referrer-Policy: no-referrer`. |
| `/gestion-cita/[token]/cambiar` | Paso de fecha y hora (como el paso 2, con el servicio fijo) y selector de profesional. | `clinicRescheduleAppointment` → 303 a `/gestion-cita/<token nuevo>?aviso=cita-cambiada` | La franja ocupada vuelve con `?aviso=hora-ocupada`. |

## Privadas (`requireCustomer()`)

| Ruta | GET | POST (Server Action) | Comportamiento |
|---|---|---|---|
| `/mi-cuenta/citas` | Listas "Próximas" y "Anteriores", o el estado vacío con el enlace a "Pide cita". | — | Solo las citas con `customer_id` de la sesión. |
| `/mi-cuenta/citas/[id]/cancelar` | Confirmación con los datos de la cita. | `cancelOwnAppointment` → 303 a `/mi-cuenta/citas?aviso=cita-cancelada` | Cita ajena o inexistente: 404. Fuera de plazo: 303 con `?aviso=fuera-de-plazo`. |
| `/mi-cuenta/citas/[id]/cambiar` | Paso de fecha y hora con el servicio fijo (query `fecha`, `profesional`, `hora`). | `rescheduleOwnAppointment` → 303 a `/mi-cuenta/citas?aviso=cita-cambiada` | Las mismas reglas que cancelar. Una hora ocupada vuelve con `?aviso=hora-ocupada`. |
| `/mi-cuenta` | Añade el bloque "Tu próxima cita". | — | — |
| `/mi-cuenta/mascotas/[id]/eliminar` | Añade el aviso "Tiene N citas próximas que se cancelarán". | (existente) | Cancela las citas en la misma transacción (B12). |
| `/mi-cuenta/eliminar-cuenta` | Añade el aviso de las citas que se cancelarán. | (existente) | B12. |

## Enlaces que cambian

| Origen | Antes | Ahora |
|---|---|---|
| "Pide cita" en la cabecera, el pie, la portada, los tratamientos y la clínica | `/proximamente/reservas` | `sectionHref('reservas')` → `/pide-cita` (YAML) |
| "Mis citas" en `AccountNav` | `/proximamente/reservas` | `/mi-cuenta/citas` |
| "Pedir cita" en una mascota | `/proximamente/reservas` | `/pide-cita?mascota=<id>` |

## Avisos nuevos (`src/lib/notice.ts`)

`hora-ocupada`, `cita-cancelada`, `cita-cambiada`, `fuera-de-plazo`, `cita-no-disponible` y
`limite-citas`.
