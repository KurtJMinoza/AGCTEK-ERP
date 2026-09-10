'use client'

import { useEffect, useMemo, useState } from 'react'
import Drawer from '@/components/ui/Drawer'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Checkbox from '@/components/ui/Checkbox'
import Radio from '@/components/ui/Radio'
import Alert from '@/components/ui/Alert'
import ScrollBar from '@/components/ui/ScrollBar'
import VehicleCapacityMonitor from './VehicleCapacityMonitor'
import {
    apiAssignLoad,
    apiGetShipments,
    apiGetTrips,
    apiGetVehicles,
} from '../services/scmApi'
import { computeCapacity } from '../utils/capacity'
import {
    buildLoadPlanPreview,
    formatWindowRange,
} from '../utils/loadPlanPreview'
import { getApiErrorMessage } from '../utils/apiError'
import {
    formatMovementLabel,
    formatStatusLabel,
} from '../utils/status'
import type { Shipment, Trip, Vehicle } from '../types'

type Option = { value: string; label: string }
type PlanStep = 'build' | 'review'

type AssignLoadDrawerProps = {
    isOpen: boolean
    onClose: () => void
    preselected: Shipment[]
    onAssigned: () => void
}

/**
 * Phase 3.1 Load Building — pool READY orders, qty capacity, stop sequence,
 * time windows, then Save draft (DRAFT) or Approve plan (ASSIGNED).
 */
export default function AssignLoadDrawer({
    isOpen,
    onClose,
    preselected,
    onAssigned,
}: AssignLoadDrawerProps) {
    const [step, setStep] = useState<PlanStep>('build')
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [readyShipments, setReadyShipments] = useState<Shipment[]>([])
    const [openTrips, setOpenTrips] = useState<Trip[]>([])
    const [vehicleId, setVehicleId] = useState('')
    const [tripMode, setTripMode] = useState<'existing' | 'new'>('new')
    const [tripId, setTripId] = useState('')
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [deliverOrder, setDeliverOrder] = useState<string[]>([])
    const [tripCode, setTripCode] = useState('')
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loadingOptions, setLoadingOptions] = useState(false)

    /** Stable id list so parent re-renders don't retrigger the open effect. */
    const preselectedKey = useMemo(
        () =>
            preselected
                .map((s) => s.id)
                .sort()
                .join(','),
        [preselected],
    )

    useEffect(() => {
        if (!isOpen) return

        setError(null)
        setSaving(false)
        setStep('build')
        setTripCode('')
        setVehicleId('')
        setTripId('')
        setTripMode('new')
        setOpenTrips([])
        setDeliverOrder([])
        setSelectedIds(preselected.map((s) => s.id))

        let cancelled = false
        setLoadingOptions(true)

        void Promise.all([
            apiGetVehicles({ page: 1, pageSize: 100, status: 'AVAILABLE' }),
            apiGetShipments({ page: 1, pageSize: 100, status: 'READY' }),
        ])
            .then(([vehicleResult, shipmentResult]) => {
                if (cancelled) return
                setVehicles(
                    vehicleResult.data.filter(
                        (vehicle) => !vehicle.routingBlocked,
                    ),
                )
                const merged = [...shipmentResult.data]
                for (const item of preselected) {
                    if (!merged.some((s) => s.id === item.id)) merged.push(item)
                }
                setReadyShipments(merged)
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        getApiErrorMessage(err, 'Failed to load assign options'),
                    )
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingOptions(false)
            })

        return () => {
            cancelled = true
        }
        // preselectedKey stands in for preselected identity; read latest preselected when effect runs
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, preselectedKey])

    useEffect(() => {
        if (!isOpen || !vehicleId) {
            setOpenTrips([])
            setTripId('')
            setTripMode('new')
            return
        }

        let cancelled = false
        void Promise.all([
            apiGetTrips({
                page: 1,
                pageSize: 50,
                vehicleId,
                status: 'ASSIGNED',
            }),
            apiGetTrips({
                page: 1,
                pageSize: 50,
                vehicleId,
                status: 'DRAFT',
            }),
        ])
            .then(([assigned, draft]) => {
                if (cancelled) return
                const merged = [...assigned.data, ...draft.data].sort(
                    (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime(),
                )
                setOpenTrips(merged)
                if (merged.length > 0) {
                    setTripMode('existing')
                    setTripId(merged[0].id)
                } else {
                    setTripMode('new')
                    setTripId('')
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setOpenTrips([])
                    setTripMode('new')
                    setTripId('')
                }
            })

        return () => {
            cancelled = true
        }
    }, [isOpen, vehicleId])

    const vehicle = vehicles.find((item) => item.id === vehicleId) ?? null
    const selectedTrip =
        openTrips.find((item) => item.id === tripId) ?? null
    const selectedShipments = useMemo(
        () =>
            readyShipments.filter((item) => selectedIds.includes(item.id)),
        [readyShipments, selectedIds],
    )

    const deliverKeys = useMemo(
        () => [
            ...new Set(
                selectedShipments.map((s) =>
                    s.destAddress.trim().toLowerCase(),
                ),
            ),
        ],
        [selectedShipments],
    )

    useEffect(() => {
        setDeliverOrder((current) => {
            const kept = current.filter((key) => deliverKeys.includes(key))
            const missing = deliverKeys.filter((key) => !kept.includes(key))
            const next = [...kept, ...missing]
            if (
                next.length === current.length &&
                next.every((key, index) => key === current[index])
            ) {
                return current
            }
            return next
        })
    }, [deliverKeys])

    const capacityShipments = useMemo(() => {
        if (tripMode !== 'existing' || !selectedTrip) {
            return selectedShipments
        }
        const existing =
            selectedTrip.stops?.flatMap(
                (stop) =>
                    stop.shipments
                        ?.map((link) => link.shipment)
                        .filter(Boolean) ?? [],
            ) ?? []
        const unique = [
            ...new Map(
                [...existing, ...selectedShipments].map((s) => [s!.id, s!]),
            ).values(),
        ]
        return unique
    }, [tripMode, selectedTrip, selectedShipments])

    const snapshot = computeCapacity(vehicle, capacityShipments)
    const previewStops = useMemo(
        () => buildLoadPlanPreview(selectedShipments, deliverOrder),
        [selectedShipments, deliverOrder],
    )
    const missingWindowCount = previewStops.filter(
        (stop) => stop.kind === 'deliver' && stop.missingWindow,
    ).length

    const vehicleOptions: Option[] = useMemo(
        () =>
            vehicles.map((item) => ({
                value: item.id,
                label: `${item.plateNumber} · ${item.make} ${item.model} (${item.capacityQty ?? 0} items)`,
            })),
        [vehicles],
    )

    const tripOptions: Option[] = useMemo(
        () =>
            openTrips.map((trip) => ({
                value: trip.id,
                label: `${trip.code} · ${formatStatusLabel(trip.status)} · ${trip.stops?.length ?? 0} stops`,
            })),
        [openTrips],
    )

    const toggleShipment = (id: string, checked: boolean) => {
        setSelectedIds((current) =>
            checked
                ? current.includes(id)
                    ? current
                    : [...current, id]
                : current.filter((value) => value !== id),
        )
    }

    const moveDeliverStop = (key: string, direction: -1 | 1) => {
        setDeliverOrder((current) => {
            const index = current.indexOf(key)
            const next = index + direction
            if (index < 0 || next < 0 || next >= current.length) return current
            const copy = [...current]
            const [item] = copy.splice(index, 1)
            copy.splice(next, 0, item)
            return copy
        })
    }

    const canContinue =
        Boolean(vehicle) &&
        selectedShipments.length > 0 &&
        snapshot.canFit &&
        (tripMode === 'new' || Boolean(tripId))

    const submit = async (planMode: 'draft' | 'approve') => {
        if (!vehicle || selectedShipments.length === 0 || !snapshot.canFit) return
        if (tripMode === 'existing' && !tripId) return

        setSaving(true)
        setError(null)
        try {
            await apiAssignLoad({
                vehicleId: vehicle.id,
                shipmentIds: selectedShipments.map((s) => s.id),
                planMode,
                stopOrder: deliverOrder,
                ...(tripMode === 'existing'
                    ? { tripId }
                    : {
                          forceNewTrip: true,
                          tripCode: tripCode.trim() || undefined,
                      }),
            })
            onAssigned()
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save load plan'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Drawer
            title={
                step === 'build'
                    ? 'Load building (3.1–3.2)'
                    : 'Plan review & approval (3.5)'
            }
            isOpen={isOpen}
            onClose={onClose}
            onRequestClose={onClose}
            placement="right"
            width={560}
            footer={
                <div className="flex flex-wrap justify-end gap-2">
                    {step === 'review' ? (
                        <Button
                            disabled={saving}
                            onClick={() => setStep('build')}
                        >
                            Back
                        </Button>
                    ) : (
                        <Button onClick={onClose}>Cancel</Button>
                    )}
                    {step === 'build' ? (
                        <Button
                            variant="solid"
                            disabled={!canContinue}
                            onClick={() => {
                                setError(null)
                                setStep('review')
                            }}
                        >
                            Review plan
                        </Button>
                    ) : (
                        <>
                            <Button
                                loading={saving}
                                disabled={saving || !canContinue}
                                onClick={() => void submit('draft')}
                            >
                                Save draft
                            </Button>
                            <Button
                                variant="solid"
                                loading={saving}
                                disabled={saving || !canContinue}
                                onClick={() => void submit('approve')}
                            >
                                Approve plan
                            </Button>
                        </>
                    )}
                </div>
            }
        >
            <div className="space-y-5">
                {error ? (
                    <Alert showIcon type="danger" title="Plan failed">
                        {error}
                    </Alert>
                ) : null}

                {step === 'build' ? (
                    <>
                        <p className="text-sm text-gray-500">
                            Pool READY (packed) orders, pick a vehicle, and
                            check item capacity before reviewing the route.
                        </p>

                        <div>
                            <p className="mb-2 text-sm font-semibold">
                                Vehicle
                            </p>
                            <Select
                                isLoading={loadingOptions}
                                placeholder="Select a routing-eligible vehicle"
                                options={vehicleOptions}
                                value={
                                    vehicleOptions.find(
                                        (o) => o.value === vehicleId,
                                    ) ?? null
                                }
                                onChange={(option) =>
                                    setVehicleId(
                                        (option as Option | null)?.value ?? '',
                                    )
                                }
                            />
                        </div>

                        {vehicle ? (
                            <>
                                <div>
                                    <p className="mb-2 text-sm font-semibold">
                                        Trip
                                    </p>
                                    <Radio.Group
                                        vertical
                                        value={tripMode}
                                        onChange={(value) => {
                                            const mode = value as
                                                | 'existing'
                                                | 'new'
                                            setTripMode(mode)
                                            if (
                                                mode === 'existing' &&
                                                openTrips[0]
                                            ) {
                                                setTripId(openTrips[0].id)
                                            }
                                        }}
                                    >
                                        <Radio
                                            value="existing"
                                            disabled={openTrips.length === 0}
                                        >
                                            Consolidate onto existing draft /
                                            planned trip
                                            {openTrips.length === 0
                                                ? ' (none)'
                                                : ''}
                                        </Radio>
                                        <Radio value="new">
                                            Create a new trip plan
                                        </Radio>
                                    </Radio.Group>
                                </div>

                                {tripMode === 'existing' ? (
                                    <Select
                                        placeholder="Select trip"
                                        options={tripOptions}
                                        value={
                                            tripOptions.find(
                                                (o) => o.value === tripId,
                                            ) ?? null
                                        }
                                        onChange={(option) =>
                                            setTripId(
                                                (option as Option | null)
                                                    ?.value ?? '',
                                            )
                                        }
                                    />
                                ) : (
                                    <Input
                                        placeholder="Trip code (optional)"
                                        value={tripCode}
                                        onChange={(e) =>
                                            setTripCode(e.target.value)
                                        }
                                    />
                                )}

                                <VehicleCapacityMonitor
                                    vehicle={vehicle}
                                    shipments={capacityShipments}
                                />
                            </>
                        ) : (
                            <p className="text-sm text-gray-500">
                                Select a vehicle to see capacity and open trips.
                            </p>
                        )}

                        <div>
                            <p className="mb-2 text-sm font-semibold">
                                READY shipments (order pool)
                            </p>
                            <ScrollBar className="max-h-64">
                                <ul className="space-y-2">
                                    {readyShipments.map((shipment) => (
                                        <li
                                            key={shipment.id}
                                            className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                                        >
                                            <Checkbox
                                                checked={selectedIds.includes(
                                                    shipment.id,
                                                )}
                                                onChange={(checked) =>
                                                    toggleShipment(
                                                        shipment.id,
                                                        Boolean(checked),
                                                    )
                                                }
                                            >
                                                <span className="block text-sm font-medium">
                                                    {shipment.reference}
                                                    <span className="ml-2 text-xs font-normal text-gray-500">
                                                        ·{' '}
                                                        {formatMovementLabel(
                                                            shipment.movementType,
                                                        )}
                                                    </span>
                                                </span>
                                                <span className="block text-xs text-gray-500">
                                                    {shipment.movementType ===
                                                    'PICKUP'
                                                        ? shipment.originAddress ||
                                                          shipment.destAddress
                                                        : shipment.destAddress}{' '}
                                                    ·{' '}
                                                    {(
                                                        shipment.quantity ?? 0
                                                    ).toLocaleString()}{' '}
                                                    items
                                                </span>
                                                <span className="block text-xs text-gray-400">
                                                    Window:{' '}
                                                    {formatWindowRange(
                                                        shipment.earliestDeliveryAt,
                                                        shipment.latestDeliveryAt,
                                                    )}
                                                </span>
                                            </Checkbox>
                                        </li>
                                    ))}
                                </ul>
                            </ScrollBar>
                        </div>
                    </>
                ) : (
                    <>
                        <Alert showIcon type="info" title="Load manifest">
                            {selectedShipments.length} shipment
                            {selectedShipments.length === 1 ? '' : 's'} ·{' '}
                            {snapshot.loadedQty} / {snapshot.capacityQty ?? '—'}{' '}
                            items
                            {vehicle
                                ? ` · ${vehicle.plateNumber}`
                                : ''}
                            {tripMode === 'existing' && selectedTrip
                                ? ` · trip ${selectedTrip.code}`
                                : ''}
                        </Alert>

                        {missingWindowCount > 0 ? (
                            <Alert showIcon type="warning">
                                {missingWindowCount} deliver stop
                                {missingWindowCount === 1 ? '' : 's'} missing
                                time windows (soft warning — you can still
                                approve).
                            </Alert>
                        ) : null}

                        <VehicleCapacityMonitor
                            vehicle={vehicle}
                            shipments={capacityShipments}
                        />

                        <div>
                            <p className="mb-2 text-sm font-semibold">
                                Stop sequence (manual)
                            </p>
                            <ul className="space-y-2">
                                {previewStops.map((stop, index) => {
                                    const deliverIndex =
                                        stop.kind === 'deliver'
                                            ? deliverOrder.indexOf(stop.key)
                                            : -1
                                    return (
                                        <li
                                            key={`${stop.kind}-${stop.key}-${index}`}
                                            className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium">
                                                        {index + 1}. {stop.name}
                                                    </p>
                                                    <p className="truncate text-xs text-gray-500">
                                                        {stop.address}
                                                    </p>
                                                    <p className="text-xs text-gray-400">
                                                        {stop.quantity} items ·{' '}
                                                        {formatWindowRange(
                                                            stop.windowStart,
                                                            stop.windowEnd,
                                                        )}
                                                    </p>
                                                </div>
                                                {stop.kind === 'deliver' ? (
                                                    <div className="flex shrink-0 gap-1">
                                                        <Button
                                                            size="xs"
                                                            disabled={
                                                                deliverIndex <=
                                                                0
                                                            }
                                                            onClick={() =>
                                                                moveDeliverStop(
                                                                    stop.key,
                                                                    -1,
                                                                )
                                                            }
                                                        >
                                                            Up
                                                        </Button>
                                                        <Button
                                                            size="xs"
                                                            disabled={
                                                                deliverIndex <
                                                                    0 ||
                                                                deliverIndex >=
                                                                    deliverOrder.length -
                                                                        1
                                                            }
                                                            onClick={() =>
                                                                moveDeliverStop(
                                                                    stop.key,
                                                                    1,
                                                                )
                                                            }
                                                        >
                                                            Down
                                                        </Button>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        </div>

                        <div>
                            <p className="mb-2 text-sm font-semibold">
                                Shipments on plan
                            </p>
                            <ul className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                {selectedShipments.map((shipment) => (
                                    <li key={shipment.id}>
                                        {formatMovementLabel(
                                            shipment.movementType,
                                        )}{' '}
                                        · {shipment.reference} ·{' '}
                                        {(shipment.quantity ?? 0).toLocaleString()}{' '}
                                        items →{' '}
                                        {shipment.movementType === 'PICKUP'
                                            ? shipment.originAddress ||
                                              shipment.destAddress
                                            : shipment.destAddress}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <p className="text-xs text-gray-500">
                            Save draft keeps the trip as DRAFT. Approve plan
                            sets PLANNED (ready for Fleet Dispatch). Shipments
                            become ASSIGNED in both cases.
                        </p>
                    </>
                )}
            </div>
        </Drawer>
    )
}
