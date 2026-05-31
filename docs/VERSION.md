# Media Server — sürüm notları

Bu dosya her sürümün **ne yapabildiğini** ve **planlanan işleri** tutar. Yeni özellik veya düzeltme sonrası ilgili bölümü güncelleyin.

---

## v1.05.1 (2026-05-31) — Stabil

**Etiket:** `v1.05.1`  
**Önceki stabil:** `v1.05`

### Özet

v1.05 üzerine yayın ve izleme düzeltmeleri: **WebM ekran kaydı → WebRTC/HLS**, FFmpeg **`#` hatası** giderildi, **HLS panel proxy** redirect düzeltmesi, **stream-debug** teşhis API’si, medya bilgisi ve önizleme iyileştirmeleri.

### Yayın (FFmpeg / MediaMTX)

- **`runOnInit` artık `/bin/sh -c` ile çalışır** — MediaMTX komutu kabuk olmadan çalıştırdığında `# pub=v6` yorumu ffmpeg’e çıktı dosyası `#` olarak gidiyordu; yayın hiç başlamıyordu (`Error opening output file #`). Tüm komut `shlex.quote` ile sarılıyor.
- **Dosya yolları `shlex.quote`** — boşluk içeren depolama yollarında (`/host/media/.../Screencast from ....webm`) ffmpeg `-i` kırılmıyor.
- **`.webm` (VP8/VP9 ekran kaydı) özel pipeline:**
  - Sabit **30 fps** + `yuv420p` (değişken fps screencast’lerde WebRTC/HLS bozulmasını önler)
  - **H.264 baseline** (tarayıcı WebRTC uyumu)
  - Çift çözünürlük: `scale=trunc(iw/2)*2:trunc(ih/2)*2`
  - Varsa ses: **Opus** (`-map 0:a:0?`) — screencast WebM’de ses korunur
- **`.mp4` / `.mkv` / `.mov`:** varsayılan `MEDIASERVER_WEBRTC_SAFE=0` → **H.264 copy** + `h264_mp4toannexb` (düşük CPU); `=1` ise libx264 transcode.
- **API başlangıcında** tüm videolar için path komutları **otomatik `reload_path`** (engine restart sonrası senkron).

### İzleme (HLS / WebRTC / panel)

- **nginx `/hls/` proxy_redirect** — MediaMTX 302 `Location: /PATH/...` artık `/hls/PATH/...` olarak yeniden yazılır; aksi halde panel `index.html` döndürüp M3U8 yerine HTML geliyordu.
- **Tarayıcı HLS:** manifest isteğinde **redirect takibi** (`res.url`); öncelik sırası: doğrudan **8888**, panel **`/hls/`**.
- **WebRTC URL:** panel artık API’deki `webrtc_url` kullanır (`MEDIASERVER_PUBLIC_HOST`); `localhost` / LAN IP uyumsuzluğu giderildi.
- **engine `WEBRTC_EXTRA_HOSTS`** — ICE için `127.0.0.1`, `localhost` ve LAN IP birlikte (`docker-entrypoint.sh`).

### Video kütüphanesi / API

- **Medya sütunu:** `Codec:`, `Ses:`, `fps:` etiketli bilgi (`ffprobe`, SQLite alanları).
- **JPEG önizleme:** `GET /api/videos/{id}/thumbnail` — ilk kare; yüklemede ve `refresh-media-info` ile üretim.
- **`POST /api/videos/refresh-media-info`** — probe + thumbnail yenileme.
- **`GET /api/videos/{id}/stream-debug`** — `ready`, HLS manifest (8888 / panel nginx / engine), portlar, `publish_mode`, hata metinleri.
- **Migration:** `videos.video_codec`, `video_fps`, `has_audio`.

### Kurulum / UI

- `VideoMediaCell` — önizleme + etiketli medya bilgisi (Kurulum + İzleme tabloları).
- `StorageLocationSetup` — yükleme hata durumu, gizli kayıt yeri sadeleştirme (v1.05).
- `BrowserPreview` — `ready` beklerken net hata; stream-debug ipuçları.

### Docker / yapılandırma

- `docker-compose.yml`: `MEDIASERVER_WEBRTC_SAFE`, `WEBRTC_EXTRA_HOSTS`
- `.env.example`: WebRTC ve transcode notları

### Bilinen sınırlamalar

- **WebRTC** düşük gecikme için uygundur; **HLS önerilir** (8888 veya `http://IP:3000/hls/...`).
- `stream-debug` içinden `192.168.0.90:3000` erişimi API konteynerinde başarısız olabilir (normal); `via_panel_nginx` (`host.docker.internal:3000`) kullanılır.
- Çok sayıda eşzamanlı **libx264** yayını (WEBRTC_SAFE=1 veya çok `.webm`) CPU’yu yorar.

### Disk yedeği

`~/Projects/V1.05.1 Stabil/mediaserver-v1.05.1-stabil.tar.gz`

---

## v1.05 (2026-05-31) — Stabil

**Etiket:** `v1.05`

### Özet

Kararlı sürüm: **media probe** (ffprobe ile süre/codec bilgisi), **thumbnail** üretimi, **HLS proxy** düzeltmesi, **stream-debug** iyileştirmeleri, FFmpeg **`sh -c`** ile güvenilir `runOnInit` başlatma.

---

## v1.02 (2026-05-30) — kararlı yayın

**Depo:** [MMS_micae_media_server](https://github.com/micaedev/MMS_micae_media_server)  
**Etiket:** `v1.02`

### Özet

Web panelinden video yükleyip LAN üzerinde **HLS** (tarayıcı), **RTSP** (VLC) ve deneysel **WebRTC** ile izleyebilen, MediaMTX tabanlı medya sunucusu. FFmpeg ile dosyadan RTSP yayını; normal oynatma hızı için `-re` kullanılır.

### Mimari

| Bileşen | Teknoloji | Port / erişim |
|---------|-----------|----------------|
| **engine** | MediaMTX v1.18.2 + FFmpeg | `network_mode: host` — RTSP 8554, HLS 8888, WebRTC 8889, API 9997 |
| **api** | FastAPI + SQLite | 8080 |
| **web** | React + nginx | 3000 (panel), `/api` ve `/hls` proxy |
| **Veri** | `data/videos/` | Konteynerde `/videos` |

### Video yükleme ve depolama

- Sürükle-bırak veya dosya seçici ile yükleme; ilerleme çubuğu.
- Desteklenen uzantılar: **`.mp4`**, **`.mkv`**, **`.mov`**, **`.webm`**.
- Dosyalar `data/videos/` altında UUID tabanlı isimle saklanır (git dışı).
- Yükleme boyutu limiti: `.env` → `MAX_UPLOAD_BYTES` (varsayılan ~50 GB; `0` = sınırsız).
- Yükleme sonrası MediaMTX path otomatik oluşturulur ve FFmpeg yayıncısı uyandırılır (`wake_publisher`).

### Yayın motoru (FFmpeg → RTSP)

- Her video için MediaMTX path adı = **video UUID** (`stream_path` ile uyumlu).
- **`runOnInit`**: döngüsel dosya yayını (`-stream_loop -1`).
- **`-re`**: gerçek zamanlı hız (WebRTC/HLS’nin çok hızlı/bozuk oynamasını önler).
- **MP4/MKV/MOV**: video `copy` + `h264_mp4toannexb` bitstream filter (H.264 uyumu).
- **WebM**: `libx264` transcoding (HLS/WebRTC uyumu).
- Ses yayında kapalı (`-an`).
- RTSP çıkış: TCP (`-rtsp_transport tcp`).

### MediaMTX / HLS ayarları

- Global **`hlsAlwaysRemux: true`**: HLS segmentleri istek beklemeden üretilir (daha az ilk gecikme).
- Path düzeyinde yalnızca `runOnInit` / `runOnInitRestart` (geçersiz alanlar API’den gönderilmez).
- CORS / izinler: okuma, yayın, API, playback (iç ağ testi için `any` kullanıcı).

### Web paneli (React)

- Video listesi; durum rozetleri: **Beklemede**, **Hazır**, **Yayında**, **Durduruldu**, **Dosya yok**, **Bilinmiyor**.
- Liste **8 saniyede** bir otomatik yenilenir.
- **Tek video:** Başlat / Yeniden başlat, Durdur, Sil, Tarayıcıda izle.
- **Toplu:** Tümünü başlat, Tümünü durdur, Tümünü yeniden başlat.
- Yayınlar sayfa açılışında otomatik başlamaz; kullanıcı **Başlat** veya **izleme** ile açar.
- **Dosya yok** uyarısı: veritabanında kayıt var, diskte dosya yok.
- Media Server API bağlantı kontrolü (`/api/health`).

### URL’ler ve izleme

| Yöntem | Kullanım | URL örneği |
|--------|----------|------------|
| **HLS** (önerilen) | Tarayıcı önizleme, hls.js | `http://<LAN-IP>:8888/<video-id>/index.m3u8` veya panel `/hls/...` proxy |
| **RTSP** | VLC, OBS, harici oyuncular | `rtsp://<LAN-IP>:8554/<video-id>` |
| **WebRTC** | MediaMTX gömülü sayfa (deneysel) | `http://<LAN-IP>:8889/<video-id>` |
| **WHEP** | Harici WebRTC oyuncular | `http://<LAN-IP>:8889/<video-id>/whep` |

- Panelde RTSP / HLS / WebRTC URL’leri **panoya kopyalama**.
- **Tarayıcıda izle:** önce HLS (API URL → doğrudan 8888 → nginx proxy sırası), manifest hazır olana kadar bekleme; WebRTC iframe isteğe bağlı (deneysel).

### REST API (FastAPI)

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/health` | API + MediaMTX bağlantı durumu |
| `GET /api/videos` | Liste + durum |
| `POST /api/videos` | Yükleme |
| `DELETE /api/videos/{id}` | Dosya + path + DB kaydı silme |
| `POST /api/videos/{id}/start` | Path yeniden oluştur + uyandır |
| `POST /api/videos/{id}/stop` | Path sil (yayın durur) |
| `POST /api/videos/{id}/restart` | Path reload + uyandır |
| `POST /api/videos/start-all` | Toplu başlat |
| `POST /api/videos/stop-all` | Toplu durdur |
| `POST /api/videos/restart-all` | Toplu yeniden başlat |
| `POST /api/videos/sync` | Diskteki tüm videolar için path senkronu |
| `GET /api/videos/{id}/status` | MediaMTX path durumu |

### Ortam ve ağ

- **`MEDIASERVER_PUBLIC_HOST`**: LAN IP — RTSP/HLS/WebRTC URL’leri ve WebRTC ICE host listesi.
- Engine **host network**: portlar doğrudan makinede dinlenir.
- API/Web, engine’e `host.docker.internal` üzerinden bağlanır.

### Bakım scriptleri

- `scripts/cleanup-stacks.sh` — eski mediamtx / mediaserver konteynerlerini temizleme.
- `scripts/reset-stack.sh` — stack sıfırlama (varsa).

### Bilinen sınırlamalar (v1.02)

- WebRTC tarayıcıda HLS kadar kararlı değil; öncelik HLS.
- MP4 içeriği H.264 değilse `copy` yayını başarısız olabilir (transcode gerekir).
- Çok büyük dosyalarda ilk HLS manifest birkaç saniye–dakika gecikebilir.
- Tek makine / tek disk (`data/videos`); çoklu disk veya dağıtık depolama yok.

## v1.03 (2026-05-30) — çok ekran, disk gezgini, kayıt yeri sihirbazı

**Depo:** [MMS_micae_media_server](https://github.com/micaedev/MMS_micae_media_server)  
**Etiket:** `v1.03`

### Özet

Panel üç ana bölüme ayrıldı: **Ana sayfa**, **Kurulum**, **İzleme**. Video yükleme ve disk/klasör yönetimi yalnızca Kurulum’da; izleme ve HLS önizleme İzleme ekranında. Panelden takılı disklere klasör gezip yeni kayıt yeri oluşturulabilir; videolar seçilen PC yoluna yazılır.

---

### Arayüz ve gezinme (React Router)

| Yol | Ekran | İşlev |
|-----|--------|--------|
| `/` | Ana sayfa (landing) | Kurulum veya İzleme’ye giriş kartları |
| `/setup` | Kurulum | Kayıt yeri, video yükleme, kütüphane yönetimi (sil, başlat/durdur) |
| `/watch` | İzleme | Video listesi, HLS önizleme, RTSP/HLS URL kopyalama, toplu yayın kontrolü |

- Üst menü: **Ana sayfa · Kurulum · İzleme** (Kurulum ve İzleme sayfalarında).
- `react-router-dom` eklendi; nginx `try_files` ile SPA yönlendirmesi (değişiklik yok).

---

### Çoklu disk ve kayıt yeri sihirbazı

#### Kavramlar

- **Kayıt yeri (storage volume):** Videoların yazıldığı klasör; yüklemede `storage_id` ile seçilir.
- **Disk kökü (browse root):** Panelde gezilebilen üst düzey mount (`/media`, `/mnt`, …).
- **Varsayılan:** `data/videos` → konteyner `/videos`, PC `./data/videos`.
- **Özel kayıt yeri:** Kurulum sihirbazıyla oluşturulur; SQLite `storage_locations` tablosunda saklanır.

#### Kurulum ekranı — Kayıt yeri bölümü

1. Mevcut kayıt yerlerinden radyo ile seçim (tercih `localStorage`).
2. **「+ Başka diskte yeni klasör oluştur」** sihirbazı:
   - Disk/kök seçimi (`GET /api/storage/roots`)
   - Klasör gezgini (`GET /api/storage/browse`) — alt klasörlere tıklayarak girme, ↑ Üst
   - Yeni klasör adı + panel etiketi
   - **Oluştur ve seç** → diskte klasör oluşturulur, kayıt yeri eklenir
3. Özel kayıt yerleri **「Kayıt yerini kaldır」** ile silinebilir (üzerinde video yoksa; diskteki klasör kalır).
4. Gösterim: **PC’de tam yol** + konteyner içi yol (ör. PC `/mnt/mediaserver-videos`, konteyner `/host/mnt/mediaserver-videos`).

#### PC yolu vs konteyner yolu

Docker bind mount eşlemesi:

| PC (host) | Konteyner (api + engine) |
|-----------|---------------------------|
| `/media/...` | `/host/media/...` |
| `/mnt/...` | `/host/mnt/...` |
| `STORAGE_EXTRA_HOST_PATH` | `/host/extra/...` |

`pc_path_for_container()` API yanıtlarında doğru PC yolunu hesaplar (önceki sürümde `/host/mnt/...` yanlış gösterilebiliyordu).

---

### Backend (FastAPI)

#### Yeni / güncellenen modüller

| Dosya | Açıklama |
|-------|----------|
| `app/storage.py` | Env birimleri, browse kökleri, güvenli yol çözümleme, klasör oluşturma |
| `app/migrate.py` | `videos.storage_id`, `storage_locations` tablosu |
| `app/models.py` | `StorageLocation` modeli |

#### Yeni API uçları

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/storage/volumes` | Tüm kayıt yerleri (env + özel) |
| `GET /api/storage/roots` | Gezilebilir disk kökleri |
| `GET /api/storage/browse?root_id=&path=` | Klasör listesi |
| `POST /api/storage/locations` | Yeni klasör + kayıt yeri (`root_id`, `browse_path`, `folder_name`, `label`) |
| `DELETE /api/storage/locations/{id}` | Özel kayıt yeri sil (video yoksa) |

#### Yükleme

- `POST /api/videos` — `multipart`: `file` + `storage_id` (Form alanı).
- Video kaydı `storage_id` ile DB’de tutulur; dosya yolu seçilen volume’a göre çözülür.
- FFmpeg/MediaMTX path’i ilgili konteyner yolunu kullanır.

---

### Docker ve ortam değişkenleri

#### `docker-compose.yml` mount’ları (api + engine)

- `./data/videos` → `/videos`
- `/media` → `/host/media`
- `/mnt` → `/host/mnt`
- `${STORAGE_EXTRA_HOST_PATH:-./data/.optional-extra}` → `/host/extra`

#### Yeni / güncellenen değişkenler

| Değişken | Açıklama |
|----------|----------|
| `STORAGE_VOLUMES` | Sabit kayıt yerleri: `id:konteyner:etiket\|pc_yolu` (`;` ile ayrılır) |
| `STORAGE_BROWSE_ROOTS` | Gezinti kökleri: `id:konteyner:etiket\|pc_yolu` — **etiketten sonra `\|` ile PC yolu zorunlu** |
| `STORAGE_EXTRA_HOST_PATH` | Ek disk host yolu (ör. `/media/micae/store`) |

Örnek `.env` (mağaza diski):

```env
STORAGE_EXTRA_HOST_PATH=/media/micae/store
STORAGE_BROWSE_ROOTS=media:/host/media:Media|/media;store:/host/extra:Mağaza|/media/micae/store
```

Değişiklikten sonra: `docker compose up -d --force-recreate api engine`

---

### Frontend dosya yapısı (yeni)

```
frontend/src/
├── pages/LandingPage.tsx
├── pages/SetupPage.tsx
├── pages/WatchPage.tsx
├── components/AppNav.tsx
├── components/StorageLocationSetup.tsx
├── components/StatusBadge.tsx
├── hooks/useVideos.ts
└── utils/format.ts
```

---

### v1.02’den devralınan (değişmedi)

- FFmpeg `-re`, global `hlsAlwaysRemux`, HLS önizleme, RTSP/VLC, yayın başlat/durdur, dosya yok uyarısı, MediaMTX v1.18.2.

---

### Bilinen sınırlamalar (v1.03)

- Yeni disk kökü için `.env` + compose mount + konteyner yeniden oluşturma gerekir (tamamen panelden rastgele PC yolu eklenemez).
- Özel kayıt yeri silindiğinde diskteki klasör otomatik silinmez.
- `/mnt` altındaki içerik sistemin mount düzenine bağlıdır (USB, NFS vb.).

### Yapılacaklar / planlanan (bu bölümü güncelleyin)

- [ ] Kullanıcı girişi / yetkilendirme
- [ ] Canlı kamera ingest (RTSP push)
- [ ] Thumbnail / önizleme karesi
- [ ] H.265 / AV1 otomatik transcoding seçeneği
- [ ] Mevcut özel kayıt yerlerinin host_path alanını toplu düzeltme aracı
- [ ] _(örnek)_ Kullanıcı girişi / yetkilendirme
- [ ] _(örnek)_ Canlı kamera ingest (RTSP push)
- [ ] _(örnek)_ Thumbnail / önizleme karesi
- [ ] _(örnek)_ H.265 / AV1 otomatik transcoding seçeneği

---

## v1.01 (önceki)

- İlk GitHub sürümü: panel, yükleme, RTSP/HLS/WebRTC URL’leri, MediaMTX + Docker stack.
- Durdur / başlat / yeniden başlat (tekli ve toplu).
- Eksik dosya (`file_exists`) gösterimi.
