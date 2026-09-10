'use client'

import { useEffect } from 'react'
import {
    MapContainer,
    Marker,
    TileLayer,
    useMap,
    useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createMapPinIcon } from '../../utils/mapPins'

type LocationPickerMapProps = {
    lat: number
    lng: number
    onPick: (lat: number, lng: number) => void
}

function ClickHandler({
    onPick,
}: {
    onPick: (lat: number, lng: number) => void
}) {
    useMapEvents({
        click(e) {
            onPick(e.latlng.lat, e.latlng.lng)
        },
    })
    return null
}

function Recenter({ lat, lng }: { lat: number; lng: number }) {
    const map = useMap()
    useEffect(() => {
        map.setView([lat, lng], map.getZoom(), { animate: true })
    }, [lat, lng, map])
    return null
}

function InvalidateSize() {
    const map = useMap()
    useEffect(() => {
        const id = window.setTimeout(() => map.invalidateSize(), 80)
        return () => window.clearTimeout(id)
    }, [map])
    return null
}

const pinIcon = createMapPinIcon({
    color: '#2563eb',
    label: '•',
})

export default function LocationPickerMap({
    lat,
    lng,
    onPick,
}: LocationPickerMapProps) {
    return (
        <div className="scm-location-picker relative z-0 h-[280px] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <MapContainer
                center={[lat, lng]}
                zoom={14}
                scrollWheelZoom
                className="h-full w-full"
                style={{ height: '100%', width: '100%' }}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onPick={onPick} />
                <Recenter lat={lat} lng={lng} />
                <InvalidateSize />
                <Marker
                    position={[lat, lng]}
                    icon={pinIcon}
                    draggable
                    eventHandlers={{
                        dragend: (e) => {
                            const marker = e.target as L.Marker
                            const pos = marker.getLatLng()
                            onPick(pos.lat, pos.lng)
                        },
                    }}
                />
            </MapContainer>
        </div>
    )
}
