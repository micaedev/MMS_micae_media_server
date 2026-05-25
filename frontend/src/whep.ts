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

/** HLS (tarayıcıda güvenilir oynatma) */
export function hlsUrl(pathId: string): string {
  return `http://${host()}:${HLS_PORT}/${pathId}/index.m3u8`;
}
