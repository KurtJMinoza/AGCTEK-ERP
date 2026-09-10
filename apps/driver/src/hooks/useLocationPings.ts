import { useEffect, useRef } from 'react'
import * as Location from 'expo-location'
import { apiTrackingPing } from '../api/client'
import type { Trip } from '../types'

/**
 * While trip is IN_TRANSIT, watch GPS and POST to /scm/tracking/ping
 * so the dispatcher Live Tracking map updates. Skips if no vehicle.
 */
export function useLocationPings(trip: Trip | null) {
    const lastSent = useRef(0)

    useEffect(() => {
        if (!trip || trip.status !== 'IN_TRANSIT' || !trip.vehicleId) {
            return
        }

        let sub: Location.LocationSubscription | null = null
        let cancelled = false

        void (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync()
            if (status !== 'granted' || cancelled) return

            sub = await Location.watchPositionAsync(
                {
                    accuracy: Location.Accuracy.Balanced,
                    distanceInterval: 40,
                    timeInterval: 15000,
                },
                (pos) => {
                    const now = Date.now()
                    if (now - lastSent.current < 12000) return
                    lastSent.current = now
                    void apiTrackingPing({
                        vehicleId: trip.vehicleId!,
                        tripId: trip.id,
                        latitude: pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        speedKmh:
                            pos.coords.speed != null && pos.coords.speed >= 0
                                ? pos.coords.speed * 3.6
                                : undefined,
                    }).catch(() => {
                        /* online-first; ignore transient ping failures */
                    })
                },
            )
        })()

        return () => {
            cancelled = true
            sub?.remove()
        }
    }, [trip?.id, trip?.status, trip?.vehicleId])
}
