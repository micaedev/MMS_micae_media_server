#!/usr/bin/env bash
# Tam sıfırlama: SQLite (api-data), data/videos, kod = GitHub v1.03
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

echo "==> Durduruluyor (volume'lar dahil: api-data / SQLite silinir)..."
docker compose down -v --remove-orphans 2>/dev/null || true

echo "==> data/videos temizleniyor..."
mkdir -p data/videos
find data/videos -mindepth 1 -delete 2>/dev/null || true
touch data/videos/.gitkeep 2>/dev/null || true

echo "==> .env yedekleniyor..."
if [[ -f .env ]]; then
  cp -a .env ".env.backup.$(date +%Y%m%d-%H%M%S)"
fi

echo "==> GitHub v1.03 alınıyor..."
git fetch origin tag v1.03 --no-tags
git checkout -f v1.03

echo "==> .env (MEDIASERVER_PUBLIC_HOST korunarak)..."
PUB=""
LATEST_BACKUP="$(ls -t .env.backup.* 2>/dev/null | head -1 || true)"
if [[ -n "$LATEST_BACKUP" ]]; then
  PUB="$(grep -m1 '^MEDIASERVER_PUBLIC_HOST=' "$LATEST_BACKUP" | cut -d= -f2- || true)"
fi
if [[ -z "$PUB" && -f .env ]]; then
  PUB="$(grep -m1 '^MEDIASERVER_PUBLIC_HOST=' .env | cut -d= -f2- || true)"
fi
cp -f .env.example .env
if [[ -n "$PUB" ]]; then
  sed -i "s/^MEDIASERVER_PUBLIC_HOST=.*/MEDIASERVER_PUBLIC_HOST=${PUB}/" .env
fi

echo "==> Docker imajları yeniden derleniyor..."
docker compose build --no-cache
docker compose up -d

echo ""
echo "Tamam. Sürüm: $(cat VERSION)"
echo "  Web:    http://127.0.0.1:3000"
echo "  API:    curl -s http://127.0.0.1:8080/api/health"
echo "  Videolar: ./data/videos (boş)"
echo "  SQLite: yeni api-data volume"
echo ""
echo "Tarayıcıda localStorage temizlemek için Kurulum sayfasında F12 > Application > Local Storage > mediaserver.storage_id silin veya gizli pencerede açın."
echo "Diskteki eski klasörler (ör. Sandisk altı) PC'de durur; panel kayıtları sıfırlandı."
