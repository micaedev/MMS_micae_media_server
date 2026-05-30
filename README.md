# Media Server

**Sürüm 1.04** — Web panelinden video yükleyin; tarayıcıda **HLS**, VLC’de **RTSP** ile izleyin. İzleme ekranında önizleme karesi, net yayın butonları. Arka planda [MediaMTX](https://github.com/bluenviron/mediamtx) çalışır.

Detaylı özellik listesi ve planlanan işler: **[docs/VERSION.md](docs/VERSION.md)**

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

## Panel ekranları

| Yol | Açıklama |
|-----|----------|
| `/` | Ana sayfa — Kurulum veya İzleme |
| `/setup` | Video yükleme, disk seçimi, yayın yönetimi |
| `/watch` | HLS önizleme, RTSP/HLS URL kopyalama |

## Çoklu disk (depolama)

**Kurulum** ekranından (`/setup`) disk köküne girip yeni klasör oluşturabilirsiniz. Bunun için disk Docker içinde mount edilmiş olmalı.

Varsayılan gezinti: `/media`, `/mnt`, `/host/extra` (`.env` ile `STORAGE_BROWSE_ROOTS`).

Örnek — disk `/media/micae/store` üzerinde klasör:

```env
STORAGE_EXTRA_HOST_PATH=/media/micae/store
STORAGE_BROWSE_ROOTS=media:/host/media:/media;store:/host/extra:Mağaza diski|/media/micae/store
```

```bash
docker compose up -d --force-recreate api engine
```

Panel: **Kurulum → Başka diskte yeni klasör oluştur** → diski seç → klasöre gir → klasör adı → **Oluştur ve seç**.

## Ortam değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `MEDIASERVER_PUBLIC_HOST` | LAN IP (URL ve WebRTC ICE) |
| `MAX_UPLOAD_BYTES` | Yükleme limiti (varsayılan ~50 GB, `0` = sınırsız) |
| `STORAGE_VOLUMES` | `id:konteyner:etiket\|host_yol` listesi (`;` ile ayrılır) |
| `STORAGE_DISK_2_MOUNT` | İkinci bind mount (host yolu) |

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

## Kaynak kod

https://github.com/micaedev/MMS_micae_media_server — sürüm **v1.04** (`main`)

## Geliştirme

```bash
cd backend && pip install -r requirements.txt
export MEDIASERVER_API_URL=http://127.0.0.1:9997 VIDEOS_DIR=../data/videos PUBLIC_HOST=localhost
uvicorn app.main:app --reload --port 8080

cd frontend && npm install && npm run dev
```
