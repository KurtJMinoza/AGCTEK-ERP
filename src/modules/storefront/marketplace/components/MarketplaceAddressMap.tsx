'use client'

import { useEffect } from 'react'
import L from 'leaflet'
import {
    MapContainer,
    Marker,
    TileLayer,
    useMap,
    useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { createMapPinIcon } from '@/modules/scm/utils/mapPins'

type MarketplaceAddressMapProps = {
    latitude: number
    longitude: number
    onPinChange: (latitude: number, longitude: number) => void
    readOnly?: boolean
}

const markerIcon = createMapPinIcon({ color: '#059669' })

function MapClick({
    onPinChange,
}: Pick<MarketplaceAddressMapProps, 'onPinChange'>) {
    useMapEvents({
        click(event) {
            onPinChange(event.latlng.lat, event.latlng.lng)
        },
    })
    return null
}

function Recenter({
    latitude,
    longitude,
}: Pick<MarketplaceAddressMapProps, 'latitude' | 'longitude'>) {
    const map = useMap()
    useEffect(() => {
        map.setView([latitude, longitude], map.getZoom(), { animate: true })
    }, [latitude, longitude, map])
    return null
}

function FitOnOpen() {
    const map = useMap()
    useEffect(() => {
        const id = window.setTimeout(() => map.invalidateSize(), 80)
        return () => window.clearTimeout(id)
    }, [map])
    return null
}

/** OSM map: click or complete a marker drag to choose the saved coordinate. */
const MarketplaceAddressMap = ({
    latitude,
    longitude,
    onPinChange,
    readOnly = false,
}: MarketplaceAddressMapProps) => (
    <div className="relative z-0 h-72 overflow-hidden rounded-xl border border-gray-200 sm:h-80">
        <MapContainer
            center={[latitude, longitude]}
            zoom={15}
            scrollWheelZoom
            className="h-full w-full"
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {!readOnly ? <MapClick onPinChange={onPinChange} /> : null}
            <Recenter latitude={latitude} longitude={longitude} />
            <FitOnOpen />
            <Marker
                position={[latitude, longitude]}
                icon={markerIcon}
                draggable={!readOnly}
                eventHandlers={{
                    dragend: (event) => {
                        const marker = event.target as L.Marker
                        const point = marker.getLatLng()
                        onPinChange(point.lat, point.lng)
                    },
                }}
            />
        </MapContainer>
    </div>
)

export default MarketplaceAddressMap
