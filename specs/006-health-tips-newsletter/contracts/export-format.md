# Contrato: exportación de la cuenta, versión 3 (amplía la de la 005)

`format_version` pasa de 2 a 3. Se añade `communications.newsletter`; `marketing_opt_in` y
`changed_at` (nombre de la v1) se mantienen por compatibilidad. El resto no cambia.

```json
{
  "format_version": 3,
  "communications": {
    "marketing_opt_in": true,
    "changed_at": "2026-11-16T10:00:00+01:00",
    "newsletter": {
      "status": "Confirmada",
      "source": "Cuenta de cliente",
      "subscribed_at": "2026-11-16T10:00:00+01:00",
      "confirmed_at": "2026-11-16T10:00:00+01:00",
      "policy_version": "1.0"
    }
  }
}
```

- Sin suscripción viva, `newsletter` es `null`. Las constancias de baja son anónimas y no se
  vinculan a la cuenta, así que no se exportan.
- Etiquetas: `status` → "Pendiente de confirmar" | "Confirmada"; `source` → "Formulario" |
  "Cuenta de cliente".
