#!/bin/bash
# Quick redeploy — rebuilds api + web with correct build-time env vars
# Usage: bash redeploy.sh [api|web|all]
set -euo pipefail

APP_DIR="/DATA/AppData/www/nextoffice"
cd "$APP_DIR"

ENV_FILE=".env.production"
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE not found"
    exit 1
fi

# Export build-time vars (NEXT_PUBLIC_* must be baked in at docker build)
_gcid=$(grep -E '^[[:space:]]*GOOGLE_CLIENT_ID=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//" | tr -d '\r')
[ -n "$_gcid" ] && export GOOGLE_CLIENT_ID="$_gcid"

_pub_url=$(grep -E '^[[:space:]]*PUBLIC_API_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2- | sed "s/^['\"]//;s/['\"]$//" | tr -d '\r')
[ -n "$_pub_url" ] && export PUBLIC_API_URL="$_pub_url"

echo "GOOGLE_CLIENT_ID : ${GOOGLE_CLIENT_ID:+set (${#GOOGLE_CLIENT_ID} chars)}"
echo "PUBLIC_API_URL   : ${PUBLIC_API_URL:-<not set>}"

git pull origin main

TARGET="${1:-all}"
if [ "$TARGET" = "all" ]; then
    docker compose up -d --build
elif [ "$TARGET" = "api" ]; then
    docker compose up -d --build api
elif [ "$TARGET" = "web" ]; then
    docker compose up -d --build web
else
    echo "Usage: bash redeploy.sh [api|web|all]"
    exit 1
fi

echo "Done."
