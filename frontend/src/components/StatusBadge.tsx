export default function StatusBadge({
  status,
  fileExists,
}: {
  status: string;
  fileExists: boolean;
}) {
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
