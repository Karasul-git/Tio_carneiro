# ---------- Build ----------
FROM node:22-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY . .
RUN cd apps/server && npx prisma generate
RUN npm run build
# Remove dependências de desenvolvimento e regera o cliente do banco
RUN npm prune --omit=dev && cd apps/server && npx prisma generate

# ---------- Runtime ----------
FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3333 \
    SESSIONS_DIR=/data/sessions \
    WEB_DIST_DIR=/app/apps/web/dist
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/web/dist ./apps/web/dist
VOLUME /data
EXPOSE 3333
WORKDIR /app/apps/server
# Aplica migrações pendentes e sobe a API (que também serve o app web)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
