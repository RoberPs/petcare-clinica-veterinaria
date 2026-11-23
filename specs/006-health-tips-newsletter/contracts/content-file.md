# Contrato: bloques `post_categories`, `posts` y `newsletter` del YAML de la clínica

Se validan en `src/content/schema.ts` y se cargan en la misma transacción que el resto
(`loadPosts`, `loadNewsletter`). `checkImages` comprueba también `posts[].image`.

```yaml
sections:
  - { key: consejos, label: Consejos de salud, href: /consejos }

post_categories:                 # obligatorio si sections.consejos.href no es nulo
  - { key: perro, label: Perro }
  - { key: gato, label: Gato }
  - { key: otros-animales, label: Otros animales }

posts:
  - slug: cada-cuanto-banar-perro
    kind: article                # article | news
    category: perro              # obligatoria en article; opcional en news ("General")
    title: "…"
    lead: "…"                    # preámbulo, 1–400
    published_on: 2026-10-02     # fecha; 00:00 Europe/Madrid
    published: true              # opcional, true por defecto
    image: media/petcare/consejos/bano-perro.svg   # opcional
    image_alt: "…"               # obligatorio si hay image
    meta_description: "…"        # opcional, ≤ 160; si falta, se usa el preámbulo recortado
    body_md: |
      ## Primera sección
      Texto…

newsletter:
  enabled: true
  title: Suscríbete al boletín de noticias
  text: Consejos de salud y novedades de la clínica, como mucho una vez al mes.

legal_pages:
  - kind: boletin                # obligatoria si newsletter.enabled
    title: Política del boletín
    version: "1.0"
    updated_on: 2026-11-16
    body_md: |
      …
```

## Reglas de validación

- `slug` único; `category` debe existir en `post_categories`; claves de categoría únicas.
- `body_md` ≤ 40 000 y sin encabezados `#` de nivel 1.
- Un `slug` ausente del archivo queda despublicado (`unpublishMissing`).
- Una categoría ausente del archivo se borra si no tiene publicaciones; si las tiene, el loader
  falla con el slug de la primera.
- `newsletter` es opcional; si falta, el boletín queda desactivado.
- Errores en español con la ruta del campo, como en el resto del loader.

El resumen de `content:load` añade: `posts` (cargadas/despublicadas), `post_categories` y
`newsletter` (activo o no).
