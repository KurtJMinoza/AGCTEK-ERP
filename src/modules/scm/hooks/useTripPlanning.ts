'use client'

import { useCallback, useEffect, useState } from 'react'
import {
    apiCreateTmsTrip,
    apiGetDrivers,
    apiGetTmsTrips,
    apiGetTripCandidates,
    apiReorderTmsTripStops,
    apiTmsTripAction,
    apiUpdateTmsTrip,
} from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type { Driver, Trip, TripCandidate } from '../types'

const PLANNING_STATUSES = 'PLANNED,READY,DISPATCHED'

/** Trip Planning: READY cargo candidates → trips (stops derived server-side). */
export function useTripPlanning() {
    const [candidates, setCandidates] = useState<TripCandidate[]>([])
    const [trips, setTrips] = useState<Trip[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [candidateResult, tripResult, driverResult] = await Promise.all([
                apiGetTripCandidates(),
                apiGetTmsTrips({ page: 1, pageSize: 100, status: PLANNING_STATUSES }),
                apiGetDrivers({ page: 1, pageSize: 100 }),
            ])
            setCandidates(candidateResult.data)
            setTrips(tripResult.data)
            setDrivers(driverResult.data.filter((d) => d.status !== 'INACTIVE'))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load trip planning data'))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    const applyTrip = useCallback((trip: Trip) => {
        setTrips((current) => {
            const others = current.filter((t) => t.id !== trip.id)
            return PLANNING_STATUSES.split(',').includes(trip.status)
                ? [trip, ...others]
                : others
        })
    }, [])

    const run = useCallback(
        async (fn: () => Promise<Trip>, refreshCandidates = false): Promise<string | null> => {
            setBusy(true)
            try {
                const trip = await fn()
                applyTrip(trip)
                if (refreshCandidates) {
                    setCandidates((await apiGetTripCandidates()).data)
                }
                return null
            } catch (err) {
                return getApiErrorMessage(err, 'Request failed')
            } finally {
                setBusy(false)
            }
        },
        [applyTrip],
    )

    const selected = trips.find((t) => t.id === selectedId) ?? null

    return {
        candidates,
        trips,
        drivers,
        selected,
        setSelectedId,
        loading,
        busy,
        error,
        reload: load,
        createTrip: (body: Parameters<typeof apiCreateTmsTrip>[0]) =>
            run(async () => {
                const trip = await apiCreateTmsTrip(body)
                setSelectedId(trip.id)
                return trip
            }, true),
        updateTrip: (id: string, body: Parameters<typeof apiUpdateTmsTrip>[1]) =>
            run(() => apiUpdateTmsTrip(id, body)),
        reorder: (id: string, stopIds: string[]) =>
            run(() => apiReorderTmsTripStops(id, stopIds)),
        action: (id: string, name: 'validate' | 'dispatch' | 'cancel') =>
            run(() => apiTmsTripAction(id, name), name === 'cancel'),
    }
}
