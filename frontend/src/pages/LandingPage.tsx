import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="landing">
      <h1 className="landing-title">Media Server</h1>
      <p className="landing-lead">
        Videolarınızı yükleyin, LAN üzerinden tarayıcıda HLS veya VLC ile RTSP
        olarak izleyin.
      </p>

      <div className="landing-cards">
        <Link to="/setup" className="landing-card">
          <span className="landing-card-icon" aria-hidden>
            ⚙
          </span>
          <h2>Kurulum</h2>
          <p>
            Video yükleme, disk seçimi, yayın başlat/durdur ve kütüphane
            yönetimi.
          </p>
          <span className="landing-card-cta">Kuruluma git →</span>
        </Link>

        <Link to="/watch" className="landing-card landing-card-accent">
          <span className="landing-card-icon" aria-hidden>
            ▶
          </span>
          <h2>İzleme</h2>
          <p>
            Yüklenmiş videoları listele, tarayıcıda HLS ile izle, RTSP URL
            kopyala.
          </p>
          <span className="landing-card-cta">İzlemeye git →</span>
        </Link>
      </div>

      <p className="help landing-foot">
        HLS port <strong>8888</strong> · RTSP <strong>8554</strong> · WebRTC{" "}
        <strong>8889</strong> (deneysel)
      </p>
    </div>
  );
}
