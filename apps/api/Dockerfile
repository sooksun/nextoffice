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

# Generate Prisma client + build
WORKDIR /app/apps/api
RUN npx prisma generate \
    && echo "=== pwd ===" && pwd \
    && echo "=== find generated ===" \
    && find /app -path "*/generated*" -type f 2>/dev/null | head -30 \
    && echo "=== ls generated/ ===" \
    && ls -la generated/ 2>&1 || true \
    && ls -la generated/prisma/ 2>&1 || true

# ─── Stage 2: Production (placeholder until build works) ───
FROM node:20-alpine AS runner
WORKDIR /app
CMD ["echo", "build incomplete"]
