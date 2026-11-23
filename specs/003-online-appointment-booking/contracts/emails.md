# Contrato: correos de cita

## Reglas comunes

- Se encolan en `email_outbox` con el payload ya renderizado (A8), con `appointment_id`, en la
  misma transacción que el cambio de la cita. Hay un intento inmediato con `after()` y luego
  reintentos con `email:dispatch`.
- Usan la maqueta de `account-layout.ts`: nombre de la clínica, aviso de demo si está activo y
  pie con dirección y teléfono. Llevan versión HTML y de texto, todo escapado.
- Las fechas van en formato largo español (`formatLongDate`) y la hora en `HH:MM`, en la zona de
  la clínica.
- Los correos al responsable **no incluyen el motivo**. En los logs solo aparecen el id del correo,
  el id de la cita y el código de error.

| kind | Destinatario | Asunto | Contenido |
|---|---|---|---|
| `appointment_confirmed` (invitado) | `contact_email` | "Tu cita en {clínica} está confirmada" | Servicio, profesional, mascota, fecha, hora y dirección. **"Para cancelar o cambiar la cita, llámanos al {teléfono}, a ser posible con {24} horas de antelación."** Si el correo tiene cuenta (sin decirlo en pantalla), añade: "La próxima vez, inicia sesión para ver tus citas en tu cuenta." |
| `appointment_confirmed` (cliente) | `contact_email` | igual | Lo mismo, pero con "Puedes cancelarla o cambiarla desde Mis citas hasta {24} horas antes" y el enlace a `/mi-cuenta/citas`. Fuera de ese plazo, el teléfono. |
| `appointment_changed` | `contact_email` | "Hemos cambiado tu cita en {clínica}" | Fecha y hora anteriores y nuevas, el profesional y las mismas instrucciones que la confirmación. |
| `appointment_cancelled` | `contact_email` | "Tu cita en {clínica} se ha cancelado" | Los datos de la cita. Si la ha cancelado la clínica: "La clínica ha cancelado esta cita"; si la ha cancelado el cliente: "Has cancelado esta cita". Enlace a "Pide cita". No se envía cuando cancela `system` (eliminación de la cuenta). |
| `appointment_reminder` | `contact_email` | "Recordatorio: tu cita en {clínica} es el {día} a las {hora}" | Servicio, profesional, mascota, fecha, hora y dirección, con las mismas instrucciones para cancelar o cambiar que la confirmación (variante de invitado o de cliente). Lo encola `enqueueDueReminders` `reminder_hours_before` horas antes (B17); no se envía si la cita está cancelada ni si se reservó con menos antelación. |
| `clinic_appointment` | `clinic.inbox_email` | "Cita {nueva \| cambiada \| cancelada}: {fecha} {hora}, {servicio}" | Todos los datos, con el motivo y el tipo (invitado o cliente). En "nueva" y "cambiada", el **enlace de gestión** `/gestion-cita/<token>` con el texto "Úsalo solo para atender a quien llame; no lo reenvíes". En "cancelada", indica quién la ha cancelado. |

La "segunda línea" del correo de invitado no revela nada en pantalla, porque el correo solo lo lee
el titular del buzón.
