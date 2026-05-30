import { useCallback, useEffect, useState } from "react";
import type { Video } from "../api";
import { fetchVideos } from "../api";

export function useVideos(pollMs = 8000) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const unknown = list.filter(
          (v) => v.file_exists && v.status === "unknown",
        ).length;
        if (noFile > 0) {
          setError(
            `${noFile} kayıt var ama video dosyası diskte yok. ` +
              "Kurulum ekranından yeniden yükleyin veya Sil ile kaldırın.",
          );
        } else if (unknown > 0) {
          setError(
            `${unknown} video Media Server ile senkron değil; yenileyin veya yayını yeniden başlatın.`,
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
    void load();
    const t = setInterval(() => void load(), pollMs);
    return () => clearInterval(t);
  }, [load, pollMs]);

  return { videos, loading, error, setError, load };
}
