import { useState } from "react";
import type { Video } from "../api";
import {
  formatVideoAudio,
  formatVideoCodec,
  formatVideoFps,
} from "../utils/format";

type Props = { video: Video };

export default function VideoMediaCell({ video }: Props) {
  const [thumbOk, setThumbOk] = useState(true);

  if (!video.file_exists) {
    return <span className="media-meta">—</span>;
  }

  const codec = formatVideoCodec(video.video_codec);
  const fps = formatVideoFps(video.video_fps);
  const audio = formatVideoAudio(video.has_audio);
  const thumbSrc = video.thumbnail_url || `/api/videos/${video.id}/thumbnail`;

  return (
    <div className="video-media-cell">
      {thumbOk ? (
        <img
          className="video-thumb"
          src={thumbSrc}
          alt={`${video.title} önizleme`}
          loading="lazy"
          width={160}
          height={90}
          onError={() => setThumbOk(false)}
        />
      ) : (
        <div className="video-thumb video-thumb-missing" title="Önizleme yok">
          önizleme yok
        </div>
      )}
      <dl className="media-details">
        <div>
          <dt>Codec:</dt>
          <dd>{codec}</dd>
        </div>
        <div>
          <dt>Ses:</dt>
          <dd>{audio}</dd>
        </div>
        <div>
          <dt>fps:</dt>
          <dd>{fps}</dd>
        </div>
      </dl>
    </div>
  );
}
