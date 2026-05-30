import { useState } from "react";

type Props = {
  videoId: string;
  title: string;
  thumbnailUrl?: string;
  missing?: boolean;
};

export default function VideoThumbnail({
  videoId,
  title,
  thumbnailUrl,
  missing,
}: Props) {
  const [failed, setFailed] = useState(false);
  const src = thumbnailUrl || `/api/videos/${videoId}/thumbnail`;

  if (missing || failed) {
    return (
      <div className="video-thumb video-thumb-placeholder" title="Önizleme yok">
        <span>—</span>
      </div>
    );
  }

  return (
    <img
      className="video-thumb"
      src={src}
      alt={`${title} önizleme`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
