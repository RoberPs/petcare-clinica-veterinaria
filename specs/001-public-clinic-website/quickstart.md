# Quickstart: validar la web pública

Guía para comprobar de punta a punta que la feature funciona. Los detalles están en
[contracts/](./contracts/) y [data-model.md](./data-model.md).

## Requisitos

- Node.js 22 LTS, npm y Docker con Docker Compose.
- Un archivo `.env` creado a partir de `.env.example`. En local:
  - `DATABASE_URL`, que apunta al PostgreSQL de `docker-compose.yml`.
  - `EMAIL_PROVIDER=fake` (el servidor falso que imita Brevo) y `FORM_SECRET` con cualquier valor
    largo.
  - `CONSENT_VERSION=1`.
  - `CLINIC_INBOX_EMAIL`, `LEGAL_OWNER_NAME` y `LEGAL_CONTACT_EMAIL` con valores de prueba.

## Puesta en marcha local

```bash
docker compose up -d                 # PostgreSQL 16 y el proveedor de correo falso
npm ci
npm run db:migrate                   # migraciones versionadas (Drizzle)
npm run content:load -- --file content/petcare.yaml
npm run dev                          # http://localhost:3000
```

Resultado esperado: la portada muestra la franja "Web de demostración: PetCare es una clínica
ficticia", el titular de `petcare.yaml` y el aviso de cookies.

## Comprobaciones manuales por historia

| # | Pasos | Resultado esperado |
|---|---|---|
| US1 | Con un ancho de 360 px, abrir `/` y pulsar cada uno de los 6 accesos | Cada uno lleva a su destino en un clic. Reservas, productos y consejos van a `/proximamente/...`. Los botones principales se ven sin hacer scroll. |
| US2 | En 360 px, abrir el menú en cada página, recorrerlo con Tab y cerrarlo con Escape | Están las 5 secciones más "Pide cita" y "Contacto", y el foco vuelve al botón "Menú". |
| US3 | Abrir `/tratamientos` | Cada servicio de `petcare.yaml` aparece con su nombre y su descripción, en el orden del archivo. |
| US4 | Abrir `/la-clinica` | Se ven dirección, horario, "Abierto ahora" o "Cerrado ahora" y el equipo con foto, nombre y especialidad. Sin consentimiento hay un marcador en lugar del mapa. |
| US5 | Enviar un mensaje válido en `/contacto` | Aparece la confirmación. En el buzón falso (`npm run email:fake:list`) hay 1 correo para la clínica y 1 acuse sin el texto del mensaje. |
| US5 | Repetir el envío (doble clic y recarga) | Sigue habiendo un solo mensaje en la base de datos y un solo correo para la clínica. |
| US5 | Escribir un correo inválido | Aparece un error junto al campo, el foco va al campo y no se pierde lo escrito. |
| US6 | Abrir `/preguntas-frecuentes` y desplegar con Enter | Las preguntas aparecen agrupadas por Citas, Tienda y Tu mascota, y se despliegan y repliegan. |
| US7 | Pulsar "Rechazar", recargar y abrir `/la-clinica` | El aviso no vuelve a salir y no hay ninguna petición a `openstreetmap.org`. Tras "Configurar cookies" y "Aceptar", el mapa se carga. |
| US8 | Abrir los cuatro enlaces legales del pie | Cada página muestra su título y su fecha. El aviso legal indica el responsable real y que PetCare es ficticia, sin NIF. |

**Sin JavaScript** (desactivarlo en DevTools): repetir US2, US5 (debe redirigir a
`/contacto/enviado`), US6 y US7. Todo tiene que seguir funcionando.

**Reintento de correo**: con `npm run email:fake -- --fail 3`, enviar un mensaje y ejecutar
`npm run email:dispatch` varias veces. El correo queda `sent` en el cuarto intento.

## Pruebas automáticas

```bash
npm run lint              # ESLint, tsc y check:design (no hay CSS fuera de design/ ni style="")
npm test                  # unitarias: validación, getOpenStatus, límites y esquema de contenido
npm run test:integration  # PostgreSQL real: carga idempotente, outbox, deduplicación y purga
npm run test:e2e          # Playwright: US1–US8, perfil sin JavaScript y axe (WCAG 2.2 AA)
npm run test:lighthouse   # Lighthouse CI en móvil sobre "/" con umbral de rendimiento 90
```

Las cinco órdenes tienen que terminar sin errores, y son las mismas que ejecuta la CI.

## Cambio de clínica (SC-009)

1. Copiar `content/petcare.yaml` como `content/otra.yaml`, cambiar los datos y poner sus imágenes
   en `public/media/otra/`.
2. Ejecutar `npm run content:load -- --file content/otra.yaml`.

Resultado esperado: todas las páginas muestran los datos nuevos sin haber cambiado ningún archivo
de `src/`.

## Despliegue (resumen; la guía completa estará en `deploy/README.md`)

1. En la zona `example.com` de Cloudflare, crear el registro `A` `petcare` hacia el VPS, con proxy
   activado, en modo Full (strict) y sin «Always Use HTTPS» ni «Rocket Loader» (R16).
2. En el VPS, ejecutar `docker compose -f deploy/docker-compose.prod.yml up -d`, añadir el bloque
   de Caddy al Caddyfile compartido y fijar `PETCARE_DOMINIO`.
3. Ejecutar `db:migrate` y `content:load` dentro del contenedor y activar los temporizadores de
   systemd (`email-dispatch`, `retention-purge` y `backup`).
4. Comprobar que `https://petcare.example.com/api/health` responde `200` y que la prueba de IP no se puede
   falsear con `X-Forwarded-For`.
