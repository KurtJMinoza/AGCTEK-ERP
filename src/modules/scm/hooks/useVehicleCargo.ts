'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGetVehicleCargo } from '../services/scmApi'
import type { VehicleCargoResponse } from '../types'

/**
 * Operational cargo for a vehicle (trip-bound shipments).
 * Not MM inventory — load building visibility only.
 */
export function useVehicleCargo(vehicleId: string | undefined) {
    const [cargo, setCargo] = useState<VehicleCargoResponse | null>(null)
    const [loading, setLoading] = useState(Boolean(vehicleId))
    const [error, setError] = useState<string | null>(null)

    const reload = useCallback(async () => {
        if (!vehicleId) {
            setCargo(null)
            setLoading(false)
            setError(null)
            return
        }

        setLoading(true)
        setError(null)
        try {
            const data = await apiGetVehicleCargo(vehicleId)
            setCargo(data)
        } catch (err) {
            setCargo(null)
            setError(
                err instanceof Error
                    ? err.message
                    : 'Failed to load vehicle cargo',
            )
        } finally {
            setLoading(false)
        }
    }, [vehicleId])

    useEffect(() => {
        void reload()
    }, [reload])

    return { cargo, loading, error, reload }
}
