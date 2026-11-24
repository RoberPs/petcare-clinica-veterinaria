#!/usr/bin/env bash
# Comprueba que falsear X-Forwarded-For NO permite saltarse el límite de envíos (5 cada 10 min por IP)
# a través de Cloudflare y Caddy. Uso: deploy/prueba-ip.sh https://petcare.example.com [IP_DEL_VPS]
#
# Con IP_DEL_VPS, conecta directamente al origen (sin pasar por Cloudflare), que es como un atacante
# intentaría falsear CF-Connecting-IP. Lo correcto es que el origen rechace la conexión (443 abierto
# solo a Cloudflare) o, si responde, que el límite se siga aplicando.
#
# Hace 6 envíos del formulario, cada uno con un X-Forwarded-For distinto. Si la app usa la IP real
# (CF-Connecting-IP), el sexto debe dar "Has enviado varios mensajes seguidos". ATENCIÓN: crea 5
# mensajes reales en la base de datos y envía 5 correos al buzón de la clínica.
set -euo pipefail

BASE="${1:?Uso: $0 https://<dominio> [IP_DEL_VPS]}"
ORIGIN_IP="${2:-}"
resolve=()
if [ -n "$ORIGIN_IP" ]; then
  host="${BASE#https://}"; host="${host%%/*}"
  resolve=(--resolve "$host:443:$ORIGIN_IP")
  if ! curl -fsS -o /dev/null --max-time 10 "${resolve[@]}" "$BASE/api/health" 2>/dev/null; then
    echo "OK: el origen no responde directamente (solo es accesible a través de Cloudflare)."; exit 0
  fi
  echo "AVISO: el origen responde sin pasar por Cloudflare. Se comprueba que el límite se mantiene."
fi
jar="$(mktemp)"; trap 'rm -f "$jar"' EXIT

for i in 1 2 3 4 5 6; do
  page="$(curl -fsS "${resolve[@]}" -c "$jar" -b "$jar" "$BASE/contacto")"
  token="$(printf '%s' "$page" | grep -o 'name="submission_token" value="[^"]*"' | sed 's/.*value="//; s/"$//')"
  action="$(printf '%s' "$page" | grep -o 'name="\$ACTION_ID_[^"]*"' | head -1 | sed 's/name="//; s/"$//')"
  [ -n "$token" ] && [ -n "$action" ] || { echo "No se ha podido leer el formulario"; exit 1; }
  sleep 4
  status="$(curl -s "${resolve[@]}" -o /tmp/petcare-prueba-ip.html -w '%{http_code}' -c "$jar" -b "$jar" \
    -H "Origin: $BASE" -H "X-Forwarded-For: 203.0.113.$i" -H "CF-Connecting-IP: 198.51.100.$i" \
    -F "$action=" -F "submission_token=$token" -F "nombre=Prueba IP $i" -F "email=prueba-ip-$i@example.com" \
    -F "motivo=otro" -F "mensaje=Prueba automática del límite por IP ($i)." -F "privacidad=on" -F "web=" \
    "$BASE/contacto")"
  if grep -q 'Has enviado varios mensajes seguidos' /tmp/petcare-prueba-ip.html; then
    if [ "$i" -eq 6 ]; then echo "OK: el sexto envío queda limitado aunque cambie X-Forwarded-For."; exit 0; fi
    echo "Límite alcanzado antes de tiempo (envío $i): revisa si hay envíos previos en los últimos 10 minutos."; exit 1
  fi
  echo "Envío $i: HTTP $status"
done
echo "FALLO: el límite no se ha aplicado. La app confía en un X-Forwarded-For falseado."
exit 1
