import maplibregl from 'maplibre-gl'

const WORKER_URL =
    'https://unpkg.com/maplibre-gl@6.20.0/dist/maplibre-gl-csp-worker.js'

let ready = false

export function ensureMapLibreWorker(): void {
    if (ready || typeof window === 'undefined') return
    maplibregl.setWorkerUrl(WORKER_URL)
    ready = true
}