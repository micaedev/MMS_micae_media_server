import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { fetchVideoStatus, startStream } from "./api";
import { hlsDirectUrl, hlsUrl, watchPageUrl } from "./whep";

type Props = {
  videoId: string;
  title: string;
  /** API'den gelen HLS URL (PUBLIC_HOST ile) */
  apiHlsUrl?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHlsManifest(
  urls: string[],
  maxWaitMs = 90_000,
): Promise<string | null> {
  const tried = [...new Set(urls.filter(Boolean))];
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    for (const url of tried) {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok && (await res.text()).includes("#EXTM3U")) return url;
      } catch {
        /* retry */
      }
    }
    await sleep(1500);
  }
  return null;
}

export default function BrowserPreview({ videoId, title, apiHlsUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [message, setMessage] = useState("Yayın hazırlanıyor…");
  const [error, setError] = useState<string | null>(null);
  const [playHls, setPlayHls] = useState(false);
  const [activeUrl, setActiveUrl] = useState("");
  const proxyUrl = hlsUrl(videoId);
  const directUrl = hlsDirectUrl(videoId);
  const webrtcUrl = watchPageUrl(videoId);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      setError(null);
      setPlayHls(false);
      setActiveUrl("");
      setMessage("Yayın başlatılıyor (normal hız, -re)…");

      try {
        await startStream(videoId);
        if (cancelled) return;

        for (let i = 0; i < 90 && !cancelled; i++) {
          const st = await fetchVideoStatus(videoId);
          if (st.ready) break;
          setMessage(`FFmpeg bekleniyor… (${i + 1}/90)`);
          await sleep(1000);
        }

        if (cancelled) return;

        await sleep(3000);

        const candidates = [apiHlsUrl, directUrl, proxyUrl].filter(
          Boolean,
        ) as string[];
        setMessage("HLS manifest bekleniyor…");
        const okUrl = await waitForHlsManifest(candidates, 90_000);
        if (cancelled) return;

        if (!okUrl) {
          setError(
            "HLS açılamadı. Önce Yeniden baslat, sonra tekrar dene. Test: curl -sI " +
              directUrl,
          );
          return;
        }

        setActiveUrl(okUrl);
        setMessage("HLS oynatılıyor (önerilen). WebRTC hızlı/bozuksa kullanmayın.");
        setPlayHls(true);
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
  }, [videoId, apiHlsUrl, directUrl, proxyUrl]);

  useEffect(() => {
    if (!playHls || !activeUrl || !videoRef.current) return;

    const video = videoRef.current;

    if (
      !Hls.isSupported() &&
      video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      video.src = activeUrl;
      void video.play().catch(() => undefined);
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }

    if (!Hls.isSupported()) {
      setError("Tarayıcı HLS desteklemiyor.");
      return;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
      liveDurationInfinity: true,
      manifestLoadingMaxRetry: 8,
      levelLoadingMaxRetry: 8,
      fragLoadingMaxRetry: 6,
    });
    hlsRef.current = hls;
    hls.loadSource(activeUrl);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void video.play().catch(() => undefined);
    });
    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
        return;
      }
      if (data.fatal) {
        setError(`HLS: ${data.type} — ${data.details}`);
      }
    });

    return () => {
      hls.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [playHls, activeUrl]);

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
        ID: <code>{videoId}</code>
        <br />
        HLS (önerilen): <code>{apiHlsUrl || directUrl}</code>
        <br />
        WebRTC hızlı oynuyorsa yayındaki <strong>-re</strong> eksikti; Yeniden
        baslat gerekir.
      </p>

      <details style={{ marginTop: "0.75rem" }}>
        <summary style={{ cursor: "pointer" }}>
          WebRTC (deneysel — hızlı/bozuk görüntü olabilir)
        </summary>
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
      </details>
    </section>
  );
}
