#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== Docker servisleri ==="
docker compose ps

echo ""
echo "=== API health ==="
curl -sS http://localhost:8080/api/health || echo "API erişilemiyor"

echo ""
echo "=== MediaMTX API ==="
curl -sS http://localhost:9997/v3/config/global/get | head -c 200 || echo "MediaMTX API erişilemiyor"
echo ""

echo ""
echo "=== Son API logları ==="
docker compose logs api --tail 30

echo ""
echo "=== Son MediaMTX logları ==="
docker compose logs mediamtx --tail 30
