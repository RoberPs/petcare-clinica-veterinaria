# Contrato: bloque `booking:` en `content/<clinica>.yaml`

Se añade al esquema de `src/content/schema.ts` y se carga con `npm run content:load`. Sin el
bloque, la carga falla si `sections.reservas.href` no es nulo (no se puede ofrecer reserva sin
servicios).

```yaml
booking:
  rules:                       # todos opcionales; valores por defecto entre paréntesis
    slot_step_minutes: 30      # (30) 5–120
    min_lead_minutes: 120      # (120)
    horizon_days: 60           # (60)
    change_cutoff_hours: 24    # (24)
    max_active_per_email: 3    # (3) invitados
    max_active_per_customer: 9 # (9) clientes
    reminder_hours_before: 24  # (24) 0 desactiva el recordatorio
    retention_months: 12       # (12)
  services:                    # 1–20, en el orden del selector
    - slug: consulta-general
      name: Consulta general
      duration_minutes: 30
      service: consulta-general        # opcional: slug de services
      staff: [nerea-olmedo, inigo-barral, carlota-vives]
```

## Validación

- `slug` es único.
- `duration_minutes` es un múltiplo de 5 entre 5 y 480 y no puede superar el tramo más largo del
  horario (si no, el servicio nunca tendría hueco).
- `staff` tiene de 1 a 20 slugs existentes en `team`. `service`, si está, existe en `services`.

## Carga

- Upsert por `slug`, con `position` igual al índice. Los servicios ausentes pasan a
  `published = false`.
- La lista `staff` se reemplaza entera.
- `rules` hace upsert del singleton.
- Nunca toca `appointments` (B15).

## Clínica de demostración (`content/petcare.yaml`)

| slug | name | min | staff |
|---|---|---|---|
| `consulta-general` | Consulta general | 30 | Olmedo, Barral, Vives |
| `vacunacion` | Vacunación | 15 | Olmedo, Barral, Vives |
| `revision-dental` | Revisión dental | 30 | Vives |
| `cirugia` | Cirugía | 60 | Barral |
| `dermatologia` | Dermatología | 30 | Vives |
| `otro` | Otro | 30 | Olmedo, Barral, Vives |

Además, `sections.reservas.href` pasa de `null` a `/pide-cita`.
