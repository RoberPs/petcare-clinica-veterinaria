#!/usr/bin/env bash
# Prepara la demo la primera vez que se crea el codespace: dependencias, .env, base de datos,
# contenido de la clínica ficticia, cuentas de demostración y compilación de producción.
set -euo pipefail
cd "$(dirname "$0")/.."

# En los devcontainer con Compose, las variables de Codespaces no siempre llegan a este proceso.
if [ -z "${CODESPACE_NAME:-}" ] && [ -f /workspaces/.codespaces/shared/.env ]; then
  set -a; . /workspaces/.codespaces/shared/.env; set +a
fi

npm ci

if [ ! -f .env ]; then
  if [ -n "${CODESPACE_NAME:-}" ]; then
    site_url="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
  else
    site_url="http://localhost:3000"
  fi
  secret() { node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"; }
  cat > .env <<EOF
# Generado por .devcontainer/setup.sh para la demo. Ningún dato es real.
DATABASE_URL=postgres://petcare:petcare@db:5432/petcare
EMAIL_PROVIDER=fake
FAKE_EMAIL_URL=http://email-fake:8025
EMAIL_FROM="PetCare <no-responder@example.com>"
FORM_SECRET=$(secret)
NEWSLETTER_HASH_KEY=$(secret)
CONSENT_VERSION=1
CLINIC_INBOX_EMAIL=clinica@example.com
CLINIC_PHONE_E164=+34600000000
CLINIC_PHONE_DISPLAY="600 000 000"
LEGAL_OWNER_NAME="la persona que ejecuta esta instancia de demostración"
LEGAL_CONTACT_EMAIL=privacidad@example.com
TRUSTED_PROXY_IPS=
SITE_URL=${site_url}
PAYMENT_PROVIDER=fake
PAYMENT_FAKE_ALLOWED=true
UPLOADS_DIR=$(pwd)/var/uploads
PETCARE_DEMO=1
EOF
fi

mkdir -p var/uploads
npm run db:migrate
npm run content:load -- --file content/petcare.yaml
npm run demo:seed
# Envía al correo falso los correos de las citas y los pedidos de ejemplo (puerto 8025, /emails).
npm run email:dispatch

# Compilación de producción (más rápida de navegar que el modo de desarrollo), como en el Dockerfile.
npm run build
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
