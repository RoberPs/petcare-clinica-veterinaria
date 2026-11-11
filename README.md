# PetCare — web de clínica veterinaria

Producto web para clínicas veterinarias, en español y pensado sobre todo para el móvil. Se
presenta con **PetCare**, una clínica **ficticia** de demostración. El producto funciona como el de
un negocio real y se adapta a cualquier clínica cambiando solo su configuración y su contenido, sin
tocar el código.

> **Estado (2026-11-10)**: la feature 001, la web pública, está **implementada**
> ([`specs/001-public-clinic-website/`](specs/001-public-clinic-website/)). El despliegue está
> preparado en [`deploy/README.md`](deploy/README.md).

## Qué incluye

| Módulo | Estado |
|---|---|
| Web pública: portada, tratamientos, la clínica, contacto, preguntas frecuentes y páginas legales | ✅ implementada (feature 001) |
| Reserva de citas online | ⏳ futura (hoy lleva a "Próximamente") |
| Tienda online: catálogo, producto, carrito y checkout con pagos de prueba | ⏳ futura |
| Consejos de salud (artículos) | ⏳ futura |
| Área de cliente: mascotas, citas y pedidos | ⏳ futura |
| Panel de administración | ⏳ futura (hasta entonces, el contenido se carga desde un archivo) |

## Stack

- **Next.js 15** (App Router y Server Actions), **React 19** y **TypeScript** en modo estricto,
  sobre Node.js 22 LTS.
- **PostgreSQL 16**, con **Drizzle ORM** y migraciones versionadas.
- **Brevo** para el correo transaccional, con bandeja de salida y reintentos.
- **Vitest**, **Playwright** con **axe** (accesibilidad) y **Lighthouse CI**.
- **Despliegue**: Docker en un VPS, detrás de Caddy y Cloudflare, en
  `petcare.automatizacionro.work` (propuesto).

El porqué de cada decisión está en
[`specs/001-public-clinic-website/research.md`](specs/001-public-clinic-website/research.md).

## Principios del proyecto

Los fija la [constitución](.specify/memory/constitution.md) (v1.1.0), que prevalece sobre
cualquier otra guía:

1. **Design system como única fuente visual**: toda la interfaz usa solo
   [`design/tokens.css`](design/tokens.css) y [`design/styles.css`](design/styles.css).
2. **Marca propia y contenido real**: no se publican marcas, imágenes ni textos de terceros, ni los
   textos de ejemplo de `design/`.
3. **Tests de los flujos críticos**: registro, citas, checkout y pedidos.
4. **Privacidad (RGPD) y seguridad**: minimización de datos, consentimiento de cookies en el que
   rechazar cuesta lo mismo que aceptar, y secretos solo en variables de entorno.
5. **Accesibilidad WCAG 2.2 AA** en todas las pantallas.
6. **Rendimiento**: Lighthouse móvil de 90 o más en la portada y el catálogo.
7. **Pagos solo en modo de pruebas**.
8. **Producto real y adaptable**: nada a medias y ningún dato de una clínica concreta en el
   código.

## Estructura del repositorio

```text
.specify/          Spec Kit: constitución, plantillas, scripts y extensión git
.claude/           comandos y skills de Claude Code (/speckit-*)
design/            design system y maquetas HTML de referencia (no es la app)
specs/             una carpeta por feature: spec, plan, research, data model, contracts y tasks
src/               aplicación Next.js (app, components, domain, db, content, email, lib)
content/           contenido de cada clínica (content/petcare.yaml, ficticio)
public/media/      imágenes e iconos propios de la demo
drizzle/           migraciones versionadas de PostgreSQL
scripts/           migrate, content-load, email-dispatch, retention-purge, check-design, correo falso
tests/             unit (Vitest), integration (PostgreSQL real) y e2e (Playwright + axe)
deploy/            Docker Compose de producción, Caddy, systemd, copias y guía de despliegue
```

## Cómo se trabaja: desarrollo guiado por especificación

Con [Spec Kit](https://github.com/github/spec-kit) y Claude Code:

```text
/speckit-specify  →  /speckit-clarify  →  /speckit-plan  →  /speckit-tasks  →  /speckit-implement
```

Cada feature vive en `specs/NNN-nombre/`, en su propia rama de git. Cada plan se comprueba contra
los principios de la constitución y justifica cualquier excepción.

## Ver el diseño de referencia

```bash
python -m http.server 8765 --directory design
# abrir http://127.0.0.1:8765/
```

Las maquetas de `design/` definen la estructura de cada pantalla, pero sus textos, cifras e
imágenes son marcadores de posición y no se publican.

## Puesta en marcha

La guía completa, con las comprobaciones de cada historia de usuario, está en
[`specs/001-public-clinic-website/quickstart.md`](specs/001-public-clinic-website/quickstart.md).
En resumen:

```bash
cp .env.example .env
docker compose up -d
npm ci
npm run db:migrate
npm run content:load -- --file content/petcare.yaml
npm run dev            # http://localhost:3000
```

El PostgreSQL de desarrollo escucha en el puerto **5434** y el de pruebas en el **5433**.

## Comandos

```bash
npm run lint              # ESLint, tsc y check:design (sin CSS fuera de design/ ni valores a mano)
npm test                  # unitarias
npm run test:integration  # PostgreSQL real (docker compose up -d db-test)
npm run test:e2e          # Playwright: 3 perfiles (móvil 360, escritorio y sin JavaScript) y axe
npm run test:lighthouse   # Lighthouse CI móvil sobre / (requiere npm run build)
npm run email:dispatch    # reintenta los correos pendientes
npm run email:fake:list   # correos recibidos por el proveedor falso
npm run retention:purge   # borra los mensajes de más de 12 meses
```

## Aviso

PetCare es una clínica **ficticia**. Cualquier parecido con una clínica real es casual. La web de
demostración lo indica en todas sus páginas.
