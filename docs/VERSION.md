# Media Server — sürüm notları

Bu dosya her sürümün **ne yapabildiğini** ve **planlanan işleri** tutar. Yeni özellik veya düzeltme sonrası ilgili bölümü güncelleyin.

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

### Yapılacaklar / planlanan (bu bölümü güncelleyin)

<!-- Gelecek sürümler için madde ekleyin; tamamlananları ilgili sürüm bölümüne taşıyın. -->

- [ ] _(örnek)_ Çoklu disk / özel kayıt yolu
- [ ] _(örnek)_ Kullanıcı girişi / yetkilendirme
- [ ] _(örnek)_ Canlı kamera ingest (RTSP push)
- [ ] _(örnek)_ Thumbnail / önizleme karesi
- [ ] _(örnek)_ H.265 / AV1 otomatik transcoding seçeneği

---

## v1.01 (önceki)

- İlk GitHub sürümü: panel, yükleme, RTSP/HLS/WebRTC URL’leri, MediaMTX + Docker stack.
- Durdur / başlat / yeniden başlat (tekli ve toplu).
- Eksik dosya (`file_exists`) gösterimi.
