# Contrato: correos al cliente por acciones del panel (feature 007)

No hay tipos de `outbox_kind` nuevos: se reutilizan las plantillas de la 003, pasan por la bandeja
de salida y se reintentan con `email:dispatch`.

| Acción | `kind` | Destinatario | Cambios en la plantilla |
|---|---|---|---|
| Cancelar desde el panel (también `cancel_all` de un bloqueo) | `appointment_cancelled` | Responsable (correo de la cuenta o del invitado) | `payload.cancelledBy = 'clinic'`. Texto: "La clínica ha cancelado tu cita". Bloque opcional "Mensaje de la clínica" con `clinicNote` escapado y sin Markdown. Enlace a pedir otra cita (`sectionHref('pide-cita')`) |
| Mover desde el panel | `appointment_changed` | Responsable | "La clínica ha cambiado tu cita": antes (fecha, hora y veterinario) y ahora. Se sigue enviando el aviso a la clínica que ya existía |

Reglas:

- **Asunto**: "Tu cita en {clinica} se ha cancelado" y "Tu cita en {clinica} ha cambiado". El
  nombre de la clínica sale de la base de datos.
- **Nota**: hasta 300 caracteres, en texto plano y escapada en HTML. No sale en los logs.
- **Recordatorio**: al mover, vuelve a quedar pendiente si la nueva hora lo requiere; al cancelar,
  no se envía (B*).
- **Fallo del proveedor**: la acción ya está hecha y el correo se reintenta 8 veces en unas 24
  horas.
- **Cita anonimizada o pasada**: no se puede cancelar ni mover, así que no genera correo.
