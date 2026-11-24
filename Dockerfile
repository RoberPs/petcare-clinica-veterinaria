# Imagen de producción de PetCare: Next.js standalone + scripts de operación compilados (cli/*.mjs).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next/font descarga Figtree en la compilación y la sirve desde el propio dominio.
RUN npm run build && node scripts/build-cli.mjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S petcare && adduser -S petcare -G petcare
COPY --from=build --chown=petcare:petcare /app/.next/standalone ./
COPY --from=build --chown=petcare:petcare /app/.next/static ./.next/static
COPY --from=build --chown=petcare:petcare /app/public ./public
COPY --from=build --chown=petcare:petcare /app/cli ./cli
COPY --from=build --chown=petcare:petcare /app/drizzle ./drizzle
COPY --from=build --chown=petcare:petcare /app/content ./content
# Fotos subidas desde el panel (feature 008, G4): el volumen petcare-uploads se monta aquí y
# hereda el propietario del directorio de la imagen la primera vez.
RUN mkdir -p /app/var/uploads/productos && chown -R petcare:petcare /app/var
USER petcare
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
