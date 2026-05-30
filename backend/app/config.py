import os
from pathlib import Path

MEDIASERVER_API_URL = os.getenv(
    "MEDIASERVER_API_URL", "http://127.0.0.1:9997"
).rstrip("/")
MEDIASERVER_RTSP_URL = os.getenv(
    "MEDIASERVER_RTSP_URL", "rtsp://127.0.0.1:8554"
).rstrip("/")
VIDEOS_DIR = Path(os.getenv("VIDEOS_DIR", "/videos"))
PUBLIC_HOST = os.getenv("PUBLIC_HOST", "localhost")
WEBRTC_PORT = int(os.getenv("WEBRTC_PORT", "8889"))
HLS_PORT = int(os.getenv("HLS_PORT", "8888"))
RTSP_PORT = int(os.getenv("RTSP_PORT", "8554"))
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:////data/app.db")
_default_max = 50 * 1024 * 1024 * 1024
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(_default_max)))

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".mov"}
