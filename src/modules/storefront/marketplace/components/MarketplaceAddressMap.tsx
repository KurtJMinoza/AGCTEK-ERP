'use client'

import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { ensureMapLibreWorker } from '../utils/maplibreWorker'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

type MarketplaceAddressMapProps = {
    latitude: number
    longitude: number
    onPinChange: (latitude: number, longitude: number) => void
    readOnly?: boolean
}

/** 3D MapLibre map — click or drag the pin (same geocode flow as account address dialog). */
const MarketplaceAddressMap = ({
    latitude,
    longitude,
    onPinChange,
    readOnly = false,
}: MarketplaceAddressMapProps) => {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const mapRef = useRef<maplibregl.Map | null>(null)
    const markerRef = useRef<maplibregl.Marker | null>(null)
    const onPinChangeRef = useRef(onPinChange)
    onPinChangeRef.current = onPinChange

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return
        ensureMapLibreWorker()

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: MAP_STYLE_URL,
            center: [longitude, latitude],
            zoom: 16,
            pitch: 58,
            bearing: -24,
        })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

        const marker = new maplibregl.Marker({ color: '#0B4DA3', draggable: !readOnly })
            .setLngLat([longitude, latitude])
            .addTo(map)
        markerRef.current = marker

        if (!readOnly) {
            map.on('click', (event) => {
                const { lat, lng } = event.lngLat
                marker.setLngLat([lng, lat])
                onPinChangeRef.current(lat, lng)
            })
            marker.on('dragend', () => {
                const point = marker.getLngLat()
                onPinChangeRef.current(point.lat, point.lng)
            })
        }

        const resizeId = window.setTimeout(() => map.resize(), 80)

        return () => {
            window.clearTimeout(resizeId)
            marker.remove()
            map.remove()
            mapRef.current = null
            markerRef.current = null
        }
    }, [readOnly])

    useEffect(() => {
        const map = mapRef.current
        const marker = markerRef.current
        if (!map || !marker) return
        marker.setLngLat([longitude, latitude])
        map.easeTo({ center: [longitude, latitude], duration: 350 })
    }, [latitude, longitude])

    return (
        <div className="relative z-0 h-72 overflow-hidden rounded-xl border border-gray-200 sm:h-80">
            <div ref={containerRef} className="h-full w-full" />
        </div>
    )
}

export default MarketplaceAddressMap