#!/usr/bin/env bash
# Arranca la demo (servidor de producción de Next.js) en segundo plano en el puerto 3000.
# El registro queda en var/petcare.log.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .next/standalone/server.js ]; then
  echo "La demo aún no está compilada: ejecuta bash .devcontainer/setup.sh" >&2
  exit 0
fi
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
  echo "PetCare ya está en marcha en el puerto 3000."
  exit 0
fi

set -a
. ./.env
set +a
export NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1

mkdir -p var
setsid nohup node .next/standalone/server.js > var/petcare.log 2>&1 < /dev/null &
echo "PetCare arrancando en el puerto 3000 (registro en var/petcare.log)…"
for _ in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000/api/health >/dev/null 2>&1; then
    echo "PetCare está listo en el puerto 3000."
    exit 0
  fi
  sleep 1
done
echo "PetCare aún no responde; revisa var/petcare.log." >&2
