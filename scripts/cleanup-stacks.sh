#!/usr/bin/env bash
set -euo pipefail

echo "Eski Docker konteyner ve imajlari temizleniyor..."
docker ps -aq --filter name=mediamtx-web | xargs -r docker rm -f
docker ps -aq --filter name=mediaserver | xargs -r docker rm -f
docker images --format '{{.ID}} {{.Repository}}' | awk '/mediamtx-web|mediaserver-/ {print $1}' | xargs -r docker rmi -f 2>/dev/null || true
echo "Tamam."
