# Contrato: cambios en `content/<clinica>.yaml`

Este documento amplía el contrato de la 001 ([../../001-public-clinic-website/contracts/content-file.md](../../001-public-clinic-website/contracts/content-file.md)).

## Nueva clave `species` (obligatoria, de 1 a 20 elementos)

```yaml
species:
  - { key: perro, label: Perro }
  - { key: gato, label: Gato }
  - { key: conejo, label: Conejo }
  - { key: huron, label: Hurón }
  - { key: ave, label: Ave }
```

- `key`: `^[a-z][a-z0-9-]{0,31}$`, única. `other` está reservada y se rechaza.
- `label`: entre 1 y 40 caracteres.
- El orden del YAML se guarda como `sort_order`, y "Otra" va siempre al final, la añade la
  interfaz.
- `content:load` hace upsert y borra las especies que ya no aparecen. Si alguna mascota estaba en
  una especie borrada, avisa por consola de cuántas han pasado a "Otra".

## Cambio en `sections`

```yaml
  - { key: cuenta, label: Mi cuenta, href: /mi-cuenta }
```

## Textos legales

`legal_pages` de `privacidad` debe describir el tratamiento de las cuentas:

- finalidades según FR-002;
- base jurídica: la ejecución del contrato para la cuenta y el consentimiento para las
  comunicaciones;
- conservación: hasta que se elimina la cuenta, y 7 días para las que no se verifican;
- los derechos que se ejercen desde el área (descarga y eliminación).

Hay que subir su `version`. Es contenido, no código: se actualiza en `content/petcare.yaml`.
