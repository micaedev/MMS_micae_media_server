/** MediaMTX WebRTC (Pion) URL'leri — doğrudan 8889 portu (proxy ile karışmaz). */

const WEBRTC_PORT = 8889;
const HLS_PORT = 8888;

function host(): string {
  return window.location.hostname || "127.0.0.1";
}

/** Yerleşik MediaMTX WebRTC oynatıcı sayfası */
export function watchPageUrl(pathId: string): string {
  return `http://${host()}:${WEBRTC_PORT}/${pathId}`;
}

/** WHEP endpoint (harici oyuncular için) */
export function whepUrl(pathId: string): string {
  return `${watchPageUrl(pathId)}/whep`;
}

/** HLS — panel ile aynı kök (nginx /hls → MediaMTX 8888) */
export function hlsUrl(pathId: string): string {
  return `/hls/${pathId}/index.m3u8`;
}

/** Doğrudan MediaMTX HLS (VLC / harici oyuncu) */
export function hlsDirectUrl(pathId: string): string {
  return `http://${host()}:${HLS_PORT}/${pathId}/index.m3u8`;
}
