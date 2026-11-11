# Ejecución del quickstart — feature 001

**Fecha**: 2026-11-10 · **Entorno**: Windows 11, Node 24, Docker Desktop (PostgreSQL 16 en 5434 y
5433, proveedor de correo falso en 8025/8026).

## Puesta en marcha

- [x] `docker compose up -d`, `npm run db:migrate` y `npm run content:load -- --file content/petcare.yaml`
  sin errores (8 servicios, 4 profesionales, 10 preguntas y 1 cierre).
- [x] La portada muestra la franja "Web de demostración: PetCare es una clínica ficticia", el
  titular del YAML y el aviso de cookies.

## Comprobaciones por historia

Cubiertas por la suite de Playwright (`npm run test:e2e`): **149 pasadas, 0 fallos**. Otras 49 se
omiten a propósito según el perfil (móvil 360, escritorio y sin JavaScript).

- [x] US1: los 6 accesos llegan a su destino en un clic. Los botones principales se ven sin scroll
  en 360 px.
- [x] US2: menú con las 5 secciones, "Pide cita" y "Contacto". Escape devuelve el foco a "Menú".
  También funciona sin JavaScript.
- [x] US3: servicios en el orden del YAML, despublicación y estado vacío.
- [x] US4: dirección, horario de 7 días, "Abierto/Cerrado ahora" y equipo. Sin consentimiento,
  marcador en lugar del mapa y ninguna petición a OpenStreetMap.
- [x] US5: envío válido con confirmación, 1 mensaje, correo a la clínica y acuse sin el texto.
  Doble clic y recarga sin duplicados. Errores junto al campo con foco. Sin JavaScript redirige a
  `/contacto/enviado`.
- [x] US6: grupos Citas, Tienda y Tu mascota. Se despliegan con clic, Enter y Espacio, también sin
  JavaScript.
- [x] US7: "Rechazar" no vuelve a preguntar y no carga terceros. "Aceptar" carga el mapa sin
  recargar. Se puede retirar desde "Configurar cookies". Con otra versión de la política se vuelve
  a preguntar.
- [x] US8: las 4 páginas legales con título, fecha, responsable real y mención de clínica
  ficticia, sin NIF.

## Reintento de correo

- [x] Con 3 fallos simulados en el proveedor falso (`POST /control {"fail":3}`) y 4 ejecuciones de
  `npm run email:dispatch`, los fallos se repartieron entre los dos correos del mensaje: 2 en el de
  la clínica y 1 en el acuse. Ambos acabaron en `sent` (3 y 2 intentos), con 2 correos recibidos,
  sin pérdidas ni duplicados. La prueba de integración `email-dispatch.test.ts` cubre el caso
  "sent en el cuarto intento" de un solo correo, los 8 fallos que llevan a `failed` y el `401` que
  lleva a `failed` inmediato.

## Cambio de clínica (SC-009)

- [x] Con un `content/otra.yaml` temporal (nombre "Huellas Demo", otro titular, otro horario del
  sábado y otro servicio), `content:load` cambió la portada, Tratamientos, La clínica y el aviso
  legal sin tocar `src/`. Después se volvió a cargar `petcare.yaml` y se borró el archivo temporal.
- [x] `src/` no contiene datos de PetCare. Se ha corregido la única ruta que dependía de la clínica:
  la imagen de sustitución del equipo pasa a `public/media/comun/`.

## Pruebas automáticas

| Orden | Resultado |
|---|---|
| `npm run lint` | ✅ ESLint, `tsc` y `check:design` sin errores |
| `npm test` | ✅ 50/50 |
| `npm run test:integration` | ✅ 17/17 |
| `npm run test:e2e` | ✅ 149 pasadas, 0 fallos (49 omitidas por perfil) |
| `npm run test:lighthouse` | ✅ aserción ≥ 0,90 cumplida (0,79 / 0,84 / 0,96; accesibilidad 1,0). Mediana 0,84 en esta máquina: el ruido es del entorno, porque una maqueta estática sin JavaScript da 0,76 aquí. Conviene confirmarlo en CI. |

## Pendiente fuera de este entorno

- Despliegue real en el VPS: Cloudflare, Brevo con SPF y DKIM, Caddy y `deploy/prueba-ip.sh`
  (guía en `deploy/README.md`).
