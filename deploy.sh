#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════
#  NextOffice — Production Deploy Script
#  Target: Ubuntu Linux @ /DATA/AppData/www/nextoffice
# ═══════════════════════════════════════════════════

APP_DIR="/DATA/AppData/www/nextoffice"
REPO_URL="https://github.com/sooksun/nextoffice.git"
BRANCH="main"

echo "══════════════════════════════════════════"
echo "  NextOffice Production Deploy"
echo "══════════════════════════════════════════"

# ─── 1. ตรวจสอบ Docker ───
if ! command -v docker &>/dev/null; then
    echo "[1/7] Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. Please log out/in and re-run this script."
    exit 0
else
    echo "[1/7] Docker: $(docker --version)"
fi

if ! docker compose version &>/dev/null; then
    echo "ERROR: docker compose plugin not found. Install it first."
    exit 1
fi

# ─── 2. Clone หรือ Pull repo ───
if [ -d "$APP_DIR/.git" ]; then
    echo "[2/7] Pulling latest code..."
    cd "$APP_DIR"
    git pull origin "$BRANCH"
else
    echo "[2/7] Cloning repository..."
    sudo mkdir -p "$APP_DIR"
    sudo chown "$USER":"$USER" "$APP_DIR"
    git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

# ─── 3. ตรวจสอบ .env.production ───
if [ ! -f "$APP_DIR/.env.production" ]; then
    echo ""
    echo "ERROR: .env.production not found!"
    echo "Copy the template and fill in your secrets:"
    echo ""
    echo "  cp .env.production.example .env.production"
    echo "  nano .env.production"
    echo ""
    exit 1
fi

echo "[3/7] .env.production found"

# ─── 4. สร้าง database ถ้ายังไม่มี (export MYSQL_ROOT_PASSWORD ก่อนรัน หรือสร้าง DB เอง) ───
echo "[4/7] Ensuring database exists on 192.168.1.4..."
if [ -n "${MYSQL_ROOT_PASSWORD:-}" ]; then
    docker run --rm --network host mariadb:11 \
        mariadb -h 192.168.1.4 -u root -p"$MYSQL_ROOT_PASSWORD" \
        -e "CREATE DATABASE IF NOT EXISTS nextoffice_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
        2>/dev/null || echo "  (database may already exist or host unreachable — check manually)"
else
    echo "  Skipped: set MYSQL_ROOT_PASSWORD or create nextoffice_db manually on the DB host."
fi

# ─── 5. Open firewall ports ───
if command -v ufw &>/dev/null; then
    sudo ufw allow 9910/tcp comment "NextOffice Web" 2>/dev/null || true
    sudo ufw allow 9911/tcp comment "NextOffice API" 2>/dev/null || true
fi

# ─── 6. Build Docker images ───
echo "[5/7] Building Docker images..."
docker compose build --no-cache

# ─── 6. Run Prisma migrations ───
echo "[6/7] Running Prisma db push..."
# Extract DATABASE_URL from .env.production and pass it explicitly
DB_URL=$(grep -E '^DATABASE_URL=' .env.production | cut -d'=' -f2-)
if [ -n "$DB_URL" ]; then
    docker compose run --rm -e "DATABASE_URL=$DB_URL" api sh -c "npx prisma db push" || {
        echo "  Prisma db push failed — run manually:"
        echo "  docker compose exec api sh -c \"DATABASE_URL='$DB_URL' npx prisma db push\""
    }
else
    echo "  WARNING: DATABASE_URL not found in .env.production"
    echo "  Run manually: docker compose exec api sh -c \"DATABASE_URL='...' npx prisma db push\""
fi

# ─── 7. Start services ───
echo "[7/7] Starting all services..."
docker compose up -d

# ─── สร้าง MinIO bucket ───
echo ""
echo "Creating MinIO bucket (if needed)..."
sleep 3
docker compose exec minio sh -c "
    mc alias set local http://localhost:9000 \${MINIO_ROOT_USER} \${MINIO_ROOT_PASSWORD} 2>/dev/null
    mc mb local/nextoffice --ignore-existing 2>/dev/null
" || echo "  (MinIO bucket creation skipped — create manually via http://SERVER:9001)"

echo ""
echo "══════════════════════════════════════════"
echo "  Deploy complete!"
echo "══════════════════════════════════════════"
echo ""
echo "  Web:        http://$(hostname -I | awk '{print $1}'):9910"
echo "  API:        http://$(hostname -I | awk '{print $1}'):9911"
echo "  API Docs:   http://$(hostname -I | awk '{print $1}'):9911/api/docs"
echo "  MinIO:      http://$(hostname -I | awk '{print $1}'):9001"
echo "  Database:   192.168.1.4:3306/nextoffice_db"
echo ""
echo "  Logs:       docker compose logs -f"
echo "  Stop:       docker compose down"
echo "  Restart:    docker compose restart"
echo ""
