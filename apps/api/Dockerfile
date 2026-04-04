# ─── Stage 1: Build ───
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install all dependencies (hoisted to root node_modules)
RUN npm ci

# Copy API source + Prisma schema + config
COPY apps/api/ ./apps/api/

# Generate Prisma client, ensure index.ts exists, then build
WORKDIR /app/apps/api
RUN npx prisma generate --schema=prisma/schema.prisma \
    && test -f generated/prisma/index.ts || echo "export * from './client';" > generated/prisma/index.ts \
    && npx nest build

# ─── Stage 2: Production ───
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/generated ./apps/api/generated
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/src/main"]
