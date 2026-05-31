"""Ilk kare JPEG onizleme (ffmpeg)."""

from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

THUMBNAILS_DIR = Path(os.getenv("THUMBNAILS_DIR", "/data/thumbnails"))
THUMB_WIDTH = int(os.getenv("THUMBNAIL_WIDTH", "320"))


def ensure_dir() -> None:
    THUMBNAILS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(THUMBNAILS_DIR, 0o777)
    except OSError:
        pass


def thumbnail_path(video_id: str) -> Path:
    return THUMBNAILS_DIR / f"{video_id}.jpg"


def has_thumbnail(video_id: str) -> bool:
    path = thumbnail_path(video_id)
    return path.is_file() and path.stat().st_size > 0


def delete_thumbnail(video_id: str) -> None:
    thumbnail_path(video_id).unlink(missing_ok=True)


def _run_ffmpeg(args: list[str], timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def generate_thumbnail(video_path: Path, video_id: str, *, force: bool = False) -> bool:
    """Videonun ilk uygun karesini JPEG olarak yazar."""
    if not video_path.is_file():
        logger.warning("thumbnail: dosya yok %s", video_path)
        return False

    dest = thumbnail_path(video_id)
    if not force and has_thumbnail(video_id):
        return True

    ensure_dir()
    tmp = dest.parent / f"{dest.name}.part"
    tmp.unlink(missing_ok=True)

    w = THUMB_WIDTH
    src = str(video_path)
    # Bazi guvenlik kamerasi MP4'lerinde ilk kare decode edilemez; sirayla dene.
    attempts: list[list[str]] = [
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src,
            "-an",
            "-sn",
            "-dn",
            "-vf",
            f"scale={w}:-1",
            "-frames:v",
            "1",
            "-f",
            "image2",
            "-q:v",
            "4",
            str(tmp),
        ],
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            "1",
            "-i",
            src,
            "-an",
            "-vf",
            f"scale={w}:-1",
            "-frames:v",
            "1",
            "-f",
            "image2",
            "-q:v",
            "4",
            str(tmp),
        ],
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src,
            "-an",
            "-vf",
            f"thumbnail,scale={w}:-1",
            "-frames:v",
            "1",
            "-f",
            "image2",
            "-q:v",
            "4",
            str(tmp),
        ],
        [
            "ffmpeg",
            "-y",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            src,
            "-an",
            "-frames:v",
            "1",
            "-f",
            "image2",
            "-q:v",
            "4",
            str(tmp),
        ],
    ]

    last_err = ""
    for idx, cmd in enumerate(attempts, start=1):
        tmp.unlink(missing_ok=True)
        try:
            proc = _run_ffmpeg(cmd)
        except (OSError, subprocess.TimeoutExpired) as exc:
            last_err = str(exc)
            logger.warning("thumbnail deneme %s %s: %s", idx, video_path, exc)
            continue

        if proc.returncode == 0 and tmp.is_file() and tmp.stat().st_size > 0:
            tmp.replace(dest)
            try:
                os.chmod(dest, 0o644)
            except OSError:
                pass
            logger.info("thumbnail OK %s (deneme %s)", video_id, idx)
            return True

        last_err = (proc.stderr or proc.stdout or "").strip()
        logger.warning(
            "thumbnail deneme %s basarisiz %s: %s",
            idx,
            video_path,
            last_err[:400],
        )

    tmp.unlink(missing_ok=True)
    logger.error("thumbnail tum denemeler basarisiz %s: %s", video_path, last_err[:400])
    return False
