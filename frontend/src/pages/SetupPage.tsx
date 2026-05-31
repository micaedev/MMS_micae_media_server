import { useCallback, useEffect, useRef, useState } from "react";
import type { Video } from "../api";
import {
  deleteVideo,
  getPreferredStorageId,
  restartAllStreams,
  restartStream,
  startAllStreams,
  startStream,
  stopAllStreams,
  stopStream,
  uploadVideo,
} from "../api";
import AppNav from "../components/AppNav";
import StorageLocationSetup from "../components/StorageLocationSetup";
import StatusBadge from "../components/StatusBadge";
import { useVideos } from "../hooks/useVideos";
import VideoMediaCell from "../components/VideoMediaCell";
import { formatBytes, formatDate } from "../utils/format";

export default function SetupPage() {
  const { videos, loading, error, setError, load } = useVideos();
  const [storageId, setStorageId] = useState(getPreferredStorageId);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [restartingAll, setRestartingAll] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [startingAll, setStartingAll] = useState(false);
  const streamBusy = restartingAll || stoppingAll || startingAll;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      await uploadVideo(file, storageId, setProgress);
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
      if (starting) await startStream(video.id);
      else await restartStream(video.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yayın işlemi başarısız");
    } finally {
      setRestartingId(null);
    }
  };

  const streamAction = useCallback(
    async (fn: () => Promise<void>, failMsg: string) => {
      try {
        setError(null);
        await fn();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : failMsg);
      }
    },
    [load, setError],
  );

  const playableCount = videos.filter((v) => v.file_exists).length;

  return (
    <>
      <AppNav />
      <header className="page-header">
        <h1>Kurulum</h1>
        <p className="subtitle">
          Videoları yükleyin, kayıt diskini seçin, yayınları yönetin.
        </p>
      </header>

      <StorageLocationSetup
        storageId={storageId}
        onStorageIdChange={setStorageId}
        onError={setError}
      />

      <section className="card">
        <h2 className="section-title">Video yükle</h2>
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
            accept=".mp4,.mkv,.mov,.webm,video/*"
            disabled={uploading}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          {uploading ? (
            <p>Yükleniyor… %{progress}</p>
          ) : (
            <p>
              Sürükleyin veya seçin (.mp4, .mkv, .mov, .webm) — kayıt:{" "}
              <strong>{storageId}</strong>
            </p>
          )}
        </div>
        {uploading && (
          <div className="progress">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="card">
        <div className="card-toolbar">
          <h2 className="section-title">Video kütüphanesi</h2>
          <div className="toolbar-buttons">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={streamBusy || loading || playableCount === 0}
              onClick={() => {
                setStoppingAll(true);
                void streamAction(stopAllStreams, "Tümü durdurulamadı").finally(
                  () => setStoppingAll(false),
                );
              }}
            >
              {stoppingAll ? "Durduruluyor…" : "Tümünü durdur"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={streamBusy || loading || playableCount === 0}
              onClick={() => {
                setStartingAll(true);
                void streamAction(startAllStreams, "Tümü başlatılamadı").finally(
                  () => setStartingAll(false),
                );
              }}
            >
              {startingAll ? "Başlatılıyor…" : "Tümünü başlat"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={streamBusy || loading || playableCount === 0}
              onClick={() => {
                setRestartingAll(true);
                void streamAction(
                  restartAllStreams,
                  "Tümü yeniden başlatılamadı",
                ).finally(() => setRestartingAll(false));
              }}
            >
              {restartingAll ? "Yenileniyor…" : "Tümünü yeniden başlat"}
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
                <th>Medya</th>
                <th>Disk</th>
                <th>Boyut</th>
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
                          Dosya yok: <code>{v.filename}</code>
                        </p>
                      )}
                    </td>
                    <td>
                      <VideoMediaCell video={v} />
                    </td>
                    <td>
                      <span className="storage-tag">
                        {v.storage_label || v.storage_id}
                      </span>
                    </td>
                    <td>{formatBytes(v.size)}</td>
                    <td>
                      <StatusBadge status={v.status} fileExists={v.file_exists} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={missing || streamBusy || restartingId === v.id}
                        onClick={() => void onStartOrRestart(v)}
                      >
                        {restartingId === v.id
                          ? "…"
                          : v.status === "stopped"
                            ? "Başlat"
                            : "Yeniden başlat"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={missing || streamBusy || stoppingId === v.id}
                        onClick={() => {
                          setStoppingId(v.id);
                          void streamAction(
                            () => stopStream(v.id),
                            "Durdurulamadı",
                          ).finally(() => setStoppingId(null));
                        }}
                      >
                        {stoppingId === v.id ? "…" : "Durdur"}
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
        <p className="help">
          İzlemek için <a href="/watch">İzleme ekranına</a> geçin.
        </p>
      </section>
    </>
  );
}
