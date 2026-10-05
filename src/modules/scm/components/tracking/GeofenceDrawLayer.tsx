'use client'

import { useEffect, useRef } from 'react'
import {
    Circle,
    CircleMarker,
    Marker,
    useMap,
    useMapEvents,
} from 'react-leaflet'
import type { DragEndEvent, LeafletEvent } from 'leaflet'
import L from 'leaflet'

export type GeofenceDraft = {
    lat: number
    lng: number
    radiusM: number
    color?: string
}

type GeofenceDrawLayerProps = {
    enabled: boolean
    draft: GeofenceDraft | null
    onChange: (draft: GeofenceDraft) => void
}

const MIN_RADIUS_M = 50
const MAX_RADIUS_M = 50_000
const DEFAULT_RADIUS_M = 500
/** Hit-test band around the circumference (screen pixels). */
const EDGE_HIT_PX = 14

/** Circles below marker pane so fleet / hub pins stay visible. */
export function EnsureGeofencePane() {
    const map = useMap()
    // Sync create so sibling Circles can use the pane on first paint.
    if (!map.getPane('geofencePane')) {
        const pane = map.createPane('geofencePane')
        pane.style.zIndex = '350'
        // Clicks pass through to markers / map (resize uses map events).
        pane.style.pointerEvents = 'none'
    }
    return null
}

/** Fleet pins above hub markers and geofence circles. */
export function EnsureFleetMarkerPane() {
    const map = useMap()
    if (!map.getPane('fleetMarkerPane')) {
        const pane = map.createPane('fleetMarkerPane')
        pane.style.zIndex = '650'
    }
    return null
}

/**
 * Place a circular geofence without blocking map pan:
 * - Click map → set / move center
 * - Drag the circumference edge → set radius
 * - Drag empty map → pan
 */
export default function GeofenceDrawLayer({
    enabled,
    draft,
    onChange,
}: GeofenceDrawLayerProps) {
    const map = useMap()
    const onChangeRef = useRef(onChange)
    const draftRef = useRef(draft)
    const resizingRef = useRef(false)
    const suppressClickRef = useRef(false)
    onChangeRef.current = onChange
    draftRef.current = draft

    useEffect(() => {
        if (!enabled) {
            resizingRef.current = false
            map.dragging.enable()
            map.getContainer().style.cursor = ''
            return
        }
        map.getContainer().style.cursor = 'crosshair'
        map.dragging.enable()
        return () => {
            resizingRef.current = false
            map.dragging.enable()
            map.getContainer().style.cursor = ''
        }
    }, [enabled, map])

    useEffect(() => {
        if (!enabled || !draft) {
            map.getContainer().style.cursor = enabled ? 'crosshair' : ''
            return
        }

        const onMove = (e: MouseEvent) => {
            if (resizingRef.current) {
                map.getContainer().style.cursor = 'ew-resize'
                return
            }
            const latlng = map.mouseEventToLatLng(e)
            map.getContainer().style.cursor = isNearEdge(
                map,
                draftRef.current,
                latlng,
            )
                ? 'ew-resize'
                : 'crosshair'
        }

        const el = map.getContainer()
        el.addEventListener('mousemove', onMove)
        return () => el.removeEventListener('mousemove', onMove)
    }, [enabled, draft, map])

    useMapEvents({
        mousedown(e) {
            if (!enabled || e.originalEvent.button !== 0) return
            const current = draftRef.current
            if (!current) return
            if (!isNearEdge(map, current, e.latlng)) return

            L.DomEvent.preventDefault(e.originalEvent)
            L.DomEvent.stopPropagation(e.originalEvent)
            resizingRef.current = true
            suppressClickRef.current = true
            map.dragging.disable()
            map.getContainer().style.cursor = 'ew-resize'
            applyRadiusFromLatLng(map, current, e.latlng, onChangeRef)
        },
        mousemove(e) {
            if (!enabled || !resizingRef.current) return
            const current = draftRef.current
            if (!current) return
            applyRadiusFromLatLng(map, current, e.latlng, onChangeRef)
        },
        mouseup() {
            endResize(map, resizingRef)
        },
        mouseout() {
            endResize(map, resizingRef)
        },
        click(e) {
            if (!enabled) return
            if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
            }
            if (resizingRef.current) return
            if (isNearEdge(map, draftRef.current, e.latlng)) return

            const prev = draftRef.current
            onChangeRef.current({
                lat: roundCoord(e.latlng.lat),
                lng: roundCoord(e.latlng.lng),
                radiusM: prev?.radiusM ?? DEFAULT_RADIUS_M,
                color: prev?.color,
            })
        },
    })

    if (!draft) return null

    const color = draft.color || '#38bdf8'

    return (
        <>
            <Circle
                center={[draft.lat, draft.lng]}
                radius={draft.radiusM}
                pane="geofencePane"
                interactive={false}
                pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.2,
                    weight: 3,
                }}
            />
            {/* Same SVG pane as Circle — stays geometrically centered */}
            <CircleMarker
                center={[draft.lat, draft.lng]}
                radius={5}
                pane="geofencePane"
                interactive={false}
                pathOptions={{
                    color,
                    fillColor: '#ffffff',
                    fillOpacity: 1,
                    weight: 2,
                    opacity: 1,
                }}
            />
            {/* Hit target for dragging the center — below fleet pins */}
            <Marker
                position={[draft.lat, draft.lng]}
                draggable={enabled}
                icon={DRAG_HANDLE_ICON}
                zIndexOffset={450}
                eventHandlers={{
                    click: (e: LeafletEvent) => {
                        ;(
                            e as { originalEvent?: Event }
                        ).originalEvent?.stopPropagation?.()
                    },
                    drag: (e: LeafletEvent) => {
                        const marker = e.target as {
                            getLatLng: () => { lat: number; lng: number }
                        }
                        const ll = marker.getLatLng()
                        const prev = draftRef.current
                        if (!prev) return
                        onChangeRef.current({
                            ...prev,
                            lat: roundCoord(ll.lat),
                            lng: roundCoord(ll.lng),
                        })
                    },
                    dragend: (e: DragEndEvent) => {
                        const ll = e.target.getLatLng()
                        const prev = draftRef.current
                        if (!prev) return
                        onChangeRef.current({
                            ...prev,
                            lat: roundCoord(ll.lat),
                            lng: roundCoord(ll.lng),
                        })
                    },
                }}
            />
        </>
    )
}

/** Invisible hit target (keep slight opacity so drag still works). */
function createDragHandleIcon(): L.DivIcon {
    const size = 28
    return L.divIcon({
        className: 'scm-geofence-ref-point',
        html: `<div style="width:${size}px;height:${size}px;margin:0;padding:0;cursor:grab;opacity:0.01;background:#000;"></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    })
}

/** Created once — avoids conditional hooks when draft is null. */
const DRAG_HANDLE_ICON = createDragHandleIcon()

function endResize(
    map: L.Map,
    resizingRef: { current: boolean },
) {
    if (!resizingRef.current) return
    resizingRef.current = false
    map.dragging.enable()
    map.getContainer().style.cursor = 'crosshair'
}

function applyRadiusFromLatLng(
    map: L.Map,
    draft: GeofenceDraft,
    latlng: L.LatLng,
    onChangeRef: { current: (draft: GeofenceDraft) => void },
) {
    const meters = map.distance([draft.lat, draft.lng], latlng)
    onChangeRef.current({
        ...draft,
        radiusM: clampRadius(meters),
    })
}

function isNearEdge(
    map: L.Map,
    draft: GeofenceDraft | null,
    latlng: L.LatLng,
): boolean {
    if (!draft) return false
    const center = L.latLng(draft.lat, draft.lng)
    const centerPx = map.latLngToLayerPoint(center)
    const clickPx = map.latLngToLayerPoint(latlng)
    const clickDistPx = centerPx.distanceTo(clickPx)

    const rim = offsetEast(draft.lat, draft.lng, draft.radiusM)
    const rimPx = map.latLngToLayerPoint(L.latLng(rim[0], rim[1]))
    const radiusPx = centerPx.distanceTo(rimPx)

    return Math.abs(clickDistPx - radiusPx) <= EDGE_HIT_PX
}

function offsetEast(
    lat: number,
    lng: number,
    meters: number,
): [number, number] {
    const cos = Math.cos((lat * Math.PI) / 180)
    const dLng = meters / (111_320 * Math.max(cos, 0.2))
    return [lat, lng + dLng]
}

function clampRadius(meters: number) {
    if (!Number.isFinite(meters)) return MIN_RADIUS_M
    return Math.round(
        Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, meters)),
    )
}

function roundCoord(n: number) {
    return Math.round(n * 1e6) / 1e6
}
