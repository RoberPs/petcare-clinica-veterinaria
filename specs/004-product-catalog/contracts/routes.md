# Contrato: rutas

## Reglas comunes

- Son rutas públicas, GET y sin Server Actions. Funcionan sin JavaScript.
- Si `sections.tienda.href` es nulo, responden 404 y los enlaces siguen yendo a
  `/proximamente/tienda` (C8).
- Son `force-dynamic` (CSP con nonce) y usan la misma política de caché que el resto de las
  páginas públicas, sin entradas nuevas en `next.config.ts`.
- No se registra el término buscado ni ningún otro parámetro en los logs.

## `/productos`

### Parámetros de la query

Los valida `parseCatalogQuery`. Los valores no válidos se ignoran sin error (FR-014).

| Parámetro | Valores | Por defecto | Notas |
|---|---|---|---|
| `mascota` | slug de `product_pets`, repetible | ninguno = todas | combinación O |
| `categoria` | slug de `product_categories` | ninguno = "Todas" | combinación Y con las mascotas |
| `q` | texto, recortado, de 80 caracteres como máximo | vacío = sin filtro | sin distinguir mayúsculas ni tildes (C4) |
| `orden` | `destacados` · `precio-asc` · `precio-desc` · `novedades` | `destacados` | etiquetas en la UI: "Destacados", "Precio: de menor a mayor", "Precio: de mayor a menor", "Novedades primero" |
| `pagina` | entero ≥ 1 | 1 | se ajusta a la última página que existe |

### Respuesta (HTML)

La página contiene, por orden:

1. Las migas de pan y el `h1` "Nuestros productos".
2. `.shop-notice`, si el aviso de demostración está activado.
3. Un `<form method="get" action="/productos#resultados">` con:
   - el buscador (`input type=search name=q` con `<label>`);
   - el `fieldset` "Mascota" (casillas);
   - el `fieldset` "Categoría" (radios, con "Todas" primero);
   - el `select name=orden` con `<label>`;
   - el botón "Aplicar".
4. `<h2 id="resultados" tabindex="-1">`, que muestra "N productos", "1 producto" o "No hay
   productos que coincidan". Con búsqueda, añade "para «término»".
5. La cuadrícula `.product-grid`: cada tarjeta es un enlace a la ficha con imagen, etiquetas,
   "Categoría · Mascotas", nombre, precio y "Agotado" si aplica.
6. Resultados vacíos: `.empty-state` con "No hemos encontrado productos para «término»" (con
   búsqueda) o "No hay productos que coincidan" (sin ella), y el enlace "Ver todo el catálogo"
   (`/productos`). Si la tienda no tiene ningún producto visible: "Todavía no hay productos en la
   tienda" con "Volver al inicio" (`/`) y "Contactar con la clínica" (`/contacto`).
7. `nav.pagination` (`aria-label="Paginación"`), solo si hay más de una página.

### Metadatos

Ver C14:
- el título es "Nuestros productos";
- `canonical` apunta a `/productos`, o a `/productos?pagina=N` si N > 1, siempre sin `mascota`,
  `categoria`, `q` ni `orden`;
- con `q`, `mascota` o `categoria`, la página lleva `noindex, follow`.

## `/productos/[slug]`

| Caso | Respuesta |
|---|---|
| Producto visible (C1, `publishedProducts`) | 200, con la ficha |
| Slug inexistente, despublicado o con categoría o mascotas despublicadas | 404 (`not-found.tsx`, con enlace al catálogo) |

### Parámetros de la query

| Parámetro | Valores | Por defecto |
|---|---|---|
| `pestana` | `descripcion` · `ingredientes` · `modo-de-uso` (solo las que tienen contenido) | `descripcion` |

### Respuesta (HTML)

La página contiene, por orden:

1. Las migas de pan: "Inicio › Nuestros productos › <nombre>".
2. `.detail__gallery` con la imagen o el placeholder.
3. `.detail__info` con:
   - las etiquetas y el chip "Categoría · Mascotas";
   - el `h1` con el nombre;
   - la descripción breve y el precio (con el tachado y el texto accesible si está en oferta);
   - "Para: Perro, Gato" (mascota recomendada);
   - el `badge` de disponibilidad;
   - `.shop-notice`, si está activado.
4. `nav.tabs#pestanas` (`aria-label="Información del producto"`), solo si hay más de una pestaña,
   con enlaces `?pestana=<id>#pestanas` y `aria-current="true"` en la activa. Debajo, el panel
   activo en Markdown.
5. "También te puede interesar" (C11): hasta 3 tarjetas. La sección no aparece si no hay
   relacionados.

No hay selector de cantidad ni botones de compra (FR-019).

### Metadatos

- Título: `<nombre> · Nuestros productos`.
- Descripción: `short_description`.
- `canonical`: `/productos/<slug>`, sin `pestana`.
- `og:image`: la imagen del producto, si la hay.

## Enlaces que cambian

- La cabecera, el pie y el Markdown con `section:tienda` pasan por `sectionHref('tienda')` y van a
  `/productos`.
- "Carrito" sigue en `/proximamente/carrito`.
- `sitemap.ts` añade `/productos` y cada ficha visible (C14).
