from datetime import datetime

from pydantic import BaseModel


class StorageVolumeOut(BaseModel):
    id: str
    label: str
    host_path: str
    container_path: str
    custom: bool = False


class StorageRootOut(BaseModel):
    id: str
    label: str
    host_path: str
    container_path: str
    available: bool


class BrowseEntryOut(BaseModel):
    name: str
    path: str


class BrowseOut(BaseModel):
    root_id: str
    root_label: str
    current_path: str
    parent_path: str | None
    host_display: str
    entries: list[BrowseEntryOut]


class CreateStorageLocationIn(BaseModel):
    root_id: str
    browse_path: str = ""
    folder_name: str
    label: str = ""


class VideoOut(BaseModel):
    id: str
    title: str
    filename: str
    size: int
    stream_path: str
    storage_id: str = "default"
    storage_label: str = ""
    created_at: datetime
    rtsp_url: str
    webrtc_url: str
    whep_url: str
    watch_url: str
    hls_url: str
    status: str = "idle"
    file_exists: bool = True
    thumbnail_url: str = ""

    model_config = {"from_attributes": True}


class VideoStatusOut(BaseModel):
    id: str
    ready: bool
    reader_count: int
    status: str
    tracks: list[str] = []
