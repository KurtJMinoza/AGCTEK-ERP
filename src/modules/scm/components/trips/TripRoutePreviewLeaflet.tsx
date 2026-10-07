'use client'

import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getCachedMapPinIcon, resolveStopPinColor } from '../../utils/mapPins'
import type { RoutePreview, RoutePreviewStop } from '../../types'

const PICKUP_COLOR = '#1e3a8a'
const RETURN_COLOR = '#4b5563'
const LATE_COLOR = '#dc2626'
const ROUTE_COLOR = '#2563eb'

function iconFor(stop: RoutePreviewStop, deliveryNo: number) {
    if (stop.type === 'PICKUP') return getCachedMapPinIcon({ color: PICKUP_COLOR, label: 'P' })
    if (stop.type === 'RETURN_TO') return getCachedMapPinIcon({ color: RETURN_COLOR, label: 'R' })
    return getCachedMapPinIcon({
        color: stop.windowStatus === 'LATE' ? LATE_COLOR : resolveStopPinColor(deliveryNo),
        label: String(deliveryNo),
    })
}

function FitBounds({ points }: { points: Array<[number, number]> }) {
    const map = useMap()
    const key = JSON.stringify(points)
    useEffect(() => {
        if (points.length === 0) return
        const id = window.setTimeout(() => {
            map.invalidateSize()
            map.fitBounds(L.latLngBounds(points), { padding: [32, 32], maxZoom: 15 })
        }, 60)
        return () => window.clearTimeout(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, map])
    return null
}

/** Planning-only map: markers + route line from the preview response. No live layers. */
export default function TripRoutePreviewLeaflet({ preview }: { preview: RoutePreview }) {
    const located = useMemo(
        () => preview.stops.filter((s) => s.lat != null && s.lng != null),
        [preview.stops],
    )
    const deliveryNumbers = useMemo(() => {
        const numbers = new Map<string, number>()
        let n = 0
        for (const stop of preview.stops) {
            if (stop.type === 'SHIP_TO') numbers.set(stop.key, ++n)
        }
        return numbers
    }, [preview.stops])

    const boundsPoints = useMemo<Array<[number, number]>>(
        () => [
            ...preview.polyline,
            ...located.map((s) => [s.lat as number, s.lng as number] as [number, number]),
        ],
        [preview.polyline, located],
    )
    const center: [number, number] = boundsPoints[0] ?? [14.5995, 120.9842]

    return (
        <div className="relative z-0 h-[420px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full" style={{ height: '100%', width: '100%' }}>
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <FitBounds points={boundsPoints} />
                {preview.polyline.length > 1 ? (
                    <Polyline
                        positions={preview.polyline}
                        pathOptions={{
                            color: ROUTE_COLOR,
                            weight: 4,
                            opacity: 0.85,
                            dashArray: preview.router === 'haversine' ? '8 8' : undefined,
                        }}
                    />
                ) : null}
                {located.map((stop) => (
                    <Marker
                        key={stop.key}
                        position={[stop.lat as number, stop.lng as number]}
                        icon={iconFor(stop, deliveryNumbers.get(stop.key) ?? stop.sequence)}
                    >
                        <Tooltip direction="top" offset={[0, -36]}>
                            <div className="text-xs">
                                <div className="font-semibold">
                                    {stop.sequence}. {stop.label}
                                </div>
                                <div>{stop.address}</div>
                                {stop.etaAt ? (
                                    <div>ETA {new Date(stop.etaAt).toLocaleString()}</div>
                                ) : null}
                            </div>
                        </Tooltip>
                    </Marker>
                ))}
            </MapContainer>
        </div>
    )
}
