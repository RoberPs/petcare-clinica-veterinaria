# Despliegue de PetCare

Guía paso a paso para publicar la web en `petcare.automatizacionro.work`, en el VPS compartido del
chatbot (Docker Compose detrás de su Caddy) y con Cloudflare delante. Las decisiones están en
[research.md, R16](../specs/001-public-clinic-website/research.md).

## 1. Cloudflare (zona `automatizacionro.work`)

1. **DNS**: registro `A` con nombre `petcare` hacia la IPv4 del VPS, **con proxy** (nube naranja).
   No crees registro `AAAA`. El subdominio tiene que ser de **un solo nivel**: el certificado
   gratuito de Cloudflare no cubre `a.b.automatizacionro.work`.
2. **SSL/TLS**: modo **Full (strict)**.
3. **Apaga** «Always Use HTTPS» (rompe el desafío HTTP-01 de Caddy), «Rocket Loader» y «Email
   Address Obfuscation» (inyectan scripts que la CSP bloquea).
4. Si al principio sale un **error 526** (Caddy todavía no tiene certificado), crea una
   *Configuration Rule* temporal con SSL «Full» solo para `petcare.automatizacionro.work`, espera a
   que Caddy emita el certificado y bórrala.

## 2. Brevo

1. Añade y **verifica el dominio** del remitente: registros SPF y DKIM (y DMARC si no existe) en
   Cloudflare, sin proxy (son TXT/CNAME).
2. Crea una **clave de API dedicada** a este proyecto y guárdala solo en `deploy/.env`.
3. Si tienes activo el bloqueo de claves por IP, autoriza la IPv4 del VPS.

## 3. Entorno en el VPS

```bash
sudo mkdir -p /opt/petcare && sudo chown "$USER" /opt/petcare
git clone <repositorio> /opt/petcare && cd /opt/petcare
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env
# Rellena deploy/.env: contraseñas, BREVO_API_KEY, FORM_SECRET (openssl rand -base64 48),
# el teléfono y el buzón del responsable y TRUSTED_PROXY_IPS (IP de Caddy en chatbot_proxy):
docker network inspect chatbot_proxy --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

## 4. Arranque, migración y contenido

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml exec petcare-app node cli/migrate.mjs
docker compose -f deploy/docker-compose.prod.yml exec petcare-app node cli/content-load.mjs --file content/petcare.yaml
```

Para cambiar el contenido: edita `content/petcare.yaml`, reconstruye la imagen (o copia el archivo
al contenedor) y repite `content-load`. Los cambios se ven al momento (no hay caché que invalidar).

### Actualizar a la feature 002 (cuentas de cliente y mascotas)

1. Reconstruye la imagen (`up -d --build`): añade `@node-rs/argon2`, que trae binarios para Alpine.
2. Aplica la migración `0001_client_accounts` con `cli/migrate.mjs`. Crea las tablas de cuentas,
   sesiones, enlaces, especies y mascotas, y generaliza `email_outbox`. No toca los datos de la 001.
3. Recarga el contenido con `cli/content-load.mjs`: carga las `species` y pone `cuenta.href` a
   `/mi-cuenta` (el enlace "Mi cuenta" deja de llevar a "Próximamente"). La política de privacidad y
   la de cookies suben de versión.
4. Comprueba que `SITE_URL` es la URL `https://` pública: con ella se construyen los enlaces de los
   correos de cuenta y la cookie `pc_session` lleva `Secure`. No hay variables nuevas obligatorias.

Si se quita una especie del YAML, sus mascotas pasan a "Otra"; `content-load` avisa de cuántas.

### Actualizar a la feature 003 (reserva de citas)

1. Haz una copia de seguridad (`deploy/backup.sh`).
2. Aplica la migración `0002_appointments` con `cli/migrate.mjs`. Empieza por
   `CREATE EXTENSION IF NOT EXISTS btree_gist` (extensión *trusted*: la crea el dueño de la base de
   datos sin superusuario; la imagen oficial `postgres:16` ya la trae) y añade las tablas de citas
   y la restricción `appointments_no_overlap`, que impide dos citas solapadas del mismo profesional.
   Comprobado en local (desarrollo 5434 y pruebas 5433, `postgres:16`): `btree_gist` 1.7.
3. Recarga el contenido con `cli/content-load.mjs`: carga el bloque `booking:` (reglas, servicios
   reservables y qué profesional atiende cada uno) y pone `reservas.href` a `/pide-cita`, así que
   "Pide cita", "Mis citas" y "Pedir cita" dejan de llevar a "Próximamente". La carga nunca toca
   las citas: un servicio que desaparece del YAML solo deja de ofrecerse. Para desactivar la reserva
   online, pon `reservas.href: null` y vuelve a cargar.
4. No hay variables nuevas. `FORM_SECRET` firma también los enlaces de gestión que recibe la clínica
   en su correo y la referencia de la página de confirmación: **si lo cambias, los enlaces de gestión
   de los correos ya enviados dejan de valer** (las citas siguen; se gestionan llamando o desde
   "Mis citas").
5. Temporizadores: no hay ninguno nuevo. `petcare-email-dispatch` (cada minuto) encola también los
   recordatorios de cita (24 h antes, `reminder_hours_before`) y `petcare-purge` anonimiza las citas de
   invitado de más de `retention_months` (12) y borra sus correos ya enviados a las 24 h.

### Actualizar a la feature 005 (carrito y pago)

1. Haz una copia de seguridad (`deploy/backup.sh`).
2. Aplica la migración `0004_cart_checkout` con `cli/migrate.mjs`: carritos, pedidos, pagos, avisos
   de la pasarela, códigos de descuento y métodos de envío. Sin dependencias ni extensiones nuevas.
3. Variables nuevas en `deploy/.env`:
   - `PAYMENT_PROVIDER=stripe` (o `fake` para una demo sin claves, que además exige
     `PAYMENT_FAKE_ALLOWED=true`, porque en producción `fake` está prohibido por defecto).
   - `STRIPE_SECRET_KEY`: la clave secreta **de pruebas** (`sk_test_…`). Nunca una `sk_live_…`.
   - `STRIPE_WEBHOOK_SECRET`: el secreto de firma del webhook (`whsec_…`, paso 4).
   - `SITE_URL`: la URL pública (`https://petcare.automatizacionro.work`). Con ella se construyen las
     vueltas de la pasarela y los enlaces de los correos de pedido.
4. Webhook de Stripe, en el panel de Stripe **en modo de pruebas** (Desarrolladores → Webhooks):
   - URL: `https://petcare.automatizacionro.work/api/pagos/webhook`.
   - Eventos: `checkout.session.completed`, `checkout.session.expired` y `charge.refunded`.
   - Copia el secreto de firma en `STRIPE_WEBHOOK_SECRET` y reinicia `petcare-app`.
   - Si un aviso se pierde, `petcare-orders-maintain` concilia las sesiones abiertas de más de 5 minutos
     consultando a Stripe, así que el pedido no se queda colgado.
5. Recarga el contenido con `cli/content-load.mjs`: carga el bloque `checkout:` (métodos de envío y de
   pago, códigos de descuento y plazos) y pone `carrito.href` a `/carrito`, que activa la compra. Para
   desactivarla, pon `carrito.href: null` y vuelve a cargar: el catálogo sigue visible sin comprar.
6. `FORM_SECRET` firma también los enlaces privados de pedido de invitado (90 días desde el último
   cambio) y la referencia de la vuelta de la pasarela: **si lo cambias, los enlaces de pedido de los
   correos ya enviados dejan de valer** (los pedidos siguen; se consultan con `cli/orders.mjs`).
7. Temporizador nuevo `petcare-orders-maintain` (sección 6).

### Actualizar a la feature 006 (consejos de salud y boletín)

1. Haz una copia de seguridad (`deploy/backup.sh`).
2. Aplica la migración `0005_health_tips_newsletter` con `cli/migrate.mjs`: categorías y
   publicaciones, suscripciones al boletín, constancias de baja y ajustes del boletín. Da de alta en
   el boletín, como confirmados, a los clientes que ya tenían marcada la preferencia "consejos y
   novedades" y el correo verificado (versión de la política `previa`). Es idempotente.
3. Secreto nuevo en `deploy/.env`: `NEWSLETTER_HASH_KEY` (32 bytes aleatorios en base64:
   `openssl rand -base64 32`). Firma la huella anónima del correo en las constancias de baja. **No
   lo cambies**: las constancias ya guardadas dejarían de poder compararse. Solo es obligatorio con
   el boletín activo; si falta, `cli/content-load.mjs` falla al cargar `newsletter.enabled: true`.
4. Recarga el contenido con `cli/content-load.mjs`: carga las categorías, los artículos y noticias,
   el bloque `newsletter:` y la página legal `boletin`, y pone `consejos.href` a `/consejos`. Las
   publicaciones con fecha futura aparecen solas ese día a las 00:00 (`Europe/Madrid`).
5. `FORM_SECRET` firma también los enlaces de baja del boletín (clave derivada): **si lo cambias, los
   enlaces de baja de los correos ya enviados dejan de valer** (la baja de un clic y "Datos
   personales" siguen funcionando).
6. No hay temporizadores nuevos: `petcare-purge` borra también las suscripciones sin confirmar de más
   de 30 días y las constancias de baja de más de 3 años (sección 6).

### Actualizar a la feature 007 (panel de administración de la agenda)

1. Haz una copia de seguridad (`deploy/backup.sh`).
2. Aplica la migración `0006_admin_agenda` con `cli/migrate.mjs`. Añade el rol de administrador,
   el horario por veterinario, los bloqueos, el historial de cada cita y el registro de acciones del
   panel. Marca como reservables a los profesionales que ya atendían algún servicio y les copia el
   horario de la clínica, así que la reserva pública ofrece las mismas horas que antes.
3. **`content:load` ya no sobrescribe la agenda.** Desde esta feature el YAML solo siembra: crea los
   servicios reservables y los profesionales nuevos, pero no cambia los que ya existen (nombre,
   duración, reservable, servicios que atiende ni horario), porque se gestionan en `/admin`. La ficha
   pública del equipo (especialidad, foto, orden y publicado), el horario general, los cierres y las
   reglas de reserva siguen saliendo del YAML. Para volver a dejarlo todo como en el YAML (por
   ejemplo, al poner en marcha una clínica nueva) usa `--force-booking`: sobrescribe servicios y
   profesionales y **borra los horarios por veterinario y los bloqueos** del panel.
4. Da el rol al primer administrador (la cuenta tiene que existir y tener el correo verificado):

   ```bash
   docker compose -f deploy/docker-compose.prod.yml exec -T petcare-app node cli/admin.mjs grant <correo> --by "<quién>"
   ```

5. No hay temporizadores nuevos.

### Actualizar a la feature 008 (panel de administración de la tienda)

1. Haz una copia de seguridad (`deploy/backup.sh`).
2. Añade `UPLOADS_DIR=/app/var/uploads` (ya lo fija `docker-compose.prod.yml`) y recrea el
   contenedor: el volumen nuevo **`petcare-uploads`** guarda las fotos de producto subidas desde
   `/admin/productos` (tres anchos WebP por foto, sin metadatos). La imagen crea el directorio con
   propietario `petcare`; el volumen lo hereda la primera vez. `deploy/backup.sh` lo copia cada día
   en `petcare-uploads-*.tar.gz`, junto al `pg_dump`. Para restaurarlo:
   `docker compose -f deploy/docker-compose.prod.yml exec -T petcare-app tar -C /app/var/uploads -xzf - < petcare-uploads-AAAAMMDD-HHMMSS.tar.gz`.
3. Aplica la migración `0007_admin_store` con `cli/migrate.mjs`. Añade el historial de stock
   (`stock_movements`, con un movimiento inicial por producto con su stock de hoy), las dimensiones
   de las fotos, el autor de cada cambio de estado de un pedido y el correo `order_status`.
4. **`content:load` ya no sobrescribe la tienda.** Sin `--force-shop`, el YAML solo crea los
   productos y códigos de descuento que faltan (cada producto nuevo, con su movimiento de stock
   inicial): no cambia precio, stock, foto ni estado de los existentes, no despublica los productos
   creados en el panel ni desactiva sus códigos. Categorías, mascotas, ajustes de la tienda, envío y
   formas de pago se siguen sobrescribiendo siempre. Para volver a dejar la tienda como en el YAML
   usa `--force-shop`: restaura productos y stock (cada cambio de stock deja un movimiento
   `content_load`), despublica los productos que no están en el archivo y desactiva sus códigos.
   Las fotos subidas que se sustituyen se quedan en el volumen.
5. **`cli/orders.mjs` ahora avisa al comprador**: cualquier cambio a pagado, en preparación,
   enviado, listo para recoger o entregado hecho por la clínica encola el correo `order_status`,
   igual que desde el panel. En el historial del pedido aparece como "Clínica (CLI)".
6. No hay temporizadores nuevos.

### Administradores del panel (`cli/admin.mjs`)

```bash
alias admin='docker compose -f deploy/docker-compose.prod.yml exec -T petcare-app node cli/admin.mjs'
admin list                                  # administradores y desde cuándo
admin grant recepcion@clinica.example --by "Nombre de quien lo autoriza"
admin revoke recepcion@clinica.example --by "Nombre de quien lo autoriza"
```

Códigos de salida: 0 bien (o nada que hacer), 1 error inesperado, 2 uso incorrecto (falta `--by` o
el correo no es válido) y 3 la cuenta no existe o no está verificada. Retirar el rol surte efecto en
la siguiente petición de esa persona. Cada cambio queda en `admin_audit_log` con el `--by`.

### Gestión de pedidos desde el VPS (`cli/orders.mjs`)

Desde la feature 008 los pedidos se gestionan en `/admin/pedidos`; la CLI sigue disponible desde el
VPS y comparte las mismas reglas de estado (y los mismos correos al comprador):

```bash
cd /opt/petcare
alias pedidos='docker compose -f deploy/docker-compose.prod.yml exec -T petcare-app node cli/orders.mjs'
pedidos list                                # últimos pedidos (--status paid, --limit 50)
pedidos show PC-000123                      # detalle con los datos del comprador e historial
pedidos set-status PC-000123 shipped        # preparing, shipped, ready_for_pickup, delivered
pedidos deliver PC-000123                   # entrega (y cobro, si se pagaba en la clínica)
pedidos cancel PC-000123 --note "sin stock" # cancela; si estaba pagado, reembolsa
```

Códigos de salida: 0 bien, 1 uso incorrecto, 2 transición no permitida y 3 pedido inexistente. Los
correos que genera un cambio de estado los envía `petcare-email-dispatch` en el minuto siguiente. La
salida incluye datos del comprador: no la pegues en tickets ni en chats.

## 5. Caddy compartido

1. Copia `deploy/caddy/petcare.caddy` junto al Caddyfile del chatbot e impórtalo (o pega el bloque).
2. Define `PETCARE_DOMINIO=petcare.automatizacionro.work` en el entorno de Caddy.
3. Recarga Caddy. El snippet `instancia` debe sustituir `X-Forwarded-For` por `CF-Connecting-IP` y
   confiar solo en los rangos de Cloudflare.

## 6. Temporizadores

```bash
sudo cp deploy/systemd/petcare-*.service deploy/systemd/petcare-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now petcare-email-dispatch.timer petcare-orders-maintain.timer petcare-purge.timer petcare-backup.timer
systemctl list-timers 'petcare-*'
```

- `petcare-email-dispatch` (cada minuto): reintenta los correos pendientes (8 intentos en unas 24 h).
  Desde la feature 003, al principio de cada pasada encola los recordatorios de cita que tocan. Tiene
  que ejecutarse al menos cada 15 minutos para que el recordatorio salga a su hora.
- `petcare-purge` (diario): borra los mensajes de más de 12 meses y el registro del límite de más de 24 h.
  Desde la feature 002, en el mismo temporizador, también las cuentas sin verificar de más de 7 días,
  las sesiones y los enlaces caducados, y los envíos procesados y correos de cuenta de más de 24 h.
  Desde la feature 003, también anonimiza las citas de invitado de más de 12 meses (`retention_months`)
  y borra los correos de cita ya enviados de más de 24 h.
- `petcare-orders-maintain` (cada minuto, feature 005): concilia los pagos abiertos de más de 5
  minutos, caduca los pedidos vencidos (tarjeta: reserva de 30 min + 2 de margen; pago en clínica: fin
  del plazo de recogida), libera su stock y reintenta los reembolsos pendientes. Solo escribe contadores
  en el log.
- Desde la feature 005, `petcare-purge` borra también los carritos de invitado sin cambios en 30 días,
  los avisos de la pasarela de más de 90 días y los correos de pedido cerrados de más de 24 h, y
  anonimiza los pedidos de más de 6 años (conserva importes y líneas).
- Desde la feature 006, `petcare-purge` borra también las suscripciones al boletín sin confirmar de
  más de 30 días y las constancias de baja anónimas de más de 3 años.
- `petcare-backup` (diario): `pg_dump` comprimido en `/var/backups/petcare`, rotado a 14 días. Desde
  la feature 008 copia también el volumen `petcare-uploads` (fotos de producto) en
  `petcare-uploads-*.tar.gz`, con la misma rotación.

## 7. Comprobaciones

```bash
curl -fsS https://petcare.automatizacionro.work/api/health        # {"ok":true}
curl -sI https://petcare.automatizacionro.work/ | grep -i content-security-policy
deploy/prueba-ip.sh https://petcare.automatizacionro.work          # el 6.º envío queda limitado
deploy/prueba-ip.sh https://petcare.automatizacionro.work <IP_DEL_VPS>   # sin pasar por Cloudflare
curl -sI https://petcare.automatizacionro.work/ | grep -i strict-transport-security
```

`prueba-ip.sh` crea 5 mensajes reales y envía sus correos: hazla una vez tras el despliegue o tras
cambiar Caddy. Con la IP del VPS, conecta al origen sin pasar por Cloudflare: lo correcto es que el
origen no responda (443 abierto solo a los rangos de Cloudflare) o que el límite se mantenga. Si
falla, la app confía en un `X-Forwarded-For` o `CF-Connecting-IP` falseado y se saltan todos los
límites por origen. Si no sale `Strict-Transport-Security`, actívalo en Cloudflare (SSL/TLS → Edge
Certificates → HSTS). Por último, envía un mensaje desde `/contacto` y comprueba que llegan el
correo a la clínica y el acuse.

Los contenedores tienen límites de memoria y CPU (`PETCARE_APP_MEM`, `PETCARE_APP_CPUS`,
`PETCARE_DB_MEM`, `PETCARE_DB_CPUS` en `deploy/.env`; por defecto 768m, 1 CPU, 512m y 1 CPU) y
logs rotados (3 × 10 MB), para no afectar al chatbot del mismo VPS. `docker stats` muestra el
consumo real.

## 8. Limitaciones conocidas de la demo

La auditoría de seguridad posterior a la feature 008 no encontró fallos críticos ni altos. Antes de
desplegar se corrigieron la redirección abierta en `return_to`, los mensajes de error con datos
personales en los logs y el reloj de pruebas en producción, y se añadieron límites a los
contenedores. Quedan, aceptados por tratarse de una demo sin datos de valor:

- **Registro repetido de una cuenta sin verificar**: gana el último registro (también su
  contraseña). Una cuenta real debería pedir la contraseña al confirmar el correo.
- **Límites de intentos**: se comprueban y se apuntan por separado, así que peticiones en paralelo
  prueban algunas contraseñas o códigos de más; y el bloqueo por cuenta (5 fallos en 15 min) lo
  puede provocar quien conozca el correo.
- **Copias de seguridad** sin cifrar y en el mismo VPS: si se pierden, la demo se vuelve a cargar
  con `content:load`.
- **Sesión del administrador** igual que la del cliente (hasta 30 días con «Recordarme»).
- **Endurecimiento pendiente**: imágenes Docker y acciones de GitHub sin fijar por SHA, red
  `chatbot_proxy` compartida con el otro proyecto, `bodySizeLimit` de 6 MB para todas las Server
  Actions y HSTS delegado en Cloudflare.
