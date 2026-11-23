# Contrato: bloque `shop:` en `content/<clinica>.yaml`

Se añade al esquema de `src/content/schema.ts` (`shopSchema`) y se carga con
`npm run content:load`. Sin el bloque, la carga falla si `sections.tienda.href` no es nulo (no se
puede abrir una tienda sin catálogo).

```yaml
shop:
  settings:
    shipping_text: 24-48 h
    page_size: 12                     # opcional (12), 4–48
    meta_description: Alimentación, higiene, juguetes y accesorios para tu mascota.
    demo_notice:                      # opcional; sin él, el aviso queda desactivado
      enabled: true
      text: "Tienda de demostración: estos productos no están a la venta."
  categories:                         # 1–20, en el orden de los filtros
    - { slug: alimentacion, name: Alimentación }
    - { slug: higiene, name: Higiene }
  pets:                               # 1–10, en el orden de los filtros
    - { slug: perro, name: Perro }
    - { slug: gato, name: Gato }
    - { slug: otros, name: Otros animales }
  products:                           # 0–500, en el orden "Destacados"
    - slug: pienso-adulto-razas-medianas
      name: Pienso adulto razas medianas 12 kg
      category: alimentacion
      pets: [perro]
      price: "39.90"                  # euros con IVA incluido, como cadena, 2 decimales como máximo
      compare_at_price: "44.90"       # opcional; oferta si es mayor que price
      vat_rate: 21
      stock: 14
      is_new: true                    # opcional (false)
      image: media/petcare/productos/pienso-adulto-razas-medianas.svg   # opcional
      image_alt: Saco de pienso ilustrado junto a un cuenco lleno
      short_description: Alimento completo para perros adultos de razas medianas.
      description: |                  # Markdown
        ...
      ingredients: |                  # opcional (Markdown)
        ...
      usage: |                        # opcional (Markdown)
        ...
```

## Validación (cada error indica `shop.products[i].<campo>` y el `slug`)

- Los `slug` son únicos dentro de cada lista y siguen el formato `^[a-z0-9-]+$`.
- `category` existe en `categories`. Cada elemento de `pets` existe en `pets`, sin repetidos, y hay
  al menos uno.
- `price` y `compare_at_price` siguen el formato `^\d{1,5}(\.\d{1,2})?$` y son mayores que 0.
- `vat_rate` es uno de 0, 4, 10 o 21. `stock` es un entero mayor o igual que 0.
- `name` tiene de 1 a 120 caracteres, `short_description` de 1 a 300, y `description` no puede
  estar vacío.
- Si hay `image`, `image_alt` es obligatorio y el archivo tiene que existir en `public/`
  (`checkImages`).
- `demo_notice.text` es obligatorio si `enabled` es `true`.
- Un `compare_at_price` menor o igual que `price` **no es un error**: se carga y se ignora al
  mostrarlo (FR-016), con un aviso en el resumen de la carga.

## Carga

Todo ocurre en la misma transacción que el resto del contenido:

- `settings` hace upsert del singleton `shop_settings`.
- `categories`, `pets` y `products` hacen upsert por `slug`, con `position` igual al índice. Lo
  ausente pasa a `published = false`.
- `products.search_name` se calcula con `normalizeSearch(name)`.
- `product_pet_links` se reemplaza entero para los productos del archivo.
- El resumen (`LoadSummary`) añade `shopCategories`, `shopPets`, `products` y `productsHidden`.

## Cambios en el resto del archivo de la demo

- `sections`: `{ key: tienda, label: Nuestros productos, href: /productos }`.
- Pregunta frecuente sobre productos: se quita el "Pronto podrás verla" y se enlaza a
  `section:tienda`.
- Los textos legales que dicen "no vende productos" no cambian (siguen siendo ciertos).
