# Contrato: "Descargar mis datos" (`format_version: 1`)

La respuesta de `POST /api/account/export` tiene:

- código **200**;
- `Content-Type: application/json; charset=utf-8`;
- `Content-Disposition: attachment; filename="mis-datos-AAAA-MM-DD.json"`;
- `Cache-Control: no-store`.

El JSON se indenta con 2 espacios, y las fechas van en ISO 8601 (con zona en los instantes).

```json
{
  "format_version": 1,
  "exported_at": "2026-11-11T10:15:00+01:00",
  "controller": { "name": "<clinic.legal_owner_name>", "contact_email": "<clinic.legal_contact_email>" },
  "account": {
    "email": "…",
    "first_name": "…",
    "last_name": "…",
    "phone": null,
    "address": { "line": null, "postal_code": null, "city": null, "province": null },
    "email_verified_at": "…",
    "created_at": "…",
    "updated_at": "…"
  },
  "communications": { "marketing_opt_in": false, "changed_at": null },
  "consents": [
    { "kind": "privacy_terms", "privacy_version": "…", "terms_version": "…", "at": "…" }
  ],
  "pets": [
    { "name": "…", "species": "Perro", "species_key": "perro", "birth_date": "2022-08-01", "age_at_export": "4 años", "created_at": "…", "updated_at": "…" }
  ]
}
```

No se incluyen `id` internos, `password_hash`, sesiones, tokens, intentos de acceso ni la bandeja
de salida.

Un test de integración comprueba que el archivo contiene todas las columnas de usuario de
`customers` y `pets` (SC-008) y ningún dato de otra cuenta.
