import { useCallback, useEffect, useRef, useState } from "react";
import type { Video } from "./api";
import {
  deleteVideo,
  fetchVideos,
  restartAllStreams,
  restartStream,
  startAllStreams,
  startStream,
  stopAllStreams,
  stopStream,
  uploadVideo,
} from "./api";
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

function statusBadge(status: string, fileExists: boolean) {
  if (!fileExists || status === "missing") {
    return <span className="badge badge-missing">Dosya yok</span>;
  }
  const cls =
    status === "streaming"
      ? "badge-streaming"
      : status === "ready"
        ? "badge-ready"
        : status === "stopped"
          ? "badge-stopped"
          : "badge-idle";
  const label =
    status === "streaming"
      ? "Yayında"
      : status === "ready"
        ? "Hazır"
        : status === "stopped"
          ? "Durduruldu"
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
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [restartingAll, setRestartingAll] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [startingAll, setStartingAll] = useState(false);
  const streamBusy = restartingAll || stoppingAll || startingAll;
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const health = await fetch("/api/health").then((r) => r.json());
      if (health.mediaserver === "disconnected") {
        setError(
          health.error ||
            "Media Server API bağlantısı yok. docker compose logs engine kontrol edin.",
        );
      }
      const list = await fetchVideos();
      setVideos(list);
      if (health.mediaserver === "connected") {
        const noFile = list.filter((v) => !v.file_exists).length;
        const unknown = list.filter((v) => v.file_exists && v.status === "unknown").length;
        if (noFile > 0) {
          setError(
            `${noFile} kayıt var ama video dosyası diskte yok (data/videos). ` +
              "Dosyayı yeniden yükleyin veya listeden Sil ile kaldırın.",
          );
        } else if (unknown > 0) {
          setError(
            `${unknown} video Media Server ile senkron değil; sayfayı yenileyin veya API'yi yeniden başlatın.`,
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

  const onStartOrRestart = async (video: Video) => {
    const starting = video.status === "stopped";
    try {
      setError(null);
      setRestartingId(video.id);
      if (starting) {
        await startStream(video.id);
      } else {
        await restartStream(video.id);
      }
      await load();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : starting
            ? "Yayin baslatilamadi"
            : "Yayin yeniden baslatilamadi",
      );
    } finally {
      setRestartingId(null);
    }
  };

  const onRestartAll = async () => {
    try {
      setError(null);
      setRestartingAll(true);
      await restartAllStreams();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tum yayinlar yeniden baslatilamadi",
      );
    } finally {
      setRestartingAll(false);
    }
  };

  const onStop = async (id: string) => {
    try {
      setError(null);
      setStoppingId(id);
      await stopStream(id);
      if (previewId === id) setPreviewId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yayin durdurulamadi");
    } finally {
      setStoppingId(null);
    }
  };

  const onStopAll = async () => {
    try {
      setError(null);
      setStoppingAll(true);
      await stopAllStreams();
      setPreviewId(null);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tum yayinlar durdurulamadi",
      );
    } finally {
      setStoppingAll(false);
    }
  };

  const onStartAll = async () => {
    try {
      setError(null);
      setStartingAll(true);
      await startAllStreams();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tum yayinlar baslatilamadi",
      );
    } finally {
      setStartingAll(false);
    }
  };

  const previewVideo = videos.find((v) => v.id === previewId && v.file_exists);
  const playableCount = videos.filter((v) => v.file_exists).length;

  return (
    <>
      <h1>Media Server</h1>
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", marginBottom: 0 }}>
            Videolarım
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onStopAll()}
              disabled={streamBusy || loading || playableCount === 0}
            >
              {stoppingAll ? "Tumu durduruluyor..." : "Tumunu durdur"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onStartAll()}
              disabled={streamBusy || loading || playableCount === 0}
            >
              {startingAll ? "Tumu baslatiliyor..." : "Tumunu baslat"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => void onRestartAll()}
              disabled={streamBusy || loading || playableCount === 0}
            >
              {restartingAll
                ? "Tumu yeniden baslatiliyor..."
                : "Tumunu yeniden baslat"}
            </button>
          </div>
        </div>
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
              {videos.map((v) => {
                const missing = !v.file_exists;
                return (
                <tr key={v.id} className={missing ? "row-missing" : undefined}>
                  <td>
                    <strong>{v.title}</strong>
                    {missing && (
                      <p className="missing-hint">
                        Dosya bulunamadı: <code>{v.filename}</code>
                      </p>
                    )}
                    {!missing && (
                      <div className="url-row">
                        <code>{v.rtsp_url}</code>
                      </div>
                    )}
                  </td>
                  <td>{formatBytes(v.size)}</td>
                  <td>{formatDate(v.created_at)}</td>
                  <td>{statusBadge(v.status, v.file_exists)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={missing}
                      title={missing ? "Video dosyası diskte yok" : undefined}
                      onClick={() =>
                        setPreviewId(previewId === v.id ? null : v.id)
                      }
                    >
                      Tarayıcıda izle
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void onStartOrRestart(v)}
                      disabled={
                        missing ||
                        streamBusy ||
                        restartingId === v.id ||
                        stoppingId === v.id
                      }
                      title={missing ? "Video dosyası diskte yok" : undefined}
                    >
                      {restartingId === v.id
                        ? v.status === "stopped"
                          ? "Baslatiliyor..."
                          : "Yeniden baslatiliyor..."
                        : v.status === "stopped"
                          ? "Baslat"
                          : "Yeniden baslat"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void onStop(v.id)}
                      disabled={
                        missing ||
                        streamBusy ||
                        stoppingId === v.id ||
                        restartingId === v.id
                      }
                      title={missing ? "Video dosyası diskte yok" : undefined}
                    >
                      {stoppingId === v.id ? "Durduruluyor..." : "Durdur"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={missing}
                      onClick={() => void copyText(v.rtsp_url)}
                    >
                      RTSP (VLC)
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={missing}
                      onClick={() => void copyText(v.whep_url)}
                    >
                      WHEP
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={missing}
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
              );
              })}
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
