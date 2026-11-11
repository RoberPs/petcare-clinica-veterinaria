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

## 5. Caddy compartido

1. Copia `deploy/caddy/petcare.caddy` junto al Caddyfile del chatbot e impórtalo (o pega el bloque).
2. Define `PETCARE_DOMINIO=petcare.automatizacionro.work` en el entorno de Caddy.
3. Recarga Caddy. El snippet `instancia` debe sustituir `X-Forwarded-For` por `CF-Connecting-IP` y
   confiar solo en los rangos de Cloudflare.

## 6. Temporizadores

```bash
sudo cp deploy/systemd/petcare-*.service deploy/systemd/petcare-*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now petcare-email-dispatch.timer petcare-purge.timer petcare-backup.timer
systemctl list-timers 'petcare-*'
```

- `petcare-email-dispatch` (cada minuto): reintenta los correos pendientes (8 intentos en unas 24 h).
- `petcare-purge` (diario): borra los mensajes de más de 12 meses y el registro del límite de más de 24 h.
- `petcare-backup` (diario): `pg_dump` comprimido en `/var/backups/petcare`, rotado a 14 días.

## 7. Comprobaciones

```bash
curl -fsS https://petcare.automatizacionro.work/api/health        # {"ok":true}
curl -sI https://petcare.automatizacionro.work/ | grep -i content-security-policy
deploy/prueba-ip.sh https://petcare.automatizacionro.work          # el 6.º envío queda limitado
```

`prueba-ip.sh` crea 5 mensajes reales y envía sus correos: hazla una vez tras el despliegue o tras
cambiar Caddy. Por último, envía un mensaje desde `/contacto` y comprueba que llegan el correo a
la clínica y el acuse.
