# Contrato: CLI `admin` y cambios en `content:load` (feature 007)

## `npm run admin` (en producción, `node cli/admin.mjs`)

```text
admin list                               # correo, nombre y fecha de asignación de cada administrador
admin grant <correo> --by "<quién>"      # da el rol a una cuenta verificada existente
admin revoke <correo> --by "<quién>"     # retira el rol (efecto en la siguiente petición)
```

| Código | Significado |
|---|---|
| 0 | Hecho, o no había nada que hacer (ya tenía el rol o ya no lo tenía) |
| 2 | Uso incorrecto: falta `--by` o el correo no es válido |
| 3 | No existe la cuenta o no está verificada |
| 1 | Error inesperado |

- Cada `grant` o `revoke` que cambia algo escribe `admin_audit_log` (`role.grant` o
  `role.revoke`, con `actor_label` el valor de `--by`).
- El correo solo aparece en la salida de la terminal, nunca en los logs de pino.

En producción:

```bash
docker compose -f deploy/docker-compose.prod.yml exec petcare-app node cli/admin.mjs grant <correo> --by "<quién>"
```

## `content:load`: el YAML siembra y no sobrescribe (F4)

| Sección del YAML | Antes | Ahora |
|---|---|---|
| `team[]` | Upsert de todo y despublica lo que falta | Crea los nuevos. En los existentes actualiza solo `specialty`, `photo`, `photo_alt`, `position` y `published`; `name` y `bookable` solo al crear |
| `booking.services[]` (con `staff`) | Upsert, rehace las asignaciones y despublica lo que falta | Crea solo los slugs nuevos, con su `staff`. No toca los existentes ni despublica |
| Horario de cada veterinario | — | Si un veterinario reservable recién creado no tiene tramos, se le copia `opening_hours` |
| `opening_hours`, `closures` y `booking.rules` | Como siempre | Sin cambios |

- `--force-booking` vuelve al comportamiento anterior a esta feature y avisa: "Se sobrescriben los
  datos de agenda del panel".
  - Hace upsert por slug de los servicios reservables y de los miembros del equipo, sobrescribiendo
    todos los campos, incluidos `name` y `bookable`.
  - Rehace las asignaciones de cada servicio y despublica con `unpublishMissing` lo que falta en el
    YAML.
  - Solo **borra** `staff_hours` y `schedule_blocks`, y vuelve a sembrar los horarios desde
    `opening_hours`.
  - No borra servicios ni miembros: las citas, pasadas y futuras, los referencian con una FK
    `restrict`, así que funciona aunque ya existan citas.
- Lo usan los tests (`loadPetcareVariant`) y la puesta en marcha de una clínica nueva.
- `content/petcare.yaml` no cambia de formato. `deploy/README.md` explica la nueva regla.
