# Specification Quality Checklist: Catálogo de la tienda online

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- Aclaración resuelta (2026-11-11): ordenación por Destacados, precio de menor a mayor, precio de
  mayor a menor y novedades primero.
- FR-025 nombra clases del sistema de diseño porque la constitución exige que cada spec de UI cite
  los componentes de `design/styles.css` que usa. No se considera un detalle de implementación.
- Desviación de numeración: el script de la extensión git propuso `007-product-catalog` porque
  contaba ramas de otro remoto (`gestor-citas`). Se renombró a `004-product-catalog` para que
  coincida con `specs/`.

## Implementación (2026-11-12): desviaciones y notas

- **Línea base (T001)**: lint, 183 unitarias y 166 de integración en verde antes de empezar.
- **Identificadores**: las tablas usan el helper `id()` del esquema (UUID) en lugar de `serial`, y
  `shop_settings` usa la columna `singleton boolean` como `clinic` y `booking_settings`, en lugar
  de `id = 1`. El check sigue llamándose `shop_settings_singleton`.
- **Datos de la demo**: se cambiaron nombres y precios que se parecían a `design/productos.html` y
  `design/producto.html` (pienso 42,50 € en vez de 39,90 €, cepillo 10,50/13,90 €, "Varita de
  plumas", "Pelota de caucho flotante", "Barritas dentales"...). `no-design-copy` comprueba ahora
  los nombres, los precios y los emojis de esas maquetas. Por eso los textos accesibles de oferta
  de la demo son "Antes 47,90 €, ahora 42,50 €" y "Antes 13,90 €, ahora 10,50 €" (el ejemplo
  "Antes 12,00 €, ahora 9,90 €" queda solo en el test unitario de `priceLabel`).
- **"Mis pedidos"** (área de cliente) apuntaba a `sectionHref('tienda')` y, con la tienda activa,
  habría llevado al catálogo. Ahora usa `sectionHref('carrito')`: los pedidos llegan con el carrito.
- **Búsqueda dentro del `aside`**: el buscador va en el mismo formulario de los filtros, arriba del
  todo, y no en la cabecera de la página como en la maqueta (T043 lo permitía). Sin JavaScript, el
  formulario envía también `q=` vacío, que se ignora.
- **Foco tras "Aplicar"**: el formulario lleva a `#resultados`, que es el destino del fragmento y
  queda a la vista. El test comprueba `:target` y que está en pantalla; el navegador no mueve el
  foco del documento a un `tabindex="-1"` al cargar con un fragmento.
- **404 sin JavaScript**: `notFound()` dentro de una página dinámica deja el cuerpo del 404 para el
  cliente (la misma limitación que ya resolvió `/proximamente`). Decisión del usuario: el
  middleware pasa al runtime Node.js y consulta `catalogRouteExists()` en `/productos` y
  `/productos/<slug>`; si la tienda está apagada o el producto no es visible, reescribe al 404
  normal. El 404 raíz pinta el mensaje del producto cuando la ruta es `/productos/...` y la tienda
  está activa. Supone una consulta indexada más por visita al catálogo.
- **Pestaña "Descripción"**: su enlace es la ficha sin `?pestana=` (la URL canónica), con
  `#pestanas`.
- **Rendimiento (T053)**: las tarjetas y la paginación usan `<a>` en lugar de `next/link` para no
  hidratar unas 30 islas de cliente por página (por el TBT, el rendimiento de `/productos` bajaba de 0,9 en Lighthouse
  móvil). Lighthouse pasa en `/`, `/productos` y una ficha, con accesibilidad 1. Las puntuaciones
  de rendimiento varían bastante entre ejecuciones en este equipo por falta de memoria.
- **Maquetación**: `container shop-layout` y `container detail` en el mismo elemento perdían el
  margen lateral (el `padding` de `.shop-layout` y `.detail` anula el de `.container`; la maqueta
  tiene el mismo fallo). Ahora `.container` envuelve al layout.
- **Revisión manual (T056)**: revisados en el navegador, en escritorio, el listado, los filtros y la
  ficha con pestañas y relacionados. El móvil (360 y 320 px), el teclado y el perfil sin JavaScript
  los cubren los e2e (`mobile-360`, `no-js` y `a11y-all-routes`); queda pendiente un repaso manual
  en móvil real.
- **E2E**: los tests de la feature pasan en los tres perfiles. En la suite completa fallaron de
  forma intermitente 4 tests de `mobile-360` ajenos al catálogo (banner de cookies y correo de
  recuperación) que pasan al repetirlos aislados; coincide con la falta de memoria del equipo.
- **Definición de terminado (T057, 2026-11-12)**: lint, 257 unitarias, 202 de integración y
  Lighthouse (`/`, `/productos` y una ficha) en verde. E2E: 410 pasan y 1 falla de forma
  intermitente (`us5-password-reset` en `no-js`, ajeno al catálogo), que pasa al repetirlo aislado.
  Sin secretos ni `style=""` en el diff.
- **Revisión manual (T056, completada)**: el usuario recorrió los 16 escenarios del quickstart sin
  desviaciones. La ausencia de botones de compra es la esperada (FR-019); llegarán con el carrito.
