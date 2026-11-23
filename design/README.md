# Design — Clínica Veterinaria

Sistema de estilos clonado de https://www.anicura.es/ (colores, tipografía, formas y componentes reales medidos con estilos computados). Sirve como base visual para Claude Code.

## Archivos
| Archivo | Uso |
|---|---|
| `tokens.css` | Variables CSS: colores, tipografía, radios, sombras, espaciado. **Única fuente de verdad.** |
| `styles.css` | Componentes: topbar, header, chips, botones, hero, tarjetas, stats, boletín, aviso, footer. |
| `layout.js` | Inyecta cabecera y footer compartidos (`#site-header`, `#site-footer`). |
| `index.html` | Inicio: hero con buscador, accesos rápidos, estadísticas, boletín. |
| `la-clinica.html` | Clínica única: hero, horario/dirección, equipo veterinario (imágenes en `img/`), mapa. |
| `contacto.html` | Formulario de contacto, teléfono destacado (tarjeta rosa), dirección y mapa. |
| `cita.html` | Reserva de cita online: servicio, mascota, franjas horarias, datos y resumen. |
| `faqs.html` | Preguntas frecuentes en acordeón (`<details>`). |
| `tratamientos.html` | Hero con foto + tarjeta, rejilla de servicios. |
| `consejos.html` | Hero, categorías (perro/gato/otros), tarjetas de artículos y noticias. |
| `articulo.html` | Plantilla de artículo: cabecera con imagen, texto 765 px, caja CTA. |
| `productos.html` | Mini tienda: filtros laterales, rejilla de productos, precios/ofertas, botón de carrito. |
| `producto.html` | Detalle de producto: galería, precio, cantidad, pestañas, relacionados. |
| `carrito.html` | Carrito con resumen del pedido. |
| `checkout.html` | Datos de envío, método de pago (sin campos de tarjeta; los gestionaría una pasarela externa). |
| `login.html` / `registro.html` | Autenticación: tarjeta centrada sobre fondo celeste. |
| `cuenta.html` | Área privada: mascotas, citas, pedidos. |

Servir en local: `python -m http.server 8765 --directory design` y abrir http://127.0.0.1:8765/

## Tokens
- `styles.css` no contiene valores escritos a mano: colores, tamaños, espacios, radios, sombras y duraciones salen de `tokens.css` (`npm run check:design` lo comprueba). Un valor nuevo se añade primero como token.
- Componentes añadidos para la web pública: `:focus-visible`, `.skip-link`, `.demo-banner`, `.band__row`, `.note--contact` y los de cada página (menú móvil, cookies, formulario, estado de apertura, mapa).

## Reglas de diseño
- Texto y titulares en azul marino `--color-navy` (#00263e); fondo de página `--color-bg` (#f3f7f8); tarjetas blancas.
- Titulares semibold (600), `letter-spacing: -0.5px`, interlineado 1.2. Cuerpo 14–16 px, interlineado 1.5.
- CTA por intención: **cian** (`--color-sky`) = pedir cita, **menta** (`--color-mint`) = acciones positivas/éxito, **rosa** (`--color-pink`) = contacto, **ámbar** = campañas, **marino** = acción primaria neutra.
- Botones/chips/inputs: radio 12 px, mayúsculas en chips. Tarjetas e imágenes: radio 24 px (las tarjetas de acceso con la esquina superior izquierda recta).
- Hero: tarjeta blanca con sombra `0 8px 120px rgba(0,0,0,.15)` junto a imagen redondeada; rejilla 2 columnas, hueco 96 px, gutter lateral 96 px (20 px en móvil).
- Secciones alternan fondos: `--color-bg` → `--color-sky-light` → `--color-navy` (footer/boletín).

## Pendientes / avisos
- **Tipografía**: `--font-family` es `var(--font-figtree), "Segoe UI", system-ui, sans-serif`. La aplicación autoaloja **Figtree** con `next/font` (variable `--font-figtree`), sin peticiones a terceros (principio IV). Se ha eliminado "Guardian Sans" (propietaria) y el `@import` de Google Fonts de `styles.css`; al abrir las maquetas sueltas se ve la fuente de sistema.
- **Logo, imágenes e iconos** de AniCura no se han copiado (marca registrada). Hay placeholders (emoji/degradado): sustituir por assets propios de la clínica.
- Textos de ejemplo genéricos; adaptar al contenido real.
- Breakpoint móvil único (900 px); no se midió el comportamiento responsive original.

## Uso con Claude Code / spec-kit
Referenciar `design/tokens.css` y `design/styles.css` en la spec (`/speckit-specify`, `/speckit-plan`) y exigir que toda UI use únicamente esas variables y clases.





## Cabecera
Menú (de más a menos importante): Tratamientos · La clínica · Nuestros productos · Consejos de salud · Preguntas frecuentes. Zona derecha: Mi cuenta · Pide cita · Contacto · Carrito (siempre al final).


## Movimiento, degradados y patrones (medidos en anicura.es)
- Transición dominante: `0.25s ease-in-out` sobre color, fondo, borde, sombra y opacidad. Para `transform`: `0.25s cubic-bezier(0.4,0,0.2,1)`. Rápida: `0.1s`. Tokens: `--duration-*`, `--ease-*`.
- Animaciones: `spin 1s linear infinite` (cargas), `pulse` (opacidad 50 %), `fade-in-out 3s` + `shimmer 2s` (halo y destello del botón dorado "Campañas"), `gradient-loader 3s` (esqueleto de carga), `fade-in .4s` (menús/paneles).
- Degradados: halo dorado `--gradient-glow` (`#fed78a` → transparente); el hero usa un **patrón de hojas** (`--pattern-leaf`) difuminado a blanco con `--gradient-fade-white`.
- Clases: `.spinner`, `.skeleton`, `.is-pulsing`, `.fade-in`, `.btn--glow`; `.chip--amber` lleva destello.
- `prefers-reduced-motion` desactiva animaciones.
- Imagen de referencia: `reference/anicura-tarjetas-y-hero-patron.jpg` (solo consulta; no usar en producción).
- No replicado: separadores de sección con recortes SVG (`gap-top/bottom`), formas `flower`/`rounded-square` ni los iconos propios de AniCura.
