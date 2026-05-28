import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
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
from app.mtx_client import MediaMTXClient, MediaMTXError
from app.schemas import VideoOut, VideoStatusOut

logger = logging.getLogger(__name__)
mtx = MediaMTXClient()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(VIDEOS_DIR, 0o777)
    Base.metadata.create_all(bind=engine)
    try:
        await mtx.check_connection()
        logger.info("MediaMTX API bağlantısı OK: %s", mtx.base_url)
        db = SessionLocal()
        try:
            videos = db.query(models.Video).all()
            for video in videos:
                try:
                    await mtx.ensure_path(
                        video.mtx_path,
                        f"/videos/{video.filename}",
                    )
                except MediaMTXError as exc:
                    logger.error("Path senkron hatası %s: %s", video.id, exc)
            if videos:
                logger.info("MediaMTX path senkronu: %s video", len(videos))
        finally:
            db.close()
    except MediaMTXError as exc:
        logger.error("MediaMTX API başlangıçta erişilemedi: %s", exc)
    yield


app = FastAPI(title="MediaMTX Web API", version="1.0.0", lifespan=lifespan)

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


def _status_label(ready: bool, reader_count: int) -> str:
    if reader_count > 0:
        return "streaming"
    if ready:
        return "ready"
    return "idle"


def _to_video_out(video: models.Video, status: str = "idle") -> VideoOut:
    rtsp, watch, whep, page, hls = _stream_urls(video.id)
    return VideoOut(
        id=video.id,
        title=video.title,
        filename=video.filename,
        size=video.size,
        mtx_path=video.mtx_path,
        created_at=video.created_at,
        rtsp_url=rtsp,
        webrtc_url=watch,
        whep_url=whep,
        watch_url=page,
        hls_url=hls,
        status=status,
    )


@app.get("/api/health")
async def health():
    try:
        await mtx.check_connection()
        return {"ok": True, "mediamtx": "connected"}
    except MediaMTXError as exc:
        return {"ok": False, "mediamtx": "disconnected", "error": str(exc)}


async def _video_with_status(video: models.Video) -> VideoOut:
    await mtx.ensure_path(video.mtx_path, f"/videos/{video.filename}")
    try:
        st = await mtx.get_path_status(video.mtx_path)
        status = _status_label(st["ready"], len(st["readers"]))
    except MediaMTXError:
        status = "unknown"
    return _to_video_out(video, status)


@app.get("/api/videos", response_model=list[VideoOut])
async def list_videos(db: Session = Depends(get_db)):
    videos = db.query(models.Video).order_by(models.Video.created_at.desc()).all()
    result = []
    for video in videos:
        try:
            result.append(await _video_with_status(video))
        except MediaMTXError:
            result.append(_to_video_out(video, "unknown"))
    return result


@app.post("/api/videos/sync")
async def sync_all_paths(db: Session = Depends(get_db)):
    videos = db.query(models.Video).all()
    synced = 0
    for video in videos:
        await mtx.reload_path(video.mtx_path, f"/videos/{video.filename}")
        synced += 1
    return {"synced": synced, "note": "Path'ler runOnInit ile yeniden oluşturuldu"}


@app.post("/api/videos/restart-all")
async def restart_all_streams(db: Session = Depends(get_db)):
    videos = db.query(models.Video).all()
    restarted = 0
    for video in videos:
        await mtx.reload_path(video.mtx_path, f"/videos/{video.filename}")
        restarted += 1
    return {"restarted": restarted, "note": "Tum yayinlar yeniden baslatildi"}


@app.post("/api/videos", response_model=VideoOut, status_code=201)
async def upload_video(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.filename:
        raise HTTPException(400, "Dosya adı gerekli")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            400,
            f"Desteklenmeyen format. İzin verilenler: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    video_id = uuid.uuid4().hex
    stored_name = f"{video_id}{ext}"
    dest = VIDEOS_DIR / stored_name

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

    container_path = f"/videos/{stored_name}"
    try:
        await mtx.add_path(video_id, container_path)
    except MediaMTXError as e:
        dest.unlink(missing_ok=True)
        logger.error("MediaMTX path eklenemedi: %s", e)
        raise HTTPException(502, str(e)) from e

    title = Path(file.filename).stem
    video = models.Video(
        id=video_id,
        title=title,
        filename=stored_name,
        size=size,
        mtx_path=video_id,
    )
    db.add(video)
    db.commit()
    db.refresh(video)
    return _to_video_out(video)


@app.post("/api/videos/{video_id}/restart")
async def restart_video_stream(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadi")

    try:
        await mtx.reload_path(video.mtx_path, f"/videos/{video.filename}")
        st = await mtx.wake_publisher(video.mtx_path, timeout_sec=35.0)
    except MediaMTXError as e:
        raise HTTPException(502, str(e)) from e

    reader_count = len(st["readers"])
    return {
        "id": video_id,
        "status": _status_label(st["ready"], reader_count),
        "ready": st["ready"],
        "tracks": st.get("tracks", []),
        "message": "Yayin yeniden baslatildi",
    }


@app.post("/api/videos/{video_id}/start")
async def start_video_stream(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")

    try:
        await mtx.ensure_path(video.mtx_path, f"/videos/{video.filename}")
        st = await mtx.wake_publisher(video.mtx_path, timeout_sec=35.0)
    except MediaMTXError as e:
        raise HTTPException(502, str(e)) from e

    reader_count = len(st["readers"])
    return {
        "status": _status_label(st["ready"], reader_count),
        "ready": st["ready"],
        "tracks": st.get("tracks", []),
        "hint": (
            "Yayın hazır; WebRTC oynatıcıyı açabilirsiniz."
            if st["ready"]
            else "Yayın henüz hazır değil — birkaç saniye sonra tekrar deneyin."
        ),
    }


@app.get("/api/videos/{video_id}/status", response_model=VideoStatusOut)
async def video_status(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")

    try:
        st = await mtx.get_path_status(video.mtx_path)
    except MediaMTXError as e:
        raise HTTPException(502, str(e)) from e

    reader_count = len(st["readers"])
    return VideoStatusOut(
        id=video_id,
        ready=st["ready"],
        reader_count=reader_count,
        status=_status_label(st["ready"], reader_count),
        tracks=st.get("tracks", []),
    )


@app.delete("/api/videos/{video_id}", status_code=204)
async def delete_video(video_id: str, db: Session = Depends(get_db)):
    video = db.get(models.Video, video_id)
    if not video:
        raise HTTPException(404, "Video bulunamadı")

    try:
        await mtx.delete_path(video.mtx_path)
    except MediaMTXError as e:
        if e.status_code != 404:
            raise HTTPException(502, str(e)) from e

    file_path = VIDEOS_DIR / video.filename
    file_path.unlink(missing_ok=True)
    db.delete(video)
    db.commit()
