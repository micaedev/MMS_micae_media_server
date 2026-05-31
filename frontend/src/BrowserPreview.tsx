import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { fetchStreamDebug, fetchVideoStatus, startStream } from "./api";
import { hlsDirectUrl, hlsUrl, watchPageUrl } from "./whep";

type Props = {
  videoId: string;
  title: string;
  /** API'den gelen HLS URL (PUBLIC_HOST ile) */
  apiHlsUrl?: string;
  /** API'den gelen WebRTC sayfa URL (.env PUBLIC_HOST) */
  webrtcUrl?: string;
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
        const res = await fetch(url, { cache: "no-store", redirect: "follow" });
        const text = await res.text();
        if (res.ok && text.includes("#EXTM3U")) {
          return res.url;
        }
      } catch {
        /* retry */
      }
    }
    await sleep(1500);
  }
  return null;
}

export default function BrowserPreview({
  videoId,
  title,
  apiHlsUrl,
  webrtcUrl: webrtcPageUrl,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [message, setMessage] = useState("Yayın hazırlanıyor…");
  const [error, setError] = useState<string | null>(null);
  const [playHls, setPlayHls] = useState(false);
  const [activeUrl, setActiveUrl] = useState("");
  const proxyUrl = hlsUrl(videoId);
  const directUrl = hlsDirectUrl(videoId);
  const webrtcUrl = webrtcPageUrl || watchPageUrl(videoId);

  useEffect(() => {
    let cancelled = false;

    async function prepare() {
      setError(null);
      setPlayHls(false);
      setActiveUrl("");
      setMessage("Yayın başlatılıyor (normal hız, -re)…");

      try {
        const started = await startStream(videoId);
        if (cancelled) return;

        let ready = Boolean(started.ready);
        for (let i = 0; i < 120 && !cancelled && !ready; i++) {
          const st = await fetchVideoStatus(videoId);
          ready = st.ready;
          if (ready) break;
          setMessage(`FFmpeg / yayın bekleniyor… (${i + 1}/120)`);
          await sleep(1000);
        }

        if (cancelled) return;

        if (!ready) {
          const dbg = await fetchStreamDebug(videoId).catch(() => null);
          setError(
            "Media Server yayını hazır değil (ready=false). İzleme listesinde " +
              "Yeniden başlat veya: curl -X POST .../restart-all. " +
              (dbg
                ? `Teşhis: path=${dbg.path_configured}, HLS panel=${dbg.hls_manifest_ok.via_panel_3000}`
                : ""),
          );
          return;
        }

        await sleep(2000);

        // Önce doğrudan 8888 (302 redirect); panel /hls/ proxy_redirect ile
        const candidates = [apiHlsUrl, directUrl, proxyUrl].filter(
          Boolean,
        ) as string[];
        setMessage("HLS manifest bekleniyor…");
        const okUrl = await waitForHlsManifest(candidates, 90_000);
        if (cancelled) return;

        if (!okUrl) {
          const dbg = await fetchStreamDebug(videoId).catch(() => null);
          setError(
            "HLS manifest yok. Portlar: panel 3000, HLS 8888, WebRTC 8889. " +
              "curl -s " +
              proxyUrl +
              " | head. " +
              (dbg
                ? `ready=${dbg.mediaserver.ready}, 8888=${dbg.hls_manifest_ok.direct_8888}`
                : "Önce Yeniden başlat."),
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
        HLS panel (önerilen, port 3000): <code>{proxyUrl}</code>
        <br />
        HLS doğrudan (8888): <code>{apiHlsUrl || directUrl}</code>
        <br />
        WebRTC: <code>{webrtcUrl}</code> — panel adresi ile aynı IP kullanın (
        <code>.env</code> içindeki <code>MEDIASERVER_PUBLIC_HOST</code>). Sorun
        olursa önce <strong>Yeniden başlat</strong>, gerekirse HLS kullanın.
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
