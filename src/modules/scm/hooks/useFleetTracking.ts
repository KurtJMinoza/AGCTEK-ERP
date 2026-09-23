'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiGetFleetTracking } from '../services/scmApi'
import { useScmTrackingSocket } from './useScmTrackingSocket'
import type { VehiclePositionEvent } from '../services/scmTrackingSocket'
import type { FleetTrackingItem, GpsLog, VehicleStatus } from '../types'

type FleetFilters = {
    status?: VehicleStatus | ''
    search?: string
}

/** Quiet HTTP reconcile while Socket.IO is live. */
const POLL_MS_LIVE = 60_000
/** Fallback poll when socket is down. */
const POLL_MS_OFFLINE = 15_000
const TRAIL_CAP = 100

/**
 * Fleet positions for Live Tracking via Socket.IO (`vehicle.position`)
 * with HTTP poll as backup. Selection never filters map markers.
 */
export function useFleetTracking(initial?: FleetFilters) {
    const [filters, setFilters] = useState<FleetFilters>({
        status: '',
        search: '',
        ...initial,
    })
    const [items, setItems] = useState<FleetTrackingItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    /** null = no selection; map still shows every vehicle with a GpsLog */
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
        null,
    )
    /** Live trail points prepended from socket for the selected unit. */
    const [liveTrailByVehicle, setLiveTrailByVehicle] = useState<
        Record<string, GpsLog[]>
    >({})

    const pendingPositionsRef = useRef<Map<string, VehiclePositionEvent>>(
        new Map(),
    )
    const flushRafRef = useRef<number>(0)

    const reload = useCallback(async (opts?: { quiet?: boolean }) => {
        if (!opts?.quiet) setLoading(true)
        setError(null)
        try {
            const result = await apiGetFleetTracking({
                status: filters.status || undefined,
                search: filters.search || undefined,
            })
            setItems(result.data)

            setSelectedVehicleId((current) => {
                if (
                    current &&
                    result.data.some((item) => item.vehicle.id === current)
                ) {
                    return current
                }
                return null
            })
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load fleet tracking',
            )
            if (!opts?.quiet) setItems([])
        } finally {
            if (!opts?.quiet) setLoading(false)
        }
    }, [filters])

    const flushPendingPositions = useCallback(() => {
        flushRafRef.current = 0
        const pending = pendingPositionsRef.current
        if (pending.size === 0) return
        const batch = Array.from(pending.values())
        pending.clear()

        setItems((current) => {
            let next = current
            let unknown = false
            for (const event of batch) {
                const index = next.findIndex(
                    (item) => item.vehicle.id === event.vehicleId,
                )
                if (index < 0) {
                    unknown = true
                    continue
                }
                if (next === current) next = [...current]
                const prev = next[index]
                const latest: GpsLog = {
                    id: event.gpsLogId,
                    vehicleId: event.vehicleId,
                    tripId: null,
                    latitude: event.latitude,
                    longitude: event.longitude,
                    speedKmh: event.speedKmh,
                    heading: event.heading,
                    rawPayload: null,
                    recordedAt: event.recordedAt,
                }
                next[index] = {
                    ...prev,
                    latest,
                    vehicle: {
                        ...prev.vehicle,
                        ...(typeof event.odometerKm === 'number'
                            ? { odometerKm: event.odometerKm }
                            : {}),
                        ...(event.telematicsDeviceId != null
                            ? { telematicsDeviceId: event.telematicsDeviceId }
                            : {}),
                    },
                }
            }
            if (unknown) void reload({ quiet: true })
            return next
        })

        setLiveTrailByVehicle((current) => {
            let next = current
            for (const event of batch) {
                const latest: GpsLog = {
                    id: event.gpsLogId,
                    vehicleId: event.vehicleId,
                    tripId: null,
                    latitude: event.latitude,
                    longitude: event.longitude,
                    speedKmh: event.speedKmh,
                    heading: event.heading,
                    rawPayload: null,
                    recordedAt: event.recordedAt,
                }
                const prev = next[event.vehicleId] ?? []
                if (prev.some((p) => p.id === latest.id)) continue
                if (next === current) next = { ...current }
                next[event.vehicleId] = [latest, ...prev].slice(0, TRAIL_CAP)
            }
            return next
        })
    }, [reload])

    const onVehiclePosition = useCallback(
        (event: VehiclePositionEvent) => {
            pendingPositionsRef.current.set(event.vehicleId, event)
            if (flushRafRef.current) return
            flushRafRef.current = requestAnimationFrame(flushPendingPositions)
        },
        [flushPendingPositions],
    )

    useEffect(() => {
        return () => {
            if (flushRafRef.current) {
                cancelAnimationFrame(flushRafRef.current)
            }
        }
    }, [])

    const { status: liveStatus, transport: liveTransport } =
        useScmTrackingSocket({ onVehiclePosition })

    useEffect(() => {
        void reload()
    }, [reload])

    useEffect(() => {
        const ms =
            liveStatus === 'live' ? POLL_MS_LIVE : POLL_MS_OFFLINE
        const timer = window.setInterval(() => {
            void reload({ quiet: true })
        }, ms)
        return () => window.clearInterval(timer)
    }, [reload, liveStatus])

    const selected =
        items.find((item) => item.vehicle.id === selectedVehicleId) ?? null

    const selectVehicle = useCallback((vehicleId: string | null) => {
        setSelectedVehicleId(vehicleId)
    }, [])

    /** Toggle: clicking the already-selected vehicle clears selection */
    const toggleSelectVehicle = useCallback((vehicleId: string) => {
        setSelectedVehicleId((current) =>
            current === vehicleId ? null : vehicleId,
        )
    }, [])

    const liveTrail = selectedVehicleId
        ? (liveTrailByVehicle[selectedVehicleId] ?? [])
        : []

    return {
        items,
        selected,
        selectedVehicleId,
        setSelectedVehicleId: selectVehicle,
        toggleSelectVehicle,
        filters,
        setFilters,
        loading,
        error,
        reload,
        liveStatus,
        liveTransport,
        liveTrail,
    }
}
