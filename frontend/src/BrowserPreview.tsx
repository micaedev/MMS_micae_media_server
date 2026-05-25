import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { fetchVideoStatus, startStream } from "./api";
import { hlsUrl, watchPageUrl } from "./whep";

type Props = {
  videoId: string;
  title: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BrowserPreview({ videoId, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [message, setMessage] = useState("Yayın hazırlanıyor…");
  const [error, setError] = useState<string | null>(null);
  const [playHls, setPlayHls] = useState(false);
  const [showWebRtc, setShowWebRtc] = useState(false);
  const streamUrl = hlsUrl(videoId);
  const webrtcUrl = watchPageUrl(videoId);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      setError(null);
      setPlayHls(false);
      setMessage("FFmpeg yayını başlatılıyor (ilk açılış 10–30 sn)…");

      try {
        const start = await startStream(videoId);
        if (cancelled) return;

        if (!start.ready) {
          for (let i = 0; i < 40 && !cancelled; i++) {
            const st = await fetchVideoStatus(videoId);
            if (st.ready) break;
            await sleep(500);
          }
        }

        if (!cancelled) {
          setMessage("Yayın hazır — HLS oynatıcı başlıyor.");
          setPlayHls(true);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Hazırlık hatası");
        }
      }
    }

    void prepare();
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  useEffect(() => {
    if (!playHls || !videoRef.current) return;

    const video = videoRef.current;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => {
          /* autoplay engellenirse kullanıcı play'e basar */
        });
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (data.fatal) {
          setError(`HLS hatası: ${data.type} — ${data.details}`);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl;
      void video.play().catch(() => undefined);
    } else {
      setError("Tarayıcı HLS desteklemiyor.");
    }

    return () => {
      hls?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [playHls, streamUrl]);

  return (
    <section className="card preview">
      <h2 style={{ marginTop: 0, fontSize: "1.1rem" }}>Tarayıcı: {title}</h2>
      {message && !error && <p className="help">{message}</p>}
      {error && <p className="error">{error}</p>}

      <video
        ref={videoRef}
        controls
        playsInline
        muted
        style={{
          width: "100%",
          maxHeight: "min(70vh, 520px)",
          borderRadius: "8px",
          background: "#000",
        }}
      />

      <p className="help">
        HLS: <code>{streamUrl}</code> (port <strong>8888</strong>). Ses yoksa video
        sessiz yüklenir — ses düğmesine basın.
      </p>

      <details
        style={{ marginTop: "0.75rem" }}
        open={showWebRtc}
        onToggle={(e) => setShowWebRtc((e.target as HTMLDetailsElement).open)}
      >
        <summary style={{ cursor: "pointer" }}>
          WebRTC (düşük gecikme, deneysel)
        </summary>
        <p className="help" style={{ marginTop: "0.5rem" }}>
          Yerel ağda STUN kapalıdır; yine de bağlanmazsa HLS kullanın.
        </p>
        <iframe
          title={`WebRTC ${title}`}
          src={webrtcUrl}
          style={{
            width: "100%",
            height: "360px",
            border: "none",
            borderRadius: "8px",
            background: "#000",
            marginTop: "0.5rem",
          }}
          allow="autoplay; fullscreen"
        />
        <p className="help">
          <a href={webrtcUrl} target="_blank" rel="noreferrer">
            WebRTC yeni sekme
          </a>
        </p>
      </details>
    </section>
  );
}
