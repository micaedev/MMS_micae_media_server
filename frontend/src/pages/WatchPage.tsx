import { useState } from "react";
import {
  restartAllStreams,
  restartStream,
  startAllStreams,
  startStream,
  stopAllStreams,
  stopStream,
} from "../api";
import BrowserPreview from "../BrowserPreview";
import AppNav from "../components/AppNav";
import StatusBadge from "../components/StatusBadge";
import { useVideos } from "../hooks/useVideos";
import VideoMediaCell from "../components/VideoMediaCell";
import { formatBytes, formatDate } from "../utils/format";

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function WatchPage() {
  const { videos, loading, error, setError, load } = useVideos();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [restartingAll, setRestartingAll] = useState(false);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [stoppingAll, setStoppingAll] = useState(false);
  const [startingAll, setStartingAll] = useState(false);
  const streamBusy = restartingAll || stoppingAll || startingAll;

  const onStartOrRestart = async (video: (typeof videos)[0]) => {
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

  const runBulk = async (
    fn: () => Promise<void>,
    msg: string,
    setBusy: (v: boolean) => void,
  ) => {
    try {
      setError(null);
      setBusy(true);
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : msg);
    } finally {
      setBusy(false);
    }
  };

  const previewVideo = videos.find((v) => v.id === previewId && v.file_exists);
  const playableCount = videos.filter((v) => v.file_exists).length;

  return (
    <>
      <AppNav />
      <header className="page-header">
        <h1>İzleme</h1>
        <p className="subtitle">
          Videoları tarayıcıda HLS ile izleyin veya RTSP URL&apos;lerini
          kopyalayın. Yükleme için{" "}
          <a href="/setup">Kurulum</a> ekranını kullanın.
        </p>
      </header>

      {error && (
        <section className="card">
          <p className="error">{error}</p>
        </section>
      )}

      <section className="card">
        <div className="card-toolbar">
          <h2 className="section-title">Videolar</h2>
          <div className="toolbar-buttons">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={streamBusy || loading || playableCount === 0}
              onClick={() => void runBulk(stopAllStreams, "Durdurulamadı", setStoppingAll)}
            >
              {stoppingAll ? "Durduruluyor…" : "Tümünü durdur"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={streamBusy || loading || playableCount === 0}
              onClick={() => void runBulk(startAllStreams, "Başlatılamadı", setStartingAll)}
            >
              {startingAll ? "Başlatılıyor…" : "Tümünü başlat"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={streamBusy || loading || playableCount === 0}
              onClick={() =>
                void runBulk(restartAllStreams, "Yenilenemedi", setRestartingAll)
              }
            >
              {restartingAll ? "Yenileniyor…" : "Tümünü yeniden başlat"}
            </button>
          </div>
        </div>
        {loading ? (
          <p className="empty">Yükleniyor…</p>
        ) : videos.length === 0 ? (
          <p className="empty">
            Henüz video yok. <a href="/setup">Kurulum</a> ekranından yükleyin.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Başlık</th>
                <th>Medya</th>
                <th>Disk</th>
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
                      {!missing && (
                        <div className="url-row">
                          <code>{v.rtsp_url}</code>
                        </div>
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
                    <td>{formatDate(v.created_at)}</td>
                    <td>
                      <StatusBadge status={v.status} fileExists={v.file_exists} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={missing}
                        onClick={() =>
                          setPreviewId(previewId === v.id ? null : v.id)
                        }
                      >
                        {previewId === v.id ? "Kapat" : "Tarayıcıda izle"}
                      </button>
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
                        disabled={missing}
                        onClick={() => void copyText(v.rtsp_url)}
                      >
                        RTSP
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={missing}
                        onClick={() => void copyText(v.hls_url)}
                      >
                        HLS URL
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={missing}
                        onClick={() => window.open(v.webrtc_url, "_blank")}
                      >
                        WebRTC
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="help">
          <strong>HLS</strong> önerilir (8888, gecikme ~birkaç sn).{" "}
          <strong>WebRTC</strong> (8889) düşük gecikme; paneli{" "}
          <code>http://{typeof window !== "undefined" ? window.location.hostname : "…"}:3000</code>{" "}
          ile aynı ağ IP&apos;sinden açın. <strong>RTSP</strong> VLC (8554).
        </p>
      </section>

      {previewVideo && (
        <BrowserPreview
          videoId={previewVideo.id}
          title={previewVideo.title}
          apiHlsUrl={previewVideo.hls_url}
          webrtcUrl={previewVideo.webrtc_url}
        />
      )}
    </>
  );
}
