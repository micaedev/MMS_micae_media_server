import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

THUMB_WIDTH = 192


def thumbnail_path_for(video_file: Path) -> Path:
    return video_file.with_suffix(".jpg")


async def generate_thumbnail(video_file: Path, thumb_file: Path | None = None) -> bool:
    """Videonun ilk karesini JPEG olarak yazar. Başarılıysa True."""
    if not video_file.is_file():
        return False
    out = thumb_file or thumbnail_path_for(video_file)
    out.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(video_file),
        "-frames:v",
        "1",
        "-q:v",
        "4",
        "-vf",
        f"scale={THUMB_WIDTH}:-1",
        str(out),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()
    if proc.returncode != 0:
        logger.warning(
            "Thumbnail üretilemedi %s: %s",
            video_file,
            stderr.decode(errors="replace")[:300],
        )
        return False
    if out.is_file() and out.stat().st_size > 0:
        return True
    return False


async def ensure_thumbnail(video_file: Path) -> Path | None:
    thumb = thumbnail_path_for(video_file)
    if thumb.is_file() and thumb.stat().st_size > 0:
        return thumb
    if await generate_thumbnail(video_file, thumb):
        return thumb
    return None
