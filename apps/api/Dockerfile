# ─── Stage 1: Build ───
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Windows lockfile misses Alpine/musl native binaries — use npm install
RUN rm -f package-lock.json && npm install --legacy-peer-deps

# Copy API source + Prisma schema
COPY apps/api/ ./apps/api/

# Generate Prisma client, compile app + seeds
WORKDIR /app/apps/api
RUN npx prisma generate --schema=prisma/schema.prisma \
    && test -f generated/prisma/index.ts || echo "export * from './client';" > generated/prisma/index.ts \
    && npx nest build \
    && npx tsc --project tsconfig.seed.json 2>&1 || echo "Seed compile warnings (non-fatal)"

# ─── Stage 2: Production ───
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Production deps only — also use npm install for platform compat
RUN rm -f package-lock.json && npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/generated ./apps/api/generated
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.js ./apps/api/prisma.config.js

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "--max-old-space-size=4096", "--expose-gc", "dist/src/main"]
