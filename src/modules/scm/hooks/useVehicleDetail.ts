'use client'

import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import {
    apiGetMaintenance,
    apiGetTrackingHistory,
    apiGetTrackingLatest,
    apiGetTrips,
    apiGetVehicle,
    apiUpdateVehicle,
} from '../services/scmApi'
import type {
    GpsLog,
    MaintenanceRecord,
    Trip,
    Vehicle,
} from '../types'

/**
 * Loads a single vehicle plus latest GPS, recent trail, maintenance, and trips.
 * Live Socket.IO later: subscribe to `vehicle:{id}:gps` and merge into
 * `latest` / prepend `history` without changing this page layout.
 */
export function useVehicleDetail(vehicleId: string | undefined) {
    const [vehicle, setVehicle] = useState<Vehicle | null>(null)
    const [latest, setLatest] = useState<GpsLog | null>(null)
    const [history, setHistory] = useState<GpsLog[]>([])
    const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([])
    const [trips, setTrips] = useState<Trip[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [notFound, setNotFound] = useState(false)

    const reload = useCallback(async () => {
        if (!vehicleId) {
            setLoading(false)
            setNotFound(false)
            setVehicle(null)
            setLatest(null)
            setHistory([])
            setMaintenance([])
            setTrips([])
            setError(null)
            return
        }

        setLoading(true)
        setError(null)
        setNotFound(false)

        try {
            const [vehicleData, latestData, historyData, maintData, tripData] =
                await Promise.all([
                    apiGetVehicle(vehicleId),
                    apiGetTrackingLatest(vehicleId),
                    apiGetTrackingHistory(vehicleId, { limit: 100 }),
                    apiGetMaintenance({
                        vehicleId,
                        page: 1,
                        pageSize: 50,
                    }),
                    apiGetTrips({
                        vehicleId,
                        page: 1,
                        pageSize: 20,
                    }),
                ])

            setVehicle(vehicleData)
            setLatest(latestData)
            setHistory(historyData)
            setMaintenance(maintData.data)
            setTrips(tripData.data)
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
                setNotFound(true)
                setVehicle(null)
            } else {
                setError(
                    err instanceof Error
                        ? err.message
                        : 'Failed to load vehicle',
                )
            }
        } finally {
            setLoading(false)
        }
    }, [vehicleId])

    useEffect(() => {
        void reload()
    }, [reload])

    const update = async (body: Partial<Vehicle>) => {
        if (!vehicleId) return null
        const updated = await apiUpdateVehicle(vehicleId, body)
        setVehicle(updated)
        return updated
    }

    return {
        vehicle,
        latest,
        history,
        maintenance,
        trips,
        loading,
        error,
        notFound,
        reload,
        update,
    }
}
