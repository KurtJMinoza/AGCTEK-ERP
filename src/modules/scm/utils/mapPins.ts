import L from 'leaflet'

/** Fixed map pin colors for Tracking (dispatcher map). */
export const MAP_PIN = {
    vehicle: '#2563eb', // blue — vehicle being tracked
    destination: '#dc2626', // red — final destination
} as const

/** Default palette for intermediate stops when pinColor is not set. */
export const STOP_PIN_PALETTE = [
    '#f59e0b', // amber
    '#10b981', // emerald
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#ec4899', // pink
    '#84cc16', // lime
] as const

export type MapPinKind = 'vehicle' | 'destination' | 'stop'

const PIN_WIDTH = 28
const PIN_HEIGHT = 40

export function resolveStopPinColor(
    sequence: number,
    pinColor?: string | null,
): string {
    if (pinColor && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(pinColor)) {
        return pinColor
    }
    const index = Math.max(0, sequence - 1) % STOP_PIN_PALETTE.length
    return STOP_PIN_PALETTE[index]
}

/**
 * Classic teardrop map pin (Leaflet DivIcon).
 * Tip is anchored via iconAnchor only — do not CSS-translate the pin
 * or it will drift when zooming.
 */
export function createMapPinIcon(options: {
    color: string
    label?: string
    selected?: boolean
}): L.DivIcon {
    const { color, label, selected } = options
    const ring = selected
        ? `0 0 0 3px ${color}55, 0 2px 8px rgba(0,0,0,0.35)`
        : '0 2px 6px rgba(0,0,0,0.35)'
    const labelHtml = label
        ? `<span style="
            position:absolute;left:50%;top:7px;transform:translateX(-50%);
            color:#fff;font:700 10px/1 system-ui,sans-serif;
            text-shadow:0 1px 1px rgba(0,0,0,0.35);
            pointer-events:none;
          ">${escapeHtml(label)}</span>`
        : ''

    return L.divIcon({
        // Avoid Leaflet's default .leaflet-div-icon border/background,
        // which shifts the visual tip away from iconAnchor.
        className: 'scm-map-pin',
        html: `<div class="scm-map-pin-inner" style="
            position:relative;
            width:${PIN_WIDTH}px;
            height:${PIN_HEIGHT}px;
            margin:0;
            padding:0;
            line-height:0;
            box-sizing:border-box;
          ">
          <svg width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg" style="display:block;overflow:visible;filter:drop-shadow(${ring});">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.268 21.732 0 14 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
            <circle cx="14" cy="14" r="5" fill="#ffffff" fill-opacity="0.95"/>
          </svg>
          ${labelHtml}
        </div>`,
        iconSize: [PIN_WIDTH, PIN_HEIGHT],
        // Bottom-center tip of the teardrop = geographic lat/lng
        iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
        popupAnchor: [0, -PIN_HEIGHT + 4],
    })
}

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
}
