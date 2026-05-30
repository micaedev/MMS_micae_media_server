#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== Media Server stack sıfırlanıyor ==="
docker compose down --remove-orphans 2>/dev/null || true
./scripts/cleanup-stacks.sh 2>/dev/null || true
docker compose build --no-cache engine api web
docker compose up -d
echo ""
docker compose ps
echo ""
echo "Health:"
curl -sf http://localhost:8080/api/health | python3 -m json.tool || echo "API henüz hazır değil"
echo ""
echo "Panel: http://localhost:3000"
