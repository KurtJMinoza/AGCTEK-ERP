'use client'

import { useEffect } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { MAP_PIN, getCachedMapPinIcon } from '@/modules/scm/utils/mapPins'

type LatLng = { lat: number; lng: number }

type OrderTrackingMapProps = {
    courier: LatLng
    destination: LatLng | null
}

function FitBounds({ courier, destination }: OrderTrackingMapProps) {
    const map = useMap()
    const destLat = destination?.lat
    const destLng = destination?.lng
    useEffect(() => {
        const id = window.setTimeout(() => {
            map.invalidateSize()
            if (destLat != null && destLng != null) {
                map.fitBounds(
                    L.latLngBounds([courier.lat, courier.lng], [destLat, destLng]),
                    { padding: [36, 36], maxZoom: 16 },
                )
            } else {
                map.setView([courier.lat, courier.lng], 15)
            }
        }, 80)
        return () => window.clearTimeout(id)
    }, [map, courier.lat, courier.lng, destLat, destLng])
    return null
}

/** Read-only OSM map: delayed courier position + customer drop-off pin. */
const OrderTrackingMap = ({ courier, destination }: OrderTrackingMapProps) => (
    <div className="relative z-0 h-64 overflow-hidden rounded-xl border border-gray-200 sm:h-72">
        <MapContainer
            center={[courier.lat, courier.lng]}
            zoom={15}
            scrollWheelZoom={false}
            className="h-full w-full"
            style={{ height: '100%', width: '100%' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds courier={courier} destination={destination} />
            <Marker
                position={[courier.lat, courier.lng]}
                icon={getCachedMapPinIcon({ color: MAP_PIN.vehicle })}
                title="Courier (approximate)"
            />
            {destination && (
                <Marker
                    position={[destination.lat, destination.lng]}
                    icon={getCachedMapPinIcon({ color: MAP_PIN.destination })}
                    title="Delivery address"
                />
            )}
        </MapContainer>
    </div>
)

export default OrderTrackingMap
