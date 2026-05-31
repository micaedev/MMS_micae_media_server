export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR");
}

function formatFps(fps: number): string {
  if (fps >= 10) return String(Math.round(fps * 100) / 100);
  return fps.toFixed(2);
}

function formatCodec(codec: string): string {
  const c = codec.toLowerCase();
  if (c === "h264") return "H.264";
  if (c === "hevc" || c === "h265") return "H.265";
  if (c === "vp9") return "VP9";
  if (c === "av1") return "AV1";
  return codec;
}

export function formatVideoCodec(codec: string | null | undefined): string {
  if (!codec) return "analiz ediliyor…";
  if (codec === "unknown") return "bilinmiyor";
  return formatCodec(codec);
}

export function formatVideoFps(fps: number | null | undefined): string {
  if (typeof fps !== "number" || Number.isNaN(fps)) return "—";
  return formatFps(fps);
}

export function formatVideoAudio(hasAudio: boolean | null | undefined): string {
  if (hasAudio === true) return "var";
  if (hasAudio === false) return "yok";
  return "—";
}
