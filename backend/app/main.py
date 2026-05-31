import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models
from app.config import (
    ALLOWED_EXTENSIONS,
    MAX_UPLOAD_BYTES,
    PUBLIC_HOST,
    VIDEOS_DIR,
    HLS_PORT,
    RTSP_PORT,
    WEBRTC_PORT,
)
from app.database import Base, SessionLocal, engine, get_db
from app.mediaserver_client import MediaServerClient, MediaServerError
from app.migrate import run_migrations
from app import storage
from app.probe import probe_media
from app import thumbnails
from app.schemas import (
    BrowseOut,
    BrowseEntryOut,
    CreateStorageLocationIn,
    StorageRootOut,
    StorageVolumeOut,
    VideoOut,
    VideoStatusOut,
)

logger = logging.getLogger(__name__)
media_server = MediaServerClient()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    db = SessionLocal()
    try:
        for vol in storage.list_volumes(db):
            vol.path.mkdir(parents=True, exist_ok=True)
            os.chmod(vol.path, 0o777)
        for root in storage.BROWSE_ROOTS.values():
            if root.path.is_dir():
                os.chmod(root.path, 0o777)
        thumbnails.ensure_dir()
    finally:
        db.close()
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(VIDEOS_DIR, 0o777)
    try:
        await media_server.check_connection()
        logger.info("Media Server API bağlantısı OK: %s", media_server.base_url)
        db = SessionLocal()
        try:
            synced = 0
            for video in db.query(models.Video).all():
                if not _file_exists(video, db):
                    continue
                try:
                    await media_server.reload_path(
                        _mtx_path(video),
                        _engine_media_path(video, db),
                    )
                    synced += 1
                except MediaServerError as exc:
                    logger.warning("Path senkron hatası %s: %s", video.id, exc)
            if synced:
                logger.info(
                    "Media Server path komutlari guncellendi (%s video)",
                    synced,
                )
        finally:
            db.close()
    except MediaServerError as exc:
        logger.error("Media Server API başlangıçta erişilemedi: %s", exc)
    yield


app = FastAPI(title="Media Server Web API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _stream_urls(video_id: str) -> tuple[str, str, str, str, str]:
    rtsp = f"rtsp://{PUBLIC_HOST}:{RTSP_PORT}/{video_id}"
    base = f"http://{PUBLIC_HOST}:{WEBRTC_PORT}"
    watch = f"{base}/{video_id}"
    whep = f"{watch}/whep"
    hls = f"http://{PUBLIC_HOST}:{HLS_PORT}/{video_id}/index.m3u8"
    return rtsp, watch, whep, watch, hls


def _format_size(num_bytes: int) -> str:
    if num_bytes <= 0:
        return "sınırsız"
    gb = num_bytes / (1024**3)
    if gb >= 1:
        return f"{gb:.1f} GB"
    mb = num_bytes / (1024**2)
    return f"{mb:.0f} MB"


def _video_volume(video: models.Video, db: Session) -> storage.StorageVolume:
    try:
        return storage.get_volume(video.storage_id, db)
    except KeyError:
        return storage.get_volume(storage.DEFAULT_VOLUME_ID, db)


def _video_file_path(video: models.Video, db: Session) -> Path:
    return _video_volume(video, db).path / video.filename


def _engine_media_path(video: models.Video, db: Session) -> str:
    vol = _video_volume(video, db)
    return f"{vol.container_path}/{video.filename}"


def _mtx_path(video: models.Video) -> str:
    """MediaMTX path adi her zaman video id ile ayni olmali."""
    return video.id


def _file_exists(video: models.Video, db: Session) -> bool:
    return _video_file_path(video, db).is_file()


def _require_video_file(video: models.Video, db: Session) -> None:
    if not _file_exists(video, db):
        raise HTTPException(
            404,
            f"Video dosyası bulunamadı ({video.filename}). "
            "Dosya silinmiş olabilir; listeden kaldırın.",
        )


async def _stop_mediaserver_path(video: models.Video) -> None:
    try:
        await media_server.delete_path(_mtx_path(video))
    except MediaServerError as e:
        if e.status_code != 404:
            raise


def _status_label(ready: bool, reader_count: int, *, path_exists: bool = True) -> str:
    if not path_exists:
        return "stopped"
    if reader_count > 0:
        return "streaming"
    if ready:
        return "ready"
    return "idle"


def _apply_probe_to_video(video: models.Video, path: Path, db: Session) -> None:
    info = probe_media(path)
    video.video_codec = info.video_codec
    video.video_fps = info.video_fps
    video.has_audio = info.has_audio
    db.add(video)
    db.commit()
    db.refresh(video)


def _ensure_video_probe(video: models.Video, db: Session) -> None:
    if video.video_codec is not None:
        return
    if not _file_exists(video, db):
        return
    _apply_probe_to_video(video, _video_file_path(video, db), db)


def _to_video_out(
    video: models.Video,
    status: str = "idle",
    *,
    db: Session,
    file_exists: bool | None = None,
    probe: bool = True,
) -> VideoOut:
    exists = _file_exists(video, db) if file_exists is None else file_exists
    if not exists:
        status = "missing"
    elif probe:
        _ensure_video_probe(video, db)

    rtsp, watch, whep, page, hls = _stream_urls(video.id)
    vol = _video_volume(video, db)
    thumb_url = f"/api/videos/{video.id}/thumbnail" if exists else ""
    return VideoOut(
        id=video.id,
        title=video.title,
        filename=video.filename,
        size=video.size,
        stream_path=video.stream_path,
        storage_id=vol.id,
        storage_label=vol.label,
        created_at=video.created_at,
        rtsp_url=rtsp,
        webrtc_url=watch,
        whep_url=whep,
        watch_url=page,
        hls_url=hls,
        status=status,
        file_exists=exists,
        video_codec=video.video_codec,
        video_fps=video.video_fps,
        has_audio=video.has_audio,
        thumbnail_url=thumb_url,
    )


def _volume_out(v: storage.StorageVolume) -> StorageVolumeOut:
    return StorageVolumeOut(
        id=v.id,
        label=v.label,
        host_path=v.host_path,
        container_path=v.container_path,
        custom=v.custom,
    )


@app.get("/api/storage/volumes", response_model=list[StorageVolumeOut])
async def list_storage_volumes(db: Session = Depends(get_db)):
    return [_volume_out(v) for v in storage.list_volumes(db)]


@app.get("/api/storage/roots", response_model=list[StorageRootOut])
async def list_storage_roots():
    return [
        StorageRootOut(
            id=r.id,
            label=r.label,
            host_path=r.host_path,
            container_path=r.container_path,
            available=r.path.is_dir(),
        )
        for r in storage.BROWSE_ROOTS.values()
    ]


@app.get("/api/storage/browse", response_model=BrowseOut)
async def browse_storage(
    root_id: str,
    path: str = "",
):
    try:
        result = storage.browse_directory(root_id, path)
    except KeyError as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ValueError, NotADirectoryError, PermissionError) as exc:
        raise HTTPException(400, str(exc)) from exc

    host_display = result.host_prefix
    if result.current_path:
        host_display = f"{host_display}/{result.current_path}"

    return BrowseOut(
        root_id=result.root_id,
        root_label=result.root_label,
        current_path=result.current_path,
        parent_path=result.parent_path,
        host_display=host_display,
        entries=[BrowseEntryOut(name=e.name, path=e.path) for e in result.entries],
    )


@app.post("/api/storage/locations", response_model=StorageVolumeOut, status_code=201)
async def create_storage_location(
    body: CreateStorageLocationIn,
    db: Session = Depends(get_db),
):
    try:
        vol = storage.create_storage_location(
            db,
            root_id=body.root_id,
            browse_path=body.browse_path,
            folder_name=body.folder_name,
            label=body.label or body.folder_name,
        )
    except KeyError as exc:
        raise HTTPException(400, str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except (ValueError, NotADirectoryError, PermissionError, OSError) as exc:
        raise HTTPException(400, str(exc)) from exc
    return _volume_out(vol)


@app.delete("/api/storage/locations/{location_id}", status_code=204)
async def remove_storage_location(location_id: str, db: Session = Depends(get_db)):
    try:
        storage.delete_storage_location(db, location_id)
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@app.get("/api/health")
async def health():
    try:
        await media_server.check_connection()
        return {"ok": True, "mediaserver": "connected"}
    except MediaServerError as exc:
        return {"ok": False, "mediaserver": "disconnected", "error": str(exc)}


async def _video_with_status(video: models.Video, db: Session) -> VideoOut:
    if not _file_exists(video, db):
        return _to_video_out(video, db=db, file_exists=False)

    try:
        st = await media_server.get_path_status(_mtx_path(video))
        status = _status_label(
            st["ready"],
            len(st["readers"]),
            path_exists=st.get("exists", False),
        )
    except MediaServerError:
        status = "unknown"
    return _to_video_out(video, status, db=db)


@app.get("/api/videos", response_model=list[VideoOut])
async def list_videos(db: Session = Depends(get_db)):
    videos = db.query(models.Video).order_by(models.Video.created_at.desc()).all()
    result = []
    for video in videos:
        try:
            result.append(await _video_with_status(video, db))
        except MediaServerError:
            result.append(_to_video_out(video, "unknown", db=db))
    return result


@app.post("/api/videos/refresh-media-info")
async def refresh_media_info(db: Session = Depends(get_db)):
    """Medya bilgisini sıfırlayıp yeniden ffprobe ile doldurur."""
    videos = db.query(models.Video).all()
    reset = 0
    probed = 0
    for video in videos:
        if not _file_exists(video, db):
            continue
        video.video_codec = None
        video.video_fps = None
        video.has_audio = None
        db.add(video)
        reset += 1
    db.commit()
    thumbs = 0
    thumb_errors: list[dict[str, str]] = []
    for video in videos:
        if not _file_exists(video, db):
            continue
        _ensure_video_probe(video, db)
        probed += 1
        thumbnails.delete_thumbnail(video.id)
        path = _video_file_path(video, db)
        if thumbnails.generate_thumbnail(path, video.id, force=True):
            thumbs += 1
        elif len(thumb_errors) < 5:
            thumb_errors.append(
                {"id": video.id, "path": str(path), "title": video.title}
            )
    return {
        "reset": reset,
        "probed": probed,
        "thumbnails": thumbs,
        "thumbnail_errors": thumb_errors,
        "hint": (
            "thumbnails 0 ise: docker compose logs api | grep thumbnail "
            "ve docker compose exec api ffmpeg -i /videos/DOSYA.mp4 -frames:v 1 /tmp/t.jpg"
        ),
    }


@app.post("/api/videos/sync")
async def sync_all_paths(db: Session = Depends(get_db)):
    videos = db.query(models.Video).all()
    synced = 0
    skipped = 0
    for video in videos:
        if not _file_exists(video, db):
            skipped += 1
            continue
        await media_server.reload_path(
            _mtx_path(video), _engine_media_path(video, db)
        )
        synced += 1
    return {
        "synced": synced,
        "skipped_missing": skipped,
        "note": "Path'ler runOnInit ile yeniden oluşturuldu",
    }


@app.post("/api/videos/restart-all")
async def restart_all_streams(db: Session = Depends(get_db)):
    videos = db.query(models.Video).all()
    restarted = 0
    skipped = 0
    for video in videos:
        if not _file_exists(video, db):
            skipped += 1
            continue
        await media_server.reload_path(
            _mtx_path(video), _engine_media_path(video, db)
        )
        restarted += 1
    return {
        "restarted": restarted,
        "skipped_missing": skipped,
        "note": "Tum yayinlar yeniden baslatildi",
    }


@app.post("/api/videos/stop-all")
async def stop_all_streams(db: Session = Depends(get_db)):
    videos = db.query(models.Video).all()
    stopped = 0
    skipped = 0
    for video in videos:
        if not _file_exists(video, db):
            skipped += 1
            continue
        await _stop_mediaserver_path(video)
        stopped += 1
    return {
        "stopped": stopped,
        "skipped_missing": skipped,
        "note": "Tum yayinlar durduruldu",
    }


@app.post("/api/videos/start-all")
async def start_all_streams(db: Session = Depends(get_db)):
    videos = db.query(models.Video).all()
    started = 0
    skipped = 0
    for video in videos:
        if not _file_exists(video, db):
            skipped += 1
            continue
        try:
            await media_server.reload_path(
                _mtx_path(video),
                _engine_media_path(video, db),
            )
            await media_server.wake_publisher(_mtx_path(video), timeout_sec=30.0)
        except MediaServerError as e:
            raise HTTPException(502, str(e)) from e
        started += 1
    return {
        "started": started,
        "skipped_missing": skipped,
        "note": "Tum yayinlar baslatildi",
    }


@app.post("/api/videos", response_model=VideoOut, status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    storage_id: str = Form(default=storage.DEFAULT_VOLUME_ID),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "Dosya adı gerekli")

    try:
        vol = storage.get_volume(storage_id, db)
    except KeyError as exc:
        raise HTTPException(400, str(exc)) from exc

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Desteklenmeyen format. İzin verilenler: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    video_id = uuid.uuid4().hex
    stored_name = f"{video_id}{ext}"
    vol.path.mkdir(parents=True, exist_ok=True)
    dest = vol.path / stored_name

    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if MAX_UPLOAD_BYTES > 0 and size > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        413,
                        f"Maksimum dosya boyutu aşıldı (limit: {_format_size(MAX_UPLOAD_BYTES)}). "
                        f".env dosyasında MAX_UPLOAD_BYTES değerini artırın veya 0 yapın (sınırsız).",
                    )
                out.write(chunk)
        os.chmod(dest, 0o644)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except OSError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(500, f"Dosya yazılamadı: {exc}") from exc

    probe = probe_media(dest)

    container_path = f"{vol.container_path}/{stored_name}"
    try:
        await media_server.add_path(video_id, container_path)
        await media_server.wake_publisher(video_id, timeout_sec=45.0)
    except MediaServerError as e:
        dest.unlink(missing_ok=True)
        logger.error("Media Server path eklenemedi: %s", e)
        raise HTTPException(502, str(e)) from e

    title = Path(file.filename).stem
    video = models.Video(
        id=video_id,
        title=title,
        filename=stored_name,
        size=size,
        stream_path=video_id,
        storage_id=vol.id,
        video_codec=probe.video_codec,
        video_fps=probe.video_fps,
        has_audio=probe.has_audio,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    thumbnails.generate_thumbnail(dest, video_id)
    return _to_video_out(video, db=db, probe=False)


@app.post("/api/videos/{video_id}/restart")
async def restart_video_stream(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadi")
    _require_video_file(video, db)

    try:
        await media_server.reload_path(
            _mtx_path(video), _engine_media_path(video, db)
        )
        path = _mtx_path(video)
        st = await media_server.wake_publisher(path, timeout_sec=45.0)
    except MediaServerError as e:
        raise HTTPException(502, str(e)) from e

    reader_count = len(st["readers"])
    return {
        "id": video_id,
        "mtx_path": path,
        "status": _status_label(
            st["ready"],
            reader_count,
            path_exists=st.get("exists", True),
        ),
        "ready": st["ready"],
        "hls_ready": st.get("ready", False),
        "tracks": st.get("tracks", []),
        "message": "Yayin yeniden baslatildi",
    }


@app.post("/api/videos/{video_id}/stop")
async def stop_video_stream(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadi")
    _require_video_file(video, db)

    try:
        await _stop_mediaserver_path(video)
    except MediaServerError as e:
        raise HTTPException(502, str(e)) from e

    return {
        "id": video_id,
        "status": "idle",
        "ready": False,
        "message": "Yayin durduruldu",
    }


@app.post("/api/videos/{video_id}/start")
async def start_video_stream(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")
    _require_video_file(video, db)

    try:
        path = _mtx_path(video)
        await media_server.reload_path(path, _engine_media_path(video, db))
        st = await media_server.wake_publisher(path, timeout_sec=120.0)
    except MediaServerError as e:
        raise HTTPException(502, str(e)) from e

    reader_count = len(st["readers"])
    return {
        "mtx_path": path,
        "status": _status_label(
            st["ready"],
            reader_count,
            path_exists=st.get("exists", True),
        ),
        "ready": st["ready"],
        "hls_ready": st.get("ready", False),
        "tracks": st.get("tracks", []),
        "hint": (
            "Yayın hazır; tarayıcıda izleyebilirsiniz."
            if st["ready"]
            else (
                "Yayın henüz hazır değil — Yeniden baslat deneyin. "
                f"Teşhis: GET /api/videos/{video_id}/stream-debug"
            )
        ),
    }


@app.get("/api/videos/{video_id}/stream-debug")
async def stream_debug(video_id: str, db: Session = Depends(get_db)):
    """Yayın/port teşhisi — video gelmiyorsa önce bunu kontrol edin."""
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")

    path = _mtx_path(video)
    engine_file = _engine_media_path(video, db)
    exists = _file_exists(video, db)
    configured = False
    mtx: dict = {"ready": False, "exists": False, "readers": [], "tracks": []}
    try:
        configured = await media_server.path_configured(path)
        mtx = await media_server.get_path_status(path)
    except MediaServerError as exc:
        mtx["error"] = str(exc)

    hls_public = f"http://{PUBLIC_HOST}:{HLS_PORT}/{path}/index.m3u8"
    hls_proxy_browser = f"http://{PUBLIC_HOST}:3000/hls/{path}/index.m3u8"
    hls_proxy_docker = (
        f"http://host.docker.internal:3000/hls/{path}/index.m3u8"
    )
    hls_ok_public = False
    hls_ok_proxy = False
    hls_internal = f"http://host.docker.internal:{HLS_PORT}/{path}/index.m3u8"
    hls_ok_internal = False
    hls_errors: dict[str, str] = {}
    hls_final: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as client:
        for key, url in (
            ("direct_8888", hls_public),
            ("via_panel_nginx", hls_proxy_docker),
            ("api_to_engine", hls_internal),
        ):
            try:
                r = await client.get(url)
                ok = r.status_code == 200 and "#EXTM3U" in r.text
                hls_final[key] = str(r.url)
                if key == "direct_8888":
                    hls_ok_public = ok
                elif key == "via_panel_nginx":
                    hls_ok_proxy = ok
                else:
                    hls_ok_internal = ok
                if not ok:
                    if r.status_code == 200 and "#EXTM3U" not in r.text:
                        hls_errors[key] = (
                            "HTTP 200 ama M3U8 degil — panel /hls/ redirect "
                            f"hatasi (final: {r.url})"
                        )
                    else:
                        hls_errors[key] = f"HTTP {r.status_code} (final: {r.url})"
            except httpx.RequestError as exc:
                hls_errors[key] = str(exc)

    # API konteynerinden LAN IP:3000 erisimi genelde basarisiz; tarayici URL ayri
    hls_proxy_lan_note: str | None = None
    try:
        async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
            r = await client.get(hls_proxy_browser)
            if r.status_code == 200 and "#EXTM3U" not in r.text:
                hls_proxy_lan_note = f"LAN panel HTTP 200 ama M3U8 degil (final: {r.url})"
    except httpx.RequestError as exc:
        hls_proxy_lan_note = (
            f"API konteynerinden {PUBLIC_HOST}:3000 erisilemedi ({exc}); "
            "tarayicidan test edin — bu normal olabilir"
        )

    safe = os.getenv("MEDIASERVER_WEBRTC_SAFE", "0").strip().lower() in (
        "1",
        "true",
        "yes",
    )
    return {
        "video_id": video_id,
        "file_exists": exists,
        "engine_file": engine_file,
        "path_configured": configured,
        "mediaserver": mtx,
        "publish_mode": "libx264_transcode" if safe else "h264_copy",
        "ports": {
            "panel": 3000,
            "api": 8080,
            "hls": HLS_PORT,
            "webrtc": WEBRTC_PORT,
            "rtsp": RTSP_PORT,
            "engine_api": 9997,
        },
        "urls": {
            "hls_direct": hls_public,
            "hls_via_panel": hls_proxy_browser,
            "webrtc": f"http://{PUBLIC_HOST}:{WEBRTC_PORT}/{path}",
            "rtsp": f"rtsp://{PUBLIC_HOST}:{RTSP_PORT}/{path}",
        },
        "hls_manifest_ok": {
            "direct_8888": hls_ok_public,
            "via_panel_nginx": hls_ok_proxy,
            "api_to_engine": hls_ok_internal,
        },
        "hls_via_panel_lan_from_api": hls_proxy_lan_note,
        "hls_errors": hls_errors,
        "hls_final_url": hls_final,
        "checks": [
            "mediaserver.ready true olmalı",
            "hls_via_panel veya hls_direct true olmalı",
            "path_configured true olmalı",
            "engine yeniden baslatildiysa: POST /api/videos/restart-all",
        ],
    }


@app.get("/api/videos/{video_id}/status", response_model=VideoStatusOut)
async def video_status(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")
    if not _file_exists(video, db):
        return VideoStatusOut(
            id=video_id,
            ready=False,
            reader_count=0,
            status="missing",
            tracks=[],
        )

    try:
        st = await media_server.get_path_status(_mtx_path(video))
    except MediaServerError as e:
        raise HTTPException(502, str(e)) from e

    reader_count = len(st["readers"])
    return VideoStatusOut(
        id=video_id,
        ready=st["ready"],
        reader_count=reader_count,
        status=_status_label(
            st["ready"],
            reader_count,
            path_exists=st.get("exists", False),
        ),
        tracks=st.get("tracks", []),
    )


@app.delete("/api/videos/{video_id}", status_code=204)
async def delete_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")

    try:
        await media_server.delete_path(_mtx_path(video))
    except MediaServerError as e:
        if e.status_code != 404:
            raise HTTPException(502, str(e)) from e

    file_path = _video_file_path(video, db)
    file_path.unlink(missing_ok=True)
    thumbnails.delete_thumbnail(video_id)
    db.delete(video)
    db.commit()


@app.get("/api/videos/{video_id}/thumbnail")
async def video_thumbnail(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")
    if not _file_exists(video, db):
        raise HTTPException(404, "Video dosyası yok")

    if not thumbnails.has_thumbnail(video_id):
        thumbnails.generate_thumbnail(_video_file_path(video, db), video_id)

    path = thumbnails.thumbnail_path(video_id)
    if not path.is_file():
        raise HTTPException(404, "Önizleme oluşturulamadı")

    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )
