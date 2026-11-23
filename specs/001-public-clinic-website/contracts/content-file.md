# Contrato: archivo de contenido por clínica (`content/<clinica>.yaml`)

Se carga con `npm run content:load -- --file content/<clinica>.yaml`. El archivo se valida con un
esquema Zod (`src/content/schema.ts`), y si no es válido la carga se aborta sin tocar la base de
datos, indicando la ruta exacta del error. Si es válido, la carga se hace en una transacción: hace
un upsert por `slug`, despublica lo que ya no está, actualiza `clinic` e invalida la caché de las
páginas.

```yaml
clinic:
  name: PetCare
  demo_banner_enabled: true
  logo: media/petcare/logo.svg            # opcional
  hero: { title: "…", text: "…", image: media/petcare/hero.avif, image_alt: "…" }
  about: { title: "…", text: "…", image: media/petcare/clinica.avif, image_alt: "…" }
  address: { line: "…", postal_code: "…", city: "…", province: "…" }
  geo: { lat: 0.0, lng: 0.0 }              # opcional; sin coordenadas no hay mapa
  phone: { e164: ${CLINIC_PHONE_E164}, display: ${CLINIC_PHONE_DISPLAY} }   # número que controla el responsable; nunca inventado
  public_email: "…"                        # opcional
  inbox_email: ${CLINIC_INBOX_EMAIL}       # se resuelve desde una variable de entorno; nunca se escribe en el YAML
  response_time_text: "en un plazo de 24 horas laborables"
  legal:
    owner_name: ${LEGAL_OWNER_NAME}        # responsable real de la demo (FR-040a)
    contact_email: ${LEGAL_CONTACT_EMAIL}
    tax_id: null                           # no se inventa
    address: null

opening_hours:                              # weekday ISO 1–7; varios tramos permitidos
  - { weekday: 1, opens: "09:00", closes: "14:00" }
  - { weekday: 1, opens: "16:00", closes: "20:00" }

closures:
  - { slug: navidad-2026, starts_on: 2026-12-25, ends_on: 2026-12-25, reason: "Navidad" }

services:      [{ slug, name, description }]          # el orden del archivo es el orden en la web
team:          [{ slug, name, specialty, photo?, photo_alt? }]
faq_topics:    [{ slug, name, faqs: [{ slug, question, answer_md }] }]
activity_stats: [{ slug, value_text, label, description? }]
health_notices: [{ slug, text, source_label, source_url }]   # la fuente es obligatoria
contact_reasons: [{ slug, label }]
legal_pages:
  - { kind: privacidad, title, version, updated_on, body_md }   # y también aviso-legal, cookies y terminos
sections:
  - { key: reservas, label: "Pide cita", href: null }           # null = /proximamente/reservas
```

## Reglas

- Los marcadores `${VAR}` se resuelven desde el entorno durante la carga. Así los datos personales
  del responsable y el buzón no quedan en el repositorio.
- Las rutas de imagen tienen que existir en `public/`. Si falta un archivo, la carga se aborta.
- Los tramos de `opening_hours` del mismo día no pueden solaparse, y en `closures` `starts_on` no
  puede ser posterior a `ends_on`.
- Los cuatro `legal_pages.kind` y las cinco `sections.key` son obligatorios.
- Están prohibidos los textos copiados de `design/`. Una prueba compara los textos del archivo de
  la demo con los de `design/*.html` y falla si alguno coincide (SC-010).
