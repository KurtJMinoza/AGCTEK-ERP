'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    apiAddLoadPlanLine,
    apiCreateLoadPlan,
    apiGetAvailableShipmentLines,
    apiGetLoadPlans,
    apiGetVehicles,
    apiLoadPlanAction,
    apiRemoveLoadPlanLine,
} from '../services/scmApi'
import { getApiErrorMessage } from '../utils/apiError'
import type { LoadPlan, ShipmentLine, Vehicle } from '../types'

/**
 * Load Building state: fleet, each vehicle's active load plan, and the pool of
 * unassigned lines from READY shipments. All capacity decisions are server-side.
 */
export function useLoadBuilding() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [plans, setPlans] = useState<LoadPlan[]>([])
    const [available, setAvailable] = useState<ShipmentLine[]>([])
    const [vehicleId, setVehicleId] = useState('')
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [linesLoading, setLinesLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const loadFleet = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const [vehicleResult, planResult] = await Promise.all([
                apiGetVehicles({ page: 1, pageSize: 100 }),
                apiGetLoadPlans({ page: 1, pageSize: 100, active: true }),
            ])
            setVehicles(vehicleResult.data)
            setPlans(planResult.data)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load vehicles and load plans'))
        } finally {
            setLoading(false)
        }
    }, [])

    const loadLines = useCallback(async (term: string) => {
        setLinesLoading(true)
        try {
            const result = await apiGetAvailableShipmentLines(term.trim() || undefined)
            setAvailable(result.data)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load shipment lines'))
        } finally {
            setLinesLoading(false)
        }
    }, [])

    useEffect(() => {
        void loadFleet()
    }, [loadFleet])

    useEffect(() => {
        const handle = setTimeout(() => void loadLines(search), 300)
        return () => clearTimeout(handle)
    }, [loadLines, search])

    const planByVehicle = useMemo(
        () => new Map(plans.map((plan) => [plan.vehicleId, plan])),
        [plans],
    )
    const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null
    const plan = vehicleId ? (planByVehicle.get(vehicleId) ?? null) : null

    const applyPlan = useCallback((next: LoadPlan) => {
        setPlans((current) => {
            const others = current.filter((p) => p.id !== next.id)
            return next.status === 'CANCELLED' || next.status === 'COMPLETED'
                ? others
                : [...others, next]
        })
    }, [])

    /** Run a mutation; refresh the line pool after cargo changes. Returns error text. */
    const run = useCallback(
        async (
            action: () => Promise<LoadPlan>,
            refreshLines: boolean,
        ): Promise<string | null> => {
            setBusy(true)
            try {
                applyPlan(await action())
                if (refreshLines) await loadLines(search)
                return null
            } catch (err) {
                return getApiErrorMessage(err, 'Request failed')
            } finally {
                setBusy(false)
            }
        },
        [applyPlan, loadLines, search],
    )

    return {
        vehicles,
        vehicle,
        vehicleId,
        setVehicleId,
        plan,
        planByVehicle,
        available,
        search,
        setSearch,
        loading,
        linesLoading,
        busy,
        error,
        reload: loadFleet,
        startPlan: () =>
            run(() => apiCreateLoadPlan({ vehicleId }), false),
        addLine: (line: ShipmentLine) =>
            plan
                ? run(
                      () =>
                          apiAddLoadPlanLine(plan.id, {
                              shipmentLineId: line.id,
                              assignedQty: line.quantity,
                          }),
                      true,
                  )
                : Promise.resolve('Start a load plan first'),
        removeLine: (lineId: string) =>
            plan
                ? run(() => apiRemoveLoadPlanLine(plan.id, lineId), true)
                : Promise.resolve('No load plan'),
        action: (name: 'validate' | 'ready' | 'reopen' | 'cancel') =>
            plan
                ? run(() => apiLoadPlanAction(plan.id, name), name === 'cancel')
                : Promise.resolve('No load plan'),
    }
}
