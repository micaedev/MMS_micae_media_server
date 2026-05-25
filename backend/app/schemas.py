from datetime import datetime

from pydantic import BaseModel


class VideoOut(BaseModel):
    id: str
    title: str
    filename: str
    size: int
    mtx_path: str
    created_at: datetime
    rtsp_url: str
    webrtc_url: str
    whep_url: str
    watch_url: str
    hls_url: str
    status: str = "idle"

    model_config = {"from_attributes": True}


class VideoStatusOut(BaseModel):
    id: str
    ready: bool
    reader_count: int
    status: str
    tracks: list[str] = []
