'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
    apiCreateTrip,
    apiGetDrivers,
    apiGetShipments,
    apiGetVehicles,
} from '../services/scmApi'
import { computeCapacity } from '../utils/capacity'
import { getApiErrorMessage } from '../utils/apiError'
import type {
    CreateTripInput,
    Driver,
    Shipment,
    Trip,
    Vehicle,
} from '../types'

export type WizardStep = 1 | 2 | 3

export type WizardStopDraft = {
    /** Client-only key for reorder / React lists */
    key: string
    name: string
    address: string
    /** Map pin for Tracking — set via location picker */
    lat: number | null
    lng: number | null
    windowStart: string
    windowEnd: string
    /** Shipment IDs assigned to this stop (load building) */
    shipmentIds: string[]
}

export type PlanTripWizardState = {
    code: string
    vehicleId: string
    driverId: string
    plannedStartAt: string
    notes: string
    stops: WizardStopDraft[]
}

function newStopKey() {
    return `stop-${Math.random().toString(36).slice(2, 10)}`
}

export function emptyStop(partial?: Partial<WizardStopDraft>): WizardStopDraft {
    return {
        key: newStopKey(),
        name: '',
        address: '',
        lat: null,
        lng: null,
        windowStart: '',
        windowEnd: '',
        shipmentIds: [],
        ...partial,
    }
}

const initialState = (): PlanTripWizardState => ({
    code: '',
    vehicleId: '',
    driverId: '',
    plannedStartAt: '',
    notes: '',
    stops: [emptyStop({ name: 'Stop 1' })],
})

type UsePlanTripWizardArgs = {
    open: boolean
    onCreated: (trip: Trip) => void
}

export function usePlanTripWizard({ open, onCreated }: UsePlanTripWizardArgs) {
    const [step, setStep] = useState<WizardStep>(1)
    const [form, setForm] = useState<PlanTripWizardState>(initialState)
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [readyShipments, setReadyShipments] = useState<Shipment[]>([])
    const [loadingOptions, setLoadingOptions] = useState(false)
    const [optionsError, setOptionsError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [submitError, setSubmitError] = useState<string | null>(null)

    const reset = useCallback(() => {
        setStep(1)
        setForm(initialState())
        setSubmitError(null)
        setOptionsError(null)
        setSaving(false)
    }, [])

    useEffect(() => {
        if (!open) return
        reset()

        let cancelled = false
        setLoadingOptions(true)
        setOptionsError(null)

        void Promise.all([
            apiGetVehicles({ page: 1, pageSize: 100, status: 'AVAILABLE' }),
            apiGetDrivers({ page: 1, pageSize: 100, status: 'AVAILABLE' }),
            apiGetShipments({ page: 1, pageSize: 100, status: 'READY' }),
        ])
            .then(([vehicleResult, driverResult, shipmentResult]) => {
                if (cancelled) return
                // Routing eligibility: AVAILABLE + not maintenance-blocked
                setVehicles(
                    vehicleResult.data.filter(
                        (vehicle) => !vehicle.routingBlocked,
                    ),
                )
                setDrivers(driverResult.data)
                setReadyShipments(shipmentResult.data)
            })
            .catch((err) => {
                if (!cancelled) {
                    setOptionsError(
                        getApiErrorMessage(err, 'Failed to load trip options'),
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingOptions(false)
            })

        return () => {
            cancelled = true
        }
    }, [open, reset])

    const selectedVehicle =
        vehicles.find((vehicle) => vehicle.id === form.vehicleId) ?? null

    const assignedShipmentIds = useMemo(
        () => new Set(form.stops.flatMap((stop) => stop.shipmentIds)),
        [form.stops],
    )

    const selectedShipments = useMemo(
        () =>
            readyShipments.filter((shipment) =>
                assignedShipmentIds.has(shipment.id),
            ),
        [readyShipments, assignedShipmentIds],
    )

    const capacity = computeCapacity(selectedVehicle, selectedShipments)

    const patchForm = useCallback((patch: Partial<PlanTripWizardState>) => {
        setForm((current) => ({ ...current, ...patch }))
    }, [])

    const updateStop = useCallback(
        (key: string, patch: Partial<WizardStopDraft>) => {
            setForm((current) => ({
                ...current,
                stops: current.stops.map((stop) =>
                    stop.key === key ? { ...stop, ...patch } : stop,
                ),
            }))
        },
        [],
    )

    const addStop = useCallback(() => {
        setForm((current) => ({
            ...current,
            stops: [
                ...current.stops,
                emptyStop({ name: `Stop ${current.stops.length + 1}` }),
            ],
        }))
    }, [])

    const removeStop = useCallback((key: string) => {
        setForm((current) => {
            if (current.stops.length <= 1) return current
            return {
                ...current,
                stops: current.stops.filter((stop) => stop.key !== key),
            }
        })
    }, [])

    const moveStop = useCallback((key: string, direction: -1 | 1) => {
        setForm((current) => {
            const index = current.stops.findIndex((stop) => stop.key === key)
            const next = index + direction
            if (index < 0 || next < 0 || next >= current.stops.length) {
                return current
            }
            const stops = [...current.stops]
            const [item] = stops.splice(index, 1)
            stops.splice(next, 0, item)
            return { ...current, stops }
        })
    }, [])

    const toggleStopShipment = useCallback(
        (stopKey: string, shipmentId: string, checked: boolean) => {
            setForm((current) => ({
                ...current,
                stops: current.stops.map((stop) => {
                    if (stop.key === stopKey) {
                        const shipmentIds = checked
                            ? stop.shipmentIds.includes(shipmentId)
                                ? stop.shipmentIds
                                : [...stop.shipmentIds, shipmentId]
                            : stop.shipmentIds.filter((id) => id !== shipmentId)
                        return { ...stop, shipmentIds }
                    }
                    // Prevent double-assign across stops
                    if (checked && stop.shipmentIds.includes(shipmentId)) {
                        return {
                            ...stop,
                            shipmentIds: stop.shipmentIds.filter(
                                (id) => id !== shipmentId,
                            ),
                        }
                    }
                    return stop
                }),
            }))
        },
        [],
    )

    const canContinueStep1 = true

    const canContinueStep2 = form.stops.every(
        (stop) => stop.address.trim().length > 0,
    )

    const canSave =
        canContinueStep2 &&
        (!selectedVehicle || capacity.canFit || selectedShipments.length === 0)

    const goNext = () => {
        setSubmitError(null)
        if (step === 1) {
            if (!canContinueStep1) return
            setStep(2)
            return
        }
        if (step === 2) {
            if (!canContinueStep2) {
                setSubmitError('Each stop needs an address before continuing.')
                return
            }
            setStep(3)
        }
    }

    const goBack = () => {
        setSubmitError(null)
        if (step === 2) setStep(1)
        if (step === 3) setStep(2)
    }

    const buildPayload = (): CreateTripInput => {
        const allIds = [...assignedShipmentIds]
        const stopsPayload = form.stops.map((stop, index) => {
            const sequence = index + 1
            const dropoffs = stop.shipmentIds.map((shipmentId) => ({
                shipmentId,
                action: 'DROPOFF' as const,
            }))
            // First stop also carries PICKUP for the full load (manual load building)
            const pickups =
                sequence === 1
                    ? allIds.map((shipmentId) => ({
                          shipmentId,
                          action: 'PICKUP' as const,
                      }))
                    : []
            const seen = new Set<string>()
            const shipments = [...pickups, ...dropoffs].filter((link) => {
                const key = `${link.shipmentId}:${link.action}`
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })

            return {
                sequence,
                name: stop.name.trim() || undefined,
                address: stop.address.trim(),
                lat: stop.lat,
                lng: stop.lng,
                windowStart: stop.windowStart || null,
                windowEnd: stop.windowEnd || null,
                shipments,
            }
        })

        return {
            code: form.code.trim() || undefined,
            vehicleId: form.vehicleId || null,
            driverId: form.driverId || null,
            plannedStartAt: form.plannedStartAt || null,
            notes: form.notes.trim() || null,
            // PLANNED when vehicle assigned; DRAFT allows unassigned vehicle shell
            status: form.vehicleId ? 'PLANNED' : 'DRAFT',
            stops: stopsPayload,
        }
    }

    const save = async () => {
        if (!canContinueStep2) {
            setSubmitError('Each stop needs an address before saving.')
            return
        }
        if (selectedVehicle && selectedShipments.length > 0 && !capacity.canFit) {
            setSubmitError(
                capacity.message ?? 'Load exceeds vehicle item capacity.',
            )
            return
        }

        setSaving(true)
        setSubmitError(null)
        try {
            const trip = await apiCreateTrip(buildPayload())
            onCreated(trip)
            reset()
        } catch (err) {
            setSubmitError(getApiErrorMessage(err, 'Failed to save trip'))
        } finally {
            setSaving(false)
        }
    }

    return {
        step,
        form,
        vehicles,
        drivers,
        readyShipments,
        loadingOptions,
        optionsError,
        saving,
        submitError,
        selectedVehicle,
        selectedShipments,
        assignedShipmentIds,
        capacity,
        canContinueStep2,
        canSave,
        patchForm,
        updateStop,
        addStop,
        removeStop,
        moveStop,
        toggleStopShipment,
        goNext,
        goBack,
        save,
        reset,
        setSubmitError,
    }
}
