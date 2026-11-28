/** MapLibre loaded from CDN inside iframe/WebView — not through Metro (avoids worker errors). */
export const MAPLIBRE_CDN = '6.20.0'

export function buildDeliveryMapHtml(
    latitude: number,
    longitude: number,
    readOnly: boolean,
    styleUrl: string,
): string {
    const readOnlyFlag = readOnly ? 'true' : 'false'
  const worker = `https://unpkg.com/maplibre-gl@${MAPLIBRE_CDN}/dist/maplibre-gl-csp-worker.js`
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<link href="https://unpkg.com/maplibre-gl@${MAPLIBRE_CDN}/dist/maplibre-gl.css" rel="stylesheet" />
<style>
html,body,#map{margin:0;padding:0;width:100%;height:100%;background:#e8eef5;}
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@${MAPLIBRE_CDN}/dist/maplibre-gl.js"></script>
<script>
maplibregl.setWorkerUrl(${JSON.stringify(worker)});
const readOnly = ${readOnlyFlag};
const map = new maplibregl.Map({
  container: 'map',
  style: ${JSON.stringify(styleUrl)},
  center: [${longitude}, ${latitude}],
  zoom: 16,
  pitch: 58,
  bearing: -24,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
map.on('load', function () { requestAnimationFrame(function () { map.resize(); }); });
const marker = new maplibregl.Marker({ color: '#0B4DA3', draggable: !readOnly })
  .setLngLat([${longitude}, ${latitude}])
  .addTo(map);
function postPin(lat, lng) {
  var payload = JSON.stringify({ type: 'mapPin', lat: lat, lng: lng });
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
  if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
}
if (!readOnly) {
  map.on('click', function (e) {
    marker.setLngLat(e.lngLat);
    postPin(e.lngLat.lat, e.lngLat.lng);
  });
  marker.on('dragend', function () {
    var p = marker.getLngLat();
    postPin(p.lat, p.lng);
  });
}
window.movePin = function (lat, lng) {
  marker.setLngLat([lng, lat]);
  map.easeTo({ center: [lng, lat], duration: 400 });
};
window.addEventListener('message', function (event) {
  try {
    var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (data && data.type === 'movePin') window.movePin(data.lat, data.lng);
  } catch (e) {}
});
</script>
</body>
</html>`
}

export function parseMapPinMessage(raw: string): { lat: number; lng: number } | null {
    try {
        const data = JSON.parse(raw) as { type?: string; lat?: number; lng?: number }
        if (data.type === 'mapPin' && typeof data.lat === 'number' && typeof data.lng === 'number') {
            return { lat: data.lat, lng: data.lng }
        }
    } catch {
        /* ignore */
    }
    return null
}