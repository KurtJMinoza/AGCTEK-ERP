'use client'

import { useEffect } from 'react'
import { Circle, MapContainer, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { GeofenceZone } from '../../utils/geofences'
import GeofenceDrawLayer, {
    EnsureGeofencePane,
    type GeofenceDraft,
} from './GeofenceDrawLayer'

type GeofenceDrawMapProps = {
    draft: GeofenceDraft | null
    onDraftChange: (draft: GeofenceDraft) => void
    existing?: GeofenceZone[]
    editingId?: string | null
}

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842]

/** Compact Leaflet map for click-drag geofence placement inside the editor dialog. */
export default function GeofenceDrawMap({
    draft,
    onDraftChange,
    existing = [],
    editingId = null,
}: GeofenceDrawMapProps) {
    return (
        <div className="scm-geofence-draw-map relative h-64 w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <style>{`
              /* Reset Leaflet DivIcon chrome only — never zero out margin. */
              .scm-geofence-draw-map .scm-map-pin.leaflet-marker-icon,
              .scm-geofence-draw-map .scm-geofence-ref-point.leaflet-marker-icon {
                background: transparent !important;
                border: none !important;
              }
            `}</style>
            <div className="pointer-events-none absolute left-2 right-2 top-2 z-[500] rounded bg-white/90 px-2 py-1 text-center text-[11px] text-gray-700 shadow-sm dark:bg-gray-900/90 dark:text-gray-200">
                Click to set center · drag the circle edge to set radius · drag
                the map to pan
            </div>
            <MapContainer
                center={draft ? [draft.lat, draft.lng] : DEFAULT_CENTER}
                zoom={draft ? radiusToZoom(draft.radiusM) : 12}
                className="h-full w-full"
                scrollWheelZoom
            >
                <InvalidateSizeOnMount />
                <EnsureGeofencePane />
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />
                {existing
                    .filter((z) => z.id !== editingId)
                    .map((zone) => (
                        <Circle
                            key={zone.id}
                            center={[zone.lat, zone.lng]}
                            radius={zone.radiusM}
                            pane="geofencePane"
                            interactive={false}
                            pathOptions={{
                                color: zone.color ?? '#94a3b8',
                                fillColor: zone.color ?? '#94a3b8',
                                fillOpacity: 0.08,
                                weight: 1,
                                dashArray: '4 4',
                            }}
                        />
                    ))}
                <GeofenceDrawLayer
                    enabled
                    draft={draft}
                    onChange={onDraftChange}
                />
            </MapContainer>
        </div>
    )
}

function InvalidateSizeOnMount() {
    const map = useMap()
    useEffect(() => {
        const t = window.setTimeout(() => {
            map.invalidateSize()
        }, 80)
        return () => window.clearTimeout(t)
    }, [map])
    return null
}

function radiusToZoom(radiusM: number) {
    if (radiusM > 20000) return 10
    if (radiusM > 8000) return 11
    if (radiusM > 3000) return 12
    if (radiusM > 1200) return 13
    if (radiusM > 500) return 14
    return 15
}
