#!/usr/bin/env bash
# Copia de seguridad diaria de PetCare con pg_dump, rotada a 14 días.
# Lo lanza petcare-backup.timer. Variables: BACKUP_DIR (por defecto /var/backups/petcare).
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_DIR="${BACKUP_DIR:-/var/backups/petcare}"
KEEP_DAYS="${KEEP_DAYS:-14}"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# shellcheck disable=SC1091
set -a; source deploy/.env; set +a
file="$BACKUP_DIR/petcare-$(date +%Y%m%d-%H%M%S).sql.gz"

docker compose -f deploy/docker-compose.prod.yml exec -T petcare-db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$file.tmp"
mv "$file.tmp" "$file"
chmod 600 "$file"

# Feature 008: fotos de producto subidas desde el panel (volumen petcare-uploads).
uploads="$BACKUP_DIR/petcare-uploads-$(date +%Y%m%d-%H%M%S).tar.gz"
docker compose -f deploy/docker-compose.prod.yml exec -T petcare-app   tar -C /app/var/uploads -czf - . > "$uploads.tmp"
mv "$uploads.tmp" "$uploads"
chmod 600 "$uploads"

find "$BACKUP_DIR" -name 'petcare-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'petcare-uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "Copia creada: $file y $uploads"
