# Contrato: rutas públicas

Todas las rutas comparten un mismo layout con la franja de demostración (si está activada), un
enlace para saltar al contenido, la cabecera, `<main id="contenido">`, el pie y el aviso de
cookies si no hay una elección vigente. Todas responden con HTML completo sin depender de
JavaScript.

| Ruta | Página | Referencia `design/` | Caché | Indexable | Historia |
|---|---|---|---|---|---|
| `/` | Portada | `index.html` (sin boletín) | dinámica | sí | US1 |
| `/tratamientos` | Tratamientos y servicios | `tratamientos.html` | dinámica | sí | US3 |
| `/la-clinica` | La clínica | `la-clinica.html` | dinámica | sí | US4 |
| `/contacto` | Contacto y formulario | `contacto.html` | dinámica | sí | US5 |
| `/contacto/enviado` | Confirmación sin JavaScript (PRG) | `contacto.html` (panel de éxito) | dinámica | no | US5 |
| `/preguntas-frecuentes` | Preguntas frecuentes | `faqs.html` | dinámica | sí | US6 |
| `/cookies/configurar` | Cambiar o retirar el consentimiento | sin referencia | dinámica | no | US7 |
| `/aviso-legal` · `/privacidad` · `/politica-de-cookies` · `/terminos` | Páginas legales | sin referencia (`page-hero` y `prose`) | dinámica | sí | US8 |
| `/proximamente/[key]` | Próximamente (`reservas`, `tienda`, `carrito`, `consejos` y `cuenta`) | sin referencia (`page-hero` y `cta-box`) | dinámica | **no** | transversal |
| cualquier otra | No encontrada (404) | sin referencia | — | **no** | casos límite |
| `/sitemap.xml` · `/robots.txt` | SEO | — | dinámica | — | FR-046 |
| `/api/health` | Comprobación de vida (base de datos accesible) | — | sin caché | no | despliegue |

Si `key` no es uno de los cinco valores, `/proximamente/[key]` devuelve 404.

## Cabecera (FR-003, FR-004 y FR-005)

Orden de la navegación principal: Tratamientos (`/tratamientos`) · La clínica (`/la-clinica`) ·
Nuestros productos (`sectionHref('tienda')`) · Consejos de salud (`sectionHref('consejos')`) ·
Preguntas frecuentes (`/preguntas-frecuentes`).

A la derecha: Mi cuenta (`sectionHref('cuenta')`) · Pide cita (`sectionHref('reservas')`, con
`btn--sky`) · Contacto (`/contacto`, con `btn--pink`) · Carrito (`sectionHref('carrito')`, siempre
el último).

- Por debajo de 900 px, un `<details class="mobile-nav">` con `<summary class="nav-toggle">Menú</summary>`
  contiene las cinco entradas, además de "Pide cita" y "Contacto".
- La página actual lleva `aria-current="page"`.

## Portada: destinos en un clic (FR-009 y FR-010)

| Acceso | Destino |
|---|---|
| Pide cita online | `sectionHref('reservas')` (hoy `/proximamente/reservas`) |
| Contacto | `/contacto` |
| Conoce la clínica | `/la-clinica` |
| Nuestros productos | `sectionHref('tienda')` |
| Tratamientos y servicios | `/tratamientos` |
| Consejos de salud | `sectionHref('consejos')` |

## Pie (FR-007 y FR-039)

Nombre, teléfono (`tel:`), correo (`mailto:`), dirección, horario resumido con su estado (FR-018),
La clínica, Tratamientos, Contacto, Preguntas frecuentes, Aviso legal, Política de privacidad,
Política de cookies, Términos de uso y "Configurar cookies" (`/cookies/configurar`).
