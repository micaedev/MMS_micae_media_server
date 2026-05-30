export type StorageVolume = {
  id: string;
  label: string;
  host_path: string;
  container_path: string;
  custom: boolean;
};

export type StorageRoot = {
  id: string;
  label: string;
  host_path: string;
  container_path: string;
  available: boolean;
};

export type BrowseEntry = { name: string; path: string };

export type BrowseResult = {
  root_id: string;
  root_label: string;
  current_path: string;
  parent_path: string | null;
  host_display: string;
  entries: BrowseEntry[];
};

export type Video = {
  id: string;
  title: string;
  filename: string;
  size: number;
  stream_path: string;
  storage_id: string;
  storage_label: string;
  created_at: string;
  rtsp_url: string;
  webrtc_url: string;
  whep_url: string;
  watch_url: string;
  hls_url: string;
  status: string;
  file_exists: boolean;
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

const STORAGE_PREF_KEY = "mediaserver.storage_id";

export function getPreferredStorageId(): string {
  return localStorage.getItem(STORAGE_PREF_KEY) || "default";
}

export function setPreferredStorageId(id: string): void {
  localStorage.setItem(STORAGE_PREF_KEY, id);
}

export async function fetchStorageVolumes(): Promise<StorageVolume[]> {
  const res = await fetch("/api/storage/volumes");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Depolama listesi alınamadı"));
  }
  return res.json();
}

export async function fetchStorageRoots(): Promise<StorageRoot[]> {
  const res = await fetch("/api/storage/roots");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Disk listesi alınamadı"));
  }
  return res.json();
}

export async function browseStorage(
  rootId: string,
  path = "",
): Promise<BrowseResult> {
  const q = new URLSearchParams({ root_id: rootId, path });
  const res = await fetch(`/api/storage/browse?${q}`);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Klasör gezilemedi"));
  }
  return res.json();
}

export async function createStorageLocation(body: {
  root_id: string;
  browse_path: string;
  folder_name: string;
  label: string;
}): Promise<StorageVolume> {
  const res = await fetch("/api/storage/locations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(parseApiError(data, "Kayıt yeri oluşturulamadı"));
  }
  return res.json();
}

export async function deleteStorageLocation(id: string): Promise<void> {
  const res = await fetch(`/api/storage/locations/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Kayıt yeri silinemedi"));
  }
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
  storageId: string,
  onProgress?: (pct: number) => void,
): Promise<Video> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("file", file);
    form.append("storage_id", storageId);

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
  hls_ready?: boolean;
  mtx_path?: string;
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
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120_000);
  const res = await fetch(`/api/videos/${id}/start`, {
    method: "POST",
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t));
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

export async function stopStream(id: string): Promise<void> {
  const res = await fetch(`/api/videos/${id}/stop`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Yayin durdurulamadi"));
  }
}

export async function stopAllStreams(): Promise<void> {
  const res = await fetch("/api/videos/stop-all", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Tum yayinlar durdurulamadi"));
  }
}

export async function startAllStreams(): Promise<void> {
  const res = await fetch("/api/videos/start-all", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Tum yayinlar baslatilamadi"));
  }
}

export async function deleteVideo(id: string): Promise<void> {
  const res = await fetch(`/api/videos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(parseApiError(body, "Silme başarısız"));
  }
}
