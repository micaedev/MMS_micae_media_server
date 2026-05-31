"""ffprobe ile video codec, fps ve ses bilgisi."""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

# Analiz başarısız; tekrar denenmez (UI: bilinmiyor)
PROBE_FAILED = "unknown"


@dataclass(frozen=True)
class MediaProbe:
    video_codec: str | None
    video_fps: float | None
    has_audio: bool | None


def _parse_fps(rate: str | None) -> float | None:
    if not rate or rate in ("0/0", "N/A", "0"):
        return None
    if "/" in rate:
        num, den = rate.split("/", 1)
        try:
            n, d = float(num), float(den)
            if d == 0:
                return None
            return round(n / d, 3)
        except ValueError:
            return None
    try:
        return round(float(rate), 3)
    except ValueError:
        return None


def probe_media(path: Path) -> MediaProbe:
    """Dosyayı ffprobe ile analiz eder."""
    if not path.is_file():
        return MediaProbe(PROBE_FAILED, None, None)

    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_streams",
                str(path),
            ],
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        logger.warning("ffprobe çalıştırılamadı %s: %s", path, exc)
        return MediaProbe(PROBE_FAILED, None, None)

    if proc.returncode != 0:
        logger.warning(
            "ffprobe hata %s (rc=%s): %s",
            path,
            proc.returncode,
            (proc.stderr or proc.stdout or "")[:300],
        )
        return MediaProbe(PROBE_FAILED, None, None)

    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError:
        logger.warning("ffprobe JSON parse hatası: %s", path)
        return MediaProbe(PROBE_FAILED, None, None)

    video_codec: str | None = None
    video_fps: float | None = None
    has_audio = False

    for stream in data.get("streams") or []:
        if not isinstance(stream, dict):
            continue
        kind = stream.get("codec_type")
        if kind == "video" and video_codec is None:
            name = stream.get("codec_name")
            video_codec = str(name).lower() if name else None
            video_fps = _parse_fps(stream.get("avg_frame_rate")) or _parse_fps(
                stream.get("r_frame_rate")
            )
        elif kind == "audio":
            has_audio = True

    if not video_codec:
        logger.warning("ffprobe video akışı yok: %s", path)
        return MediaProbe(PROBE_FAILED, None, has_audio)

    return MediaProbe(video_codec=video_codec, video_fps=video_fps, has_audio=has_audio)
