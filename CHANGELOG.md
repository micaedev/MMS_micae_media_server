# Changelog

## [1.0.0] — 2026-05-25

İlk kararlı sürüm. Yerel PC’de doğrulanmış: yükleme, HLS tarayıcı oynatma, RTSP (VLC/ffplay), WebRTC (deneysel).

### Özellikler

- Web paneli (React): video yükleme, liste, silme
- FastAPI: SQLite metadata, MediaMTX Control API entegrasyonu
- MediaMTX (host ağı): FFmpeg `runOnInit` ile dosyadan RTSP publish
- Tarayıcı: **HLS** (port 8888, hls.js)
- VLC/ffplay: **RTSP** (port 8554)
- WebRTC: yerleşik oynatıcı (port 8889, deneysel)
- Büyük dosya upload (nginx + API limit yapılandırması)
- `POST /api/videos/sync` — path yenileme
- `POST /api/videos/{id}/start` — yayın ön ısıtma

### Teknik notlar

- FFmpeg: H.264 baseline, WebRTC uyumlu
- WebRTC ICE: yerel STUN kapalı, UDP/TCP 8189/8190
- `MTX_PUBLIC_HOST` ile LAN URL’leri
