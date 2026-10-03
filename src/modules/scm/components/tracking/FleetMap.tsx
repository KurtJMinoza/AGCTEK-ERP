'use client'

import { useEffect, useMemo, useRef } from 'react'
import {
    Circle,
    MapContainer,
    Marker,
    Polyline,
    Popup,
    TileLayer,
    useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import dayjs from 'dayjs'
import type { FleetActiveTripStop, FleetTrackingItem, GpsLog } from '../../types'
import type { GeofenceZone } from '../../utils/geofences'
import { formatStatusLabel } from '../../utils/status'
import {
    MAP_PIN,
    getCachedMapOriginIcon,
    getCachedMapPinIcon,
    resolveStopPinColor,
} from '../../utils/mapPins'
import {
    fleetMarkerKind,
    markerKindColor,
} from '../../utils/trackingMetrics'
import SmoothMarker from './SmoothMarker'
import GeofenceDrawLayer, {
    EnsureFleetMarkerPane,
    EnsureGeofencePane,
    type GeofenceDraft,
} from './GeofenceDrawLayer'

export type { GeofenceDraft }

export type FleetMapProps = {
    items: FleetTrackingItem[]
    selectedVehicleId: string | null
    onSelect: (vehicleId: string) => void
    history?: GpsLog[]
    geofences?: GeofenceZone[]
    /** Increment to re-center on the selected unit */
    centerRequest?: number
    /** Geofence id to fly to (hub list click) */
    focusGeofenceId?: string | null
    /** When true, click-drag on the map places/resizes a draft geofence */
    drawGeofenceEnabled?: boolean
    draftGeofence?: GeofenceDraft | null
    onDraftGeofenceChange?: (draft: GeofenceDraft) => void
}

const DEFAULT_CENTER: [number, number] = [14.5995, 120.9842]
const DEFAULT_ZOOM = 12

type StopMarker = {
    key: string
    lat: number
    lng: number
    kind: 'destination' | 'stop'
    color: string
    title: string
    address: string
    sequence: number
    status: string
}

/**
 * Multi-unit GPS fleet map (telematics → dispatcher visibility).
 * Selection highlights + centers; other GPS units stay visible.
 */
export default function FleetMap({
    items,
    selectedVehicleId,
    onSelect,
    history = [],
    geofences = [],
    centerRequest = 0,
    focusGeofenceId = null,
    drawGeofenceEnabled = false,
    draftGeofence = null,
    onDraftGeofenceChange,
}: FleetMapProps) {
    const positioned = useMemo(
        () => items.filter((item) => item.latest != null),
        [items],
    )

    /** Nudge coincident GPS points so stacked units don't fully hide each other. */
    const markerPositions = useMemo(() => {
        const counts = new Map<string, number>()
        const result = new Map<string, [number, number]>()
        for (const item of positioned) {
            const latest = item.latest!
            const key = `${latest.latitude.toFixed(5)},${latest.longitude.toFixed(5)}`
            const n = counts.get(key) ?? 0
            counts.set(key, n + 1)
            // ~8 m east per duplicate at equator-ish; fine for PH latitudes
            const lngNudge = n * 0.00008
            result.set(item.vehicle.id, [
                latest.latitude,
                latest.longitude + lngNudge,
            ])
        }
        return result
    }, [positioned])

    const selectedItem = useMemo(
        () =>
            items.find((item) => item.vehicle.id === selectedVehicleId) ?? null,
        [items, selectedVehicleId],
    )

    const stopMarkers = useMemo(
        () => buildStopMarkers(selectedItem?.activeTrip?.stops),
        [selectedItem],
    )

    const trailLatLngs = useMemo((): [number, number][] => {
        if (!selectedVehicleId || history.length === 0) return []
        return [...history]
            .sort(
                (a, b) =>
                    new Date(a.recordedAt).getTime() -
                    new Date(b.recordedAt).getTime(),
            )
            .map((p) => [p.latitude, p.longitude])
    }, [history, selectedVehicleId])

    if (
        positioned.length === 0 &&
        stopMarkers.length === 0 &&
        geofences.length === 0 &&
        !drawGeofenceEnabled &&
        !draftGeofence
    ) {
        return (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center dark:border-gray-600 dark:bg-gray-800/40">
                <p className="text-base font-semibold text-gray-800 dark:text-gray-100">
                    No live GPS positions yet
                </p>
                <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                    Vehicles with a telematics device will appear here once
                    GpsLog pings arrive. Geofence hubs still show when
                    configured.
                </p>
            </div>
        )
    }

    return (
        <div className="scm-fleet-map relative z-0 h-full min-h-[420px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 isolate">
            <style>{`
              /* Reset Leaflet DivIcon chrome only — never zero out margin
                 (Leaflet uses margin for iconAnchor / tip placement). */
              .scm-map-pin.leaflet-marker-icon,
              .scm-map-origin.leaflet-marker-icon,
              .scm-geofence-ref-point.leaflet-marker-icon {
                background: transparent !important;
                border: none !important;
              }
            `}</style>
            {drawGeofenceEnabled ? (
                <div className="pointer-events-none absolute left-1/2 top-3 z-[500] max-w-[90%] -translate-x-1/2 rounded-lg border border-sky-200 bg-sky-50/95 px-3 py-1.5 text-center text-xs text-sky-900 shadow-sm dark:border-sky-800 dark:bg-sky-950/90 dark:text-sky-100">
                    Click the map to set the center, then drag the circle edge
                    to set the radius. Drag elsewhere to pan.
                </div>
            ) : null}
            <MapContainer
                key="osm-basemap"
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                className="relative z-0 h-full min-h-[420px] w-full bg-gray-100 dark:bg-gray-900"
                scrollWheelZoom
            >
                {/* Standard OSM raster tiles — no API key. Do not use CARTO basemaps (they watermark “API KEY REQUIRED”). */}
                <TileLayer
                    key="osm"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                />

                <EnsureGeofencePane />
                <EnsureFleetMarkerPane />

                <FitFleetBounds
                    vehiclePoints={positioned}
                    stopPoints={stopMarkers}
                    geofences={geofences}
                    selectedVehicleId={selectedVehicleId}
                    centerRequest={centerRequest}
                    focusGeofenceId={focusGeofenceId}
                />

                {drawGeofenceEnabled && onDraftGeofenceChange ? (
                    <GeofenceDrawLayer
                        enabled={drawGeofenceEnabled}
                        draft={draftGeofence}
                        onChange={onDraftGeofenceChange}
                    />
                ) : null}

                {geofences.map((zone) => (
                    <Circle
                        key={zone.id}
                        center={[zone.lat, zone.lng]}
                        radius={zone.radiusM}
                        pane="geofencePane"
                        interactive={!drawGeofenceEnabled}
                        pathOptions={{
                            color: zone.color ?? '#38bdf8',
                            fillColor: zone.color ?? '#38bdf8',
                            fillOpacity: 0.12,
                            weight: 2,
                            dashArray: zone.kind === 'HUB' ? undefined : '6 6',
                        }}
                    >
                        {!drawGeofenceEnabled ? (
                            <Popup>
                                <div className="text-sm">
                                    <p className="font-semibold">{zone.name}</p>
                                    <p className="text-gray-600">
                                        {zone.kind} · {zone.radiusM} m
                                    </p>
                                </div>
                            </Popup>
                        ) : null}
                    </Circle>
                ))}

                {trailLatLngs.length > 1 ? (
                    <Polyline
                        positions={trailLatLngs}
                        pathOptions={{
                            color: '#60a5fa',
                            weight: 3,
                            opacity: 0.85,
                        }}
                    />
                ) : null}

                {positioned.map((item) => {
                    const latest = item.latest!
                    const selected = item.vehicle.id === selectedVehicleId
                    const kind = fleetMarkerKind(item)
                    const color = selected
                        ? MAP_PIN.vehicle
                        : markerKindColor(kind)
                    const position =
                        markerPositions.get(item.vehicle.id) ?? [
                            latest.latitude,
                            latest.longitude,
                        ]
                    return (
                        <SmoothMarker
                            key={item.vehicle.id}
                            position={position}
                            durationMs={selected ? 500 : 400}
                            pane="fleetMarkerPane"
                            icon={getCachedMapOriginIcon({
                                color,
                                label: selected
                                    ? 'V'
                                    : item.vehicle.plateNumber.slice(0, 3),
                                selected,
                            })}
                            zIndexOffset={selected ? 1000 : 800}
                            eventHandlers={{
                                click: () => onSelect(item.vehicle.id),
                            }}
                        >
                            <Popup>
                                <div className="min-w-[140px] text-sm">
                                    <p className="font-semibold">
                                        {item.vehicle.plateNumber}
                                    </p>
                                    <p className="text-gray-600">
                                        {formatStatusLabel(item.vehicle.status)}{' '}
                                        · {kind.replace('_', ' ')}
                                    </p>
                                    <p className="mt-1">
                                        {latest.speedKmh.toFixed(0)} km/h
                                        {latest.heading != null
                                            ? ` · ${latest.heading.toFixed(0)}°`
                                            : ''}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {dayjs(latest.recordedAt).format(
                                            'YYYY-MM-DD HH:mm:ss',
                                        )}
                                    </p>
                                </div>
                            </Popup>
                        </SmoothMarker>
                    )
                })}

                {stopMarkers.map((stop) => (
                    <Marker
                        key={stop.key}
                        position={[stop.lat, stop.lng]}
                        icon={getCachedMapPinIcon({
                            color: stop.color,
                            label:
                                stop.kind === 'destination'
                                    ? 'D'
                                    : String(stop.sequence),
                        })}
                        zIndexOffset={stop.kind === 'destination' ? 700 : 600}
                    >
                        <Popup>
                            <div className="min-w-[140px] text-sm">
                                <p className="font-semibold">
                                    {stop.kind === 'destination'
                                        ? 'Destination'
                                        : `Stop ${stop.sequence}`}
                                    {stop.title ? ` · ${stop.title}` : ''}
                                </p>
                                <p className="text-gray-600">{stop.address}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                    {formatStatusLabel(stop.status)}
                                </p>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            <MapPinLegend />
        </div>
    )
}

function MapPinLegend() {
    return (
        <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-sm dark:border-gray-700 dark:bg-gray-900/95">
            <ul className="space-y-1.5">
                <LegendRow color="#22c55e" label="En route" />
                <LegendRow color="#38bdf8" label="Active / moving" />
                <LegendRow color="#f59e0b" label="Idle" />
                <LegendRow color={MAP_PIN.vehicle} label="Selected unit" />
                <LegendRow color={MAP_PIN.destination} label="Destination" />
                <LegendRow color="#38bdf8" label="Geofence / hub" />
            </ul>
        </div>
    )
}

function LegendRow({ color, label }: { color: string; label: string }) {
    return (
        <li className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
            <span
                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white"
                style={{ backgroundColor: color }}
            />
            {label}
        </li>
    )
}

function buildStopMarkers(
    stops: FleetActiveTripStop[] | undefined,
): StopMarker[] {
    if (!stops?.length) return []

    const withCoords = stops.filter(
        (stop) => stop.lat != null && stop.lng != null,
    )
    if (withCoords.length === 0) return []

    const lastSequence = Math.max(...withCoords.map((s) => s.sequence))

    return withCoords.map((stop) => {
        const isDestination = stop.sequence === lastSequence
        const color = isDestination
            ? MAP_PIN.destination
            : resolveStopPinColor(stop.sequence, stop.pinColor)

        return {
            key: stop.id,
            lat: stop.lat!,
            lng: stop.lng!,
            kind: isDestination ? 'destination' : 'stop',
            color,
            title: stop.name ?? '',
            address: stop.address,
            sequence: stop.sequence,
            status: stop.status,
        }
    })
}

function FitFleetBounds({
    vehiclePoints,
    stopPoints,
    geofences,
    selectedVehicleId,
    centerRequest,
    focusGeofenceId,
}: {
    vehiclePoints: FleetTrackingItem[]
    stopPoints: StopMarker[]
    geofences: GeofenceZone[]
    selectedVehicleId: string | null
    centerRequest: number
    focusGeofenceId: string | null
}) {
    const map = useMap()
    const prevSelectedRef = useRef<string | null | undefined>(undefined)
    const didInitialFitRef = useRef(false)
    const lastCenterReqRef = useRef(0)
    const lastFocusGeofenceRef = useRef<string | null>(null)

    const fleetLatLngs = useMemo((): [number, number][] => {
        return vehiclePoints
            .filter((item) => item.latest)
            .map((item) => [
                item.latest!.latitude,
                item.latest!.longitude,
            ])
    }, [vehiclePoints])

    useEffect(() => {
        if (!focusGeofenceId || focusGeofenceId === lastFocusGeofenceRef.current) {
            return
        }
        lastFocusGeofenceRef.current = focusGeofenceId
        const geofenceId = focusGeofenceId.split(':')[0]
        const zone = geofences.find((g) => g.id === geofenceId)
        if (!zone) return

        const focus: L.LatLngExpression[] = [[zone.lat, zone.lng]]
        // Keep nearby fleet pins in frame (≈400 m) so a hub doesn't "eat" the view.
        for (const item of vehiclePoints) {
            if (!item.latest) continue
            const d = map.distance(
                [zone.lat, zone.lng],
                [item.latest.latitude, item.latest.longitude],
            )
            if (d <= Math.max(400, zone.radiusM * 3)) {
                focus.push([item.latest.latitude, item.latest.longitude])
            }
        }

        if (focus.length === 1) {
            map.flyTo(focus[0], 16, { duration: 0.55 })
        } else {
            map.flyToBounds(L.latLngBounds(focus).pad(0.35), {
                duration: 0.55,
                maxZoom: 16,
            })
        }
    }, [focusGeofenceId, geofences, vehiclePoints, map])

    useEffect(() => {
        const prev = prevSelectedRef.current
        const selectionChanged = prev !== selectedVehicleId
        prevSelectedRef.current = selectedVehicleId

        const centerRequested = centerRequest !== lastCenterReqRef.current
        if (centerRequested) lastCenterReqRef.current = centerRequest

        // No selection: fit once on first GPS / when user clears selection.
        // Do NOT re-fit on every live ping (that causes map thrashing).
        if (selectedVehicleId == null) {
            if (fleetLatLngs.length === 0) return
            if (didInitialFitRef.current && !selectionChanged) return
            didInitialFitRef.current = true

            if (fleetLatLngs.length === 1) {
                map.setView(fleetLatLngs[0], 14, { animate: true })
            } else {
                map.fitBounds(L.latLngBounds(fleetLatLngs).pad(0.2), {
                    animate: true,
                })
            }
            return
        }

        if (selectionChanged || centerRequested) {
            const selected = vehiclePoints.find(
                (item) =>
                    item.vehicle.id === selectedVehicleId && item.latest,
            )
            const focus: L.LatLngExpression[] = []
            if (selected?.latest) {
                focus.push([
                    selected.latest.latitude,
                    selected.latest.longitude,
                ])
            }
            stopPoints.forEach((s) => focus.push([s.lat, s.lng]))

            if (focus.length === 1) {
                map.flyTo(focus[0], Math.max(map.getZoom(), 14), {
                    duration: 0.65,
                    easeLinearity: 0.25,
                })
            } else if (focus.length > 1) {
                map.flyToBounds(L.latLngBounds(focus).pad(0.25), {
                    duration: 0.65,
                    easeLinearity: 0.25,
                })
            }
        }
    }, [
        selectedVehicleId,
        centerRequest,
        fleetLatLngs,
        vehiclePoints,
        stopPoints,
        map,
    ])

    return null
}
