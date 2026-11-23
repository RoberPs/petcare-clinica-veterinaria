# Quickstart: validar el catálogo de productos

## Preparación

```bash
docker compose up -d
npm run db:migrate                                   # aplica 0003_product_catalog
npm run content:load -- --file content/petcare.yaml  # el resumen incluye shopCategories, shopPets y products
npm run dev
```

## Escenarios manuales

Las referencias apuntan a la [spec](spec.md) y a los [contratos](contracts/routes.md).

| # | Pasos | Resultado esperado |
|---|---|---|
| 1 | Cabecera → "Nuestros productos" | `/productos`, con el aviso de demostración, "24 productos" y 12 tarjetas con imagen, "Categoría · Mascota", nombre y precio `00,00 €` (US1) |
| 2 | Paginación → página 2 | 12 tarjetas más; la paginación marca la página 2 con `aria-current="page"` |
| 3 | Marcar "Gato" y "Otros animales", elegir "Higiene" y pulsar "Aplicar" | Solo productos de higiene para gato u otros animales; el foco queda en el total; la URL tiene `mascota=gato&mascota=otros&categoria=higiene` (US3) |
| 4 | Ordenar por "Precio: de menor a mayor" | Los precios ascienden y a igual precio se respeta el orden destacado (C10) |
| 5 | Buscar `champu` | Aparece "Champú…" sin la tilde escrita (US4) |
| 6 | Buscar `zzz` | "No hemos encontrado productos para «zzz»" y "Ver todo el catálogo" |
| 7 | Abrir un producto en oferta | "Oferta", el precio anterior tachado y, con lector de pantalla, "Antes … ahora …" (US5) |
| 8 | Abrir una ficha completa y recorrer las pestañas con el teclado | Descripción → Ingredientes → Modo de uso, con `?pestana=` y `aria-current` (US2) |
| 9 | Abrir el producto sin ingredientes ni modo de uso | No hay barra de pestañas |
| 10 | Abrir un producto agotado | "Agotado", sin botones de compra; en "Destacados" aparece al final |
| 11 | Abrir el producto sin imagen | El placeholder, sin descuadre |
| 12 | Final de la ficha | "También te puede interesar" con hasta 3 productos que no incluyen el actual (US6) |
| 13 | `/productos/no-existe` | 404 con enlace al catálogo |
| 14 | `/productos?mascota=dragon&orden=x&pagina=999` | Sin error: todas las mascotas, "Destacados" y la última página |
| 15 | Desactivar JavaScript en el navegador y repetir 3, 5 y 8 | El mismo resultado (FR-023) |
| 16 | Poner `tienda.href: null` en el YAML, recargar el contenido y volver a abrir `/productos` | 404; la cabecera lleva a `/proximamente/tienda` |

## Pruebas automáticas

```bash
npm run lint              # ESLint, tsc y check:design (sin estilos escritos a mano)
npm test                  # money, normalizeSearch, parseCatalogQuery, shopSchema…
npm run test:integration  # carga de shop:, filtros, orden, total, relacionados y visibilidad
npm run test:e2e          # us1–us6 en móvil, escritorio y sin JavaScript; axe; 320 px
npm run test:lighthouse   # /, /productos y una ficha ≥ 0,9
```

Para la definición de terminado, ver el plan y CLAUDE.md.
