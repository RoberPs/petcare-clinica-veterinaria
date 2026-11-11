# Contrato: citas en "Descargar mis datos"

Amplía [specs/002-client-accounts-pets/contracts/export-format.md](../../002-client-accounts-pets/contracts/export-format.md)
con una clave nueva en la raíz del JSON. El resto no cambia.

```json
"citas": [
  {
    "servicio": "Consulta general",
    "profesional": "Dra. Nerea Olmedo",
    "mascota": "Nombre de la mascota",
    "especie": "Perro",
    "inicio": "2026-11-20T10:00:00+01:00",
    "fin": "2026-11-20T10:30:00+01:00",
    "estado": "confirmada | cancelada | realizada",
    "cancelada_por": "cliente | clinica | sistema | null",
    "motivo": "texto o null",
    "telefono_contacto": "…",
    "reservada_el": "2026-11-11T18:02:00+01:00"
  }
]
```

- Las citas van ordenadas por `inicio`, de la más reciente a la más antigua.
- Las fechas siguen la norma ISO 8601 con el desfase de la zona de la clínica.
- Solo se incluyen las citas con `customer_id` de la cuenta. Las de invitado hechas con el mismo
  correo no entran (Q2).
