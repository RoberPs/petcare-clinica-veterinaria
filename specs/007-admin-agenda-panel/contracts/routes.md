# Contrato: rutas y Server Actions del panel (feature 007)

En todas las rutas de `/admin/*`:

- **Guardia**: el layout y cada acción llaman a `requireAdmin()` (F2). Sin sesión, se redirige a
  `/iniciar-sesion?return_to=<ruta>`. Con una sesión sin rol, sin verificar o con el rol retirado,
  la respuesta es un 404 igual que el de una ruta inexistente.
- **Cabeceras** (middleware): `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store`, y la
  misma CSP de siempre.
- **Formularios**: POST a una Server Action con un token de envío firmado. Responden con
  POST-Redirect-GET y un aviso por `?aviso=<clave>`. Los errores se muestran junto al campo con
  `aria-describedby`, y hay un resumen con `role="alert"`. Todo funciona sin JavaScript.

## Páginas

| Ruta | Contenido | Spec |
|---|---|---|
| `/admin` | Redirige a `/admin/agenda` | — |
| `/admin/agenda?vista=dia\|semana&fecha=&veterinario=&canceladas=1` | Agenda por veterinario (F16). Día: una columna por veterinario. Semana: de lunes a domingo por veterinario. Muestra bloqueos, tramos sin horario y las marcas "Fuera de horario" y "Servicio inactivo" | US2, FR-007–011 |
| `/admin/citas/[id]` | Detalle, contacto e historial (`appointment_events`) | FR-010 |
| `/admin/citas/[id]/cancelar` | Confirmación, con la nota opcional | FR-020 |
| `/admin/citas/[id]/mover?fecha=&veterinario=` | Selector de fecha y veterinario (GET) y franjas libres con `AdminRules` | FR-021 |
| `/admin/servicios` | Lista con duración, estado, orden, veterinarios y número de citas futuras | FR-012–014 |
| `/admin/servicios/nuevo`, `/admin/servicios/[id]` | Formulario del servicio | FR-012–014 |
| `/admin/veterinarios` | Lista con reservable, servicios y aviso "Sin horario: no recibe reservas" | FR-015, US3 esc. 8 |
| `/admin/veterinarios/nuevo`, `/admin/veterinarios/[id]` | Datos de agenda y servicios que atiende | FR-015 |
| `/admin/veterinarios/[id]/horario` | Rejilla semanal: 7 días × 3 tramos | FR-016, FR-019 |
| `/admin/bloqueos?desde=` | Bloqueos vigentes y futuros (los pasados, con `?pasados=1`) | US5 |
| `/admin/bloqueos/nuevo?…&revisar=1`, `/admin/bloqueos/[id]?…&revisar=1` | Formulario y revisión de las citas afectadas (F10) | FR-026–028 |

La ruta `/mi-cuenta` muestra el enlace "Panel de administración" solo si `is_admin`.

## Server Actions (`ADMIN_ACTIONS`)

| Acción | Entrada (Zod) | Efecto | Resultado |
|---|---|---|---|
| `cancelAppointmentAdmin` | `id`, `version`, `note?` (≤ 300) | `cancelAppointment` con actor `clinic`, sin plazo; crea un evento `admin` y encola un correo | `/admin/citas/[id]?aviso=cancelada`. Si la versión no coincide: `?aviso=cita-cambiada`. Si ya está cancelada o es pasada: `?aviso=no-modificable` |
| `moveAppointmentAdmin` | `id`, `version`, `date`, `time`, `staff_id` | `rescheduleAppointment` con `AdminRules`; crea un evento y encola un correo | `?aviso=movida`. Si la franja está ocupada (`slot_taken`), vuelve a `/mover` con la fecha y el veterinario elegidos y `?aviso=franja-ocupada` |
| `saveService` | `id?`, `name` (2–60, único), `duration_minutes` (5–480, múltiplo de 5), `active`, `position`, `staff_ids[]` | Upsert del servicio y de `booking_service_staff` y registro en el log de auditoría | `/admin/servicios?aviso=guardado`. Si afecta a citas futuras, `&afectadas=N`. Si ningún tramo admite la duración, `&sin-franjas=1` |
| `saveStaff` | `id?`, `name` (2–80), `bookable`, `booking_position`, `service_ids[]` | Upsert del miembro (si es nuevo, sin publicar) y registro en el log de auditoría | `/admin/veterinarios/[id]?aviso=guardado` |
| `saveStaffHours` | `staff_id`, `days[1..7][0..2] {opens, closes}` | Valida, borra y crea los tramos en una transacción y lo registra en el log de auditoría | `?aviso=guardado&afectadas=N&fuera-clinica=1` |
| `saveBlock` | `id?`, `submission_id`, `scope` (`staff` con `staff_id` o `clinic`), `kind`, campos del tipo, `reason`, `decision?` (`keep` o `cancel_all`), `affected_ids[]` | Vuelve a calcular las citas afectadas. Si no coinciden, se devuelve a revisar. Si `cancel_all`, cancela con correo. Guarda y lo registra en el log de auditoría | `/admin/agenda?fecha=<inicio>&aviso=bloqueo-guardado&canceladas-n=N` |
| `deleteBlock` | `id` | Borra el bloqueo y lo registra en el log de auditoría | `/admin/bloqueos?aviso=bloqueo-borrado` |

Reglas comunes:

- un reenvío con el mismo `submission_id` o con la misma `version` ya aplicada no repite nada ni
  envía otro correo (FR-023);
- los ids que no existen dan 404;
- un `staff_id` que no atiende el servicio de la cita se rechaza en el servidor.

## Cambios en rutas existentes

- `/pide-cita` y `/gestion-cita/*` no cambian de contrato. Las franjas salen de F7.
- `/mi-cuenta/citas/*` tampoco cambia. Al cancelar o cambiar se escribe un evento `customer`.
