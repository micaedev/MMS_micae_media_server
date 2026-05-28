export type Video = {
  id: string;
  title: string;
  filename: string;
  size: number;
  mtx_path: string;
  created_at: string;
  rtsp_url: string;
  webrtc_url: string;
  whep_url: string;
  watch_url: string;
  hls_url: string;
  status: string;
};

function parseApiError(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "object" && item && "msg" in item) {
          return String((item as { msg: string }).msg);
        }
        return String(item);
      })
      .join("; ");
  }
  return fallback;
}

export async function fetchVideos(): Promise<Video[]> {
  const res = await fetch("/api/videos");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Video listesi alınamadı"));
  }
  return res.json();
}

export async function uploadVideo(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Video> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        let msg = `Yükleme başarısız (HTTP ${xhr.status})`;
        try {
          msg = parseApiError(JSON.parse(xhr.responseText), msg);
        } catch {
          if (xhr.responseText) msg = xhr.responseText.slice(0, 300);
        }
        reject(new Error(msg));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Ağ hatası — API veya web servisi çalışıyor mu?"));
    xhr.open("POST", "/api/videos");
    xhr.send(form);
  });
}

export type StreamStart = {
  status: string;
  ready: boolean;
  tracks: string[];
  hint?: string;
};

export async function fetchVideoStatus(id: string): Promise<{
  ready: boolean;
  status: string;
}> {
  const res = await fetch(`/api/videos/${id}/status`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Durum alınamadı"));
  }
  const data = await res.json();
  return { ready: Boolean(data.ready), status: String(data.status ?? "idle") };
}

export async function startStream(id: string): Promise<StreamStart> {
  const res = await fetch(`/api/videos/${id}/start`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Yayın başlatılamadı"));
  }
  return res.json();
}

export async function restartStream(id: string): Promise<void> {
  const res = await fetch(`/api/videos/${id}/restart`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Yayin yeniden baslatilamadi"));
  }
}

export async function restartAllStreams(): Promise<void> {
  const res = await fetch("/api/videos/restart-all", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Tum yayinlar yeniden baslatilamadi"));
  }
}

export async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Silme başarısız"));
  }
}
