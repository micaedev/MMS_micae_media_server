import { useCallback, useEffect, useRef, useState } from "react";
import type { Video } from "./api";
import { deleteVideo, fetchVideos, uploadVideo } from "./api";
import BrowserPreview from "./BrowserPreview";
import { watchPageUrl } from "./whep";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR");
}

function statusBadge(status: string) {
  const cls =
    status === "streaming"
      ? "badge-streaming"
      : status === "ready"
        ? "badge-ready"
        : "badge-idle";
  const label =
    status === "streaming"
      ? "Yayında"
      : status === "ready"
        ? "Hazır"
        : status === "unknown"
          ? "Bilinmiyor"
          : "Beklemede";
  return <span className={`badge ${cls}`}>{label}</span>;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function App() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const health = await fetch("/api/health").then((r) => r.json());
      if (health.mediamtx === "disconnected") {
        setError(
          health.error ||
            "MediaMTX API bağlantısı yok. docker compose logs mediamtx kontrol edin.",
        );
      }
      const list = await fetchVideos();
      setVideos(list);
      if (health.mediamtx === "connected") {
        const missing = list.filter((v) => v.status === "unknown").length;
        if (missing > 0) {
          setError(
            `${missing} video MediaMTX ile senkron değil; sayfayı yenileyin veya API'yi yeniden başlatın.`,
          );
        } else {
          setError(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      await uploadVideo(file, setProgress);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme hatası");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Bu videoyu silmek istediğinize emin misiniz?")) return;
    try {
      await deleteVideo(id);
      if (previewId === id) setPreviewId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Silinemedi");
    }
  };

  const previewVideo = videos.find((v) => v.id === previewId);

  return (
    <>
      <h1>MediaMTX Video Panel</h1>
      <p className="subtitle">
        Video yükleyin; tarayıcıda WebRTC, VLC&apos;de RTSP ile izleyin.
      </p>

      <section className="card">
        <div
          className={`dropzone ${dragOver ? "dragover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".mp4,.mkv,.mov,video/*"
            disabled={uploading}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {uploading ? (
            <p>Yükleniyor… %{progress}</p>
          ) : (
            <p>Video sürükleyin veya tıklayarak seçin (.mp4, .mkv, .mov)</p>
          )}
        </div>
        {uploading && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <p className="help">
          <strong>Tarayıcıda izle</strong> = HLS (port <strong>8888</strong>, güvenilir).
          <strong>VLC</strong> = RTSP (port <strong>8554</strong>). WebRTC (8889) deneysel.
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Videolarım</h2>
        {loading ? (
          <p className="empty">Yükleniyor…</p>
        ) : videos.length === 0 ? (
          <p className="empty">Henüz video yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Boyut</th>
                <th>Tarih</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.title}</strong>
                    <div className="url-row">
                      <code>{v.rtsp_url}</code>
                    </div>
                  </td>
                  <td>{formatBytes(v.size)}</td>
                  <td>{formatDate(v.created_at)}</td>
                  <td>{statusBadge(v.status)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        setPreviewId(previewId === v.id ? null : v.id)
                      }
                    >
                      Tarayıcıda izle
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void copyText(v.rtsp_url)}
                    >
                      RTSP (VLC)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void copyText(v.whep_url)}
                    >
                      WHEP
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => window.open(watchPageUrl(v.id), "_blank")}
                    >
                      Yeni sekme
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => void onDelete(v.id)}
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {previewVideo && (
        <BrowserPreview
          videoId={previewVideo.id}
          title={previewVideo.title}
        />
      )}
    </>
  );
}
