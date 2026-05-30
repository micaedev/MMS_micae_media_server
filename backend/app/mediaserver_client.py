import asyncio
import logging
import time
from pathlib import Path

import httpx

from app.config import HLS_BASE_URL, MEDIASERVER_API_URL, MEDIASERVER_RTSP_URL

logger = logging.getLogger(__name__)


class MediaServerError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


class MediaServerClient:
    def __init__(self, base_url: str = MEDIASERVER_API_URL):
        self.base_url = base_url.rstrip("/")

    def _build_publish_command(self, file_path: str) -> str:
        ext = Path(file_path).suffix.lower()
        # -re = normal hız (aksi halde WebRTC/HLS çok hızlı ve bozuk oynar)
        if ext == ".webm":
            video = (
                "-map 0:v:0 -c:v libx264 -preset veryfast -tune zerolatency "
                "-profile:v baseline -pix_fmt yuv420p -g 30"
            )
        else:
            video = "-map 0:v:0 -c:v copy -bsf:v h264_mp4toannexb"
        return (
            f"ffmpeg -hide_banner -loglevel error -re -stream_loop -1 "
            f"-fflags +genpts -i {file_path} {video} -an "
            f"-f rtsp -rtsp_transport tcp "
            f"rtsp://127.0.0.1:$RTSP_PORT/$MTX_PATH"
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json: dict | None = None,
        retries: int = 3,
    ) -> httpx.Response:
        last_error: Exception | None = None
        url = f"{self.base_url}{path}"

        for attempt in range(retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.request(method, url, json=json)
                    return response
            except httpx.RequestError as exc:
                last_error = exc
                logger.warning(
                    "Media Server isteği başarısız (%s %s), deneme %s/%s: %s",
                    method,
                    path,
                    attempt + 1,
                    retries,
                    exc,
                )
                if attempt + 1 < retries:
                    await asyncio.sleep(1.5 * (attempt + 1))

        raise MediaServerError(
            f"Media Server API'ye bağlanılamadı ({self.base_url}). "
            f"mediaserver konteyneri çalışıyor mu? Detay: {last_error}"
        ) from last_error

    async def check_connection(self) -> None:
        response = await self._request("GET", "/v3/config/global/get", retries=5)
        if response.status_code != 200:
            raise MediaServerError(
                f"Media Server API yanıt vermiyor: {response.status_code} {response.text}",
                status_code=response.status_code,
            )

    async def path_configured(self, path_name: str) -> bool:
        response = await self._request(
            "GET",
            f"/v3/config/paths/get/{path_name}",
            retries=1,
        )
        return response.status_code == 200

    async def reload_path(self, path_name: str, file_path: str) -> None:
        if await self.path_configured(path_name):
            try:
                await self.delete_path(path_name)
            except MediaServerError:
                pass
        await self.add_path(path_name, file_path)

    async def ensure_path(self, path_name: str, file_path: str) -> None:
        if await self.path_configured(path_name):
            return
        logger.info("Media Server path oluşturuluyor: %s", path_name)
        await self.add_path(path_name, file_path)

    async def add_path(self, path_name: str, file_path: str) -> None:
        cmd = self._build_publish_command(file_path)
        body = {
            "runOnInit": cmd,
            "runOnInitRestart": True,
        }
        response = await self._request(
            "POST",
            f"/v3/config/paths/add/{path_name}",
            json=body,
        )
        if response.status_code not in (200, 201):
            raise MediaServerError(
                f"Path eklenemedi ({response.status_code}): {response.text}",
                status_code=response.status_code,
            )

    async def delete_path(self, path_name: str) -> None:
        response = await self._request(
            "DELETE",
            f"/v3/config/paths/delete/{path_name}",
        )
        if response.status_code not in (200, 204):
            raise MediaServerError(
                f"Path silinemedi ({response.status_code}): {response.text}",
                status_code=response.status_code,
            )

    async def wake_publisher(self, path_name: str, timeout_sec: float = 90.0) -> dict:
        rtsp_url = f"{MEDIASERVER_RTSP_URL}/{path_name}"
        probe = await asyncio.create_subprocess_exec(
            "ffprobe",
            "-hide_banner",
            "-loglevel",
            "error",
            "-rtsp_transport",
            "tcp",
            "-show_entries",
            "stream=width,height",
            "-of",
            "csv=p=0",
            rtsp_url,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

        deadline = time.monotonic() + timeout_sec
        try:
            while time.monotonic() < deadline:
                st = await self.get_path_status(path_name)
                if st.get("ready"):
                    return st
                await asyncio.sleep(0.5)
            return await self.get_path_status(path_name)
        finally:
            if probe.returncode is None:
                probe.terminate()
                try:
                    await asyncio.wait_for(probe.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    probe.kill()
                    await probe.wait()

    async def wait_for_hls(self, path_name: str, timeout_sec: float = 90.0) -> bool:
        url = f"{HLS_BASE_URL}/{path_name}/index.m3u8"
        deadline = time.monotonic() + timeout_sec
        async with httpx.AsyncClient(timeout=10.0) as client:
            while time.monotonic() < deadline:
                try:
                    response = await client.get(url)
                    if response.status_code == 200 and "#EXTM3U" in response.text:
                        logger.info("HLS manifest hazir: %s", path_name)
                        return True
                except httpx.RequestError as exc:
                    logger.debug("HLS bekleniyor %s: %s", path_name, exc)
                await asyncio.sleep(1.0)
        logger.warning("HLS manifest zaman asimi: %s", path_name)
        return False

    async def get_path_status(self, path_name: str) -> dict:
        try:
            response = await self._request("GET", f"/v3/paths/get/{path_name}", retries=1)
        except MediaServerError:
            return {"ready": False, "readers": [], "exists": False, "tracks": []}

        if response.status_code == 404:
            return {"ready": False, "readers": [], "exists": False, "tracks": []}
        if response.status_code != 200:
            raise MediaServerError(
                f"Path durumu alınamadı ({response.status_code}): {response.text}",
                status_code=response.status_code,
            )
        data = response.json()
        return {
            "ready": data.get("ready", False),
            "readers": data.get("readers", []),
            "exists": True,
            "tracks": data.get("tracks", []),
        }
