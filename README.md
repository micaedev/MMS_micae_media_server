# Media Server

**Sürüm 1.01** — Web panelinden video yükleyin; tarayıcıda **HLS**, VLC’de **RTSP** ile izleyin. Arka planda [MediaMTX](https://github.com/bluenviron/mediamtx) çalışır.

## Proje yapısı

```
mediaserver/
├── docker-compose.yml
├── .env.example
├── data/videos/          # yüklenen videolar (git dışı)
├── engine/               # MediaMTX + FFmpeg
├── backend/              # FastAPI
├── frontend/             # React panel
└── scripts/              # bakım
```

## Gereksinimler

- Docker ve Docker Compose
- `.env` içinde `MEDIASERVER_PUBLIC_HOST` = bu makinenin LAN IP’si

## Kurulum

```bash
cd ~/Projects/mediaserver
cp .env.example .env
# MEDIASERVER_PUBLIC_HOST=192.168.x.x
docker compose up --build -d
```

- **Panel:** http://localhost:3000
- **API:** http://localhost:8080
- **HLS:** http://\<IP\>:8888/\<video-id\>/index.m3u8
- **RTSP:** rtsp://\<IP\>:8554/\<video-id\>

## Ortam değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `MEDIASERVER_PUBLIC_HOST` | LAN IP (URL ve WebRTC ICE) |
| `MAX_UPLOAD_BYTES` | Yükleme limiti (varsayılan ~50 GB, `0` = sınırsız) |

## Sorun giderme

```bash
docker compose ps
docker compose logs engine --tail 40
docker compose logs api --tail 40
curl -s http://localhost:8080/api/health
./scripts/cleanup-stacks.sh   # eski mediamtx-web / mediaserver konteynerleri
```

| Sorun | Çözüm |
|-------|--------|
| LAN’dan bağlanamıyorum | `hostname -I` ile IP’yi `.env`’e yazın, `docker compose up -d --force-recreate` |
| Dosya yok uyarısı | Video `data/videos/` altında mı? Yoksa listeden silin |
| Yayın durmuyor | **Durdur** / **Tümünü durdur**; **Başlat** ile tekrar açın |

## GitHub’a v1.01 yayınlama (eski repoyu silip yeniden açma)

```bash
cd ~/Projects/mediaserver
git add -A
git commit -m "Release v1.01: Media Server panel"
git checkout -B main
git tag -f v1.01 -m "Media Server v1.01"

gh repo delete micaedev/mediaserver --yes
gh repo create micaedev/mediaserver --public \
  --description "Media Server web panel - HLS/RTSP video streaming" \
  --source=. --remote=origin --push
git push origin v1.01
```

## Geliştirme

```bash
cd backend && pip install -r requirements.txt
export MEDIASERVER_API_URL=http://127.0.0.1:9997 VIDEOS_DIR=../data/videos PUBLIC_HOST=localhost
uvicorn app.main:app --reload --port 8080

cd frontend && npm install && npm run dev
```
