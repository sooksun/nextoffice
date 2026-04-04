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

# Generate Prisma client + build NestJS in single layer
WORKDIR /app/apps/api
RUN npx prisma generate \
    && echo "=== Generated files ===" \
    && find generated -type f 2>/dev/null | head -20 || true \
    && find /app/node_modules/.prisma -type f 2>/dev/null | head -10 || true \
    && echo "=== Building NestJS ===" \
    && npx nest build

# ─── Stage 2: Production ───
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy root workspace files
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy built output + Prisma generated client
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/generated ./apps/api/generated
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api

EXPOSE 3000

CMD ["node", "dist/main"]
