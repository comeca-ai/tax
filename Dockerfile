# ── Build ──────────────────────────────────────────────────────
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit
COPY . .
RUN npm run build

# ── Runtime ────────────────────────────────────────────────────
# Imagem final mantém deps completas (drizzle-kit + tsx são usados
# no entrypoint para migrar e seedar o banco antes de subir o app)
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --no-audit

COPY --from=build /app/dist ./dist
COPY api ./api
COPY db ./db
COPY contracts ./contracts
COPY drizzle.config.ts tsconfig.json tsconfig.server.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && mkdir -p uploads

EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
