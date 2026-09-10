'use client'

import Alert from '@/components/ui/Alert'
import Checkbox from '@/components/ui/Checkbox'
import VehicleCapacityMonitor from '../VehicleCapacityMonitor'
import type { CapacitySnapshot } from '../../utils/capacity'
import type { Shipment, Vehicle } from '../../types'
import type { WizardStopDraft } from '../../hooks/usePlanTripWizard'

type PlanTripStepShipmentsProps = {
    stops: WizardStopDraft[]
    vehicle: Vehicle | null
    readyShipments: Shipment[]
    assignedShipmentIds: Set<string>
    capacity: CapacitySnapshot
    loading: boolean
    error: string | null
    onToggle: (stopKey: string, shipmentId: string, checked: boolean) => void
}

export default function PlanTripStepShipments({
    stops,
    vehicle,
    readyShipments,
    assignedShipmentIds,
    capacity,
    loading,
    error,
    onToggle,
}: PlanTripStepShipmentsProps) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
                Assign READY shipments to stops (load building). A shipment can
                only sit on one stop; first stop also gets PICKUP links on save.
            </p>

            {error ? (
                <Alert showIcon type="danger">
                    {error}
                </Alert>
            ) : null}

            {loading ? (
                <p className="text-sm text-gray-500">Loading shipments…</p>
            ) : null}

            <VehicleCapacityMonitor
                vehicle={vehicle}
                shipments={readyShipments.filter((shipment) =>
                    assignedShipmentIds.has(shipment.id),
                )}
            />

            {!vehicle ? (
                <Alert showIcon type="info">
                    No vehicle selected — capacity check is skipped. Trip will
                    save as DRAFT until a vehicle is assigned.
                </Alert>
            ) : null}

            {capacity.level === 'over' ? (
                <Alert showIcon type="danger">
                    {capacity.message ?? 'Over capacity — reduce the load before saving.'}
                </Alert>
            ) : null}

            {!loading && readyShipments.length === 0 ? (
                <Alert showIcon type="warning">
                    No READY shipments available. You can still save the trip
                    shell and assign later.
                </Alert>
            ) : null}

            <div className="max-h-[42vh] space-y-4 overflow-y-auto pe-1">
                {stops.map((stop, index) => {
                    const available = readyShipments.filter(
                        (shipment) =>
                            !assignedShipmentIds.has(shipment.id) ||
                            stop.shipmentIds.includes(shipment.id),
                    )

                    return (
                        <div
                            key={stop.key}
                            className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <p className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Stop {index + 1}
                                {stop.name ? ` · ${stop.name}` : ''}
                            </p>
                            <p className="mb-3 text-xs text-gray-500">
                                {stop.address || 'No address'}
                            </p>

                            {available.length === 0 ? (
                                <p className="text-sm text-gray-500">
                                    No unassigned READY shipments left for this
                                    stop.
                                </p>
                            ) : (
                                <ul className="space-y-2">
                                    {available.map((shipment) => {
                                        const checked =
                                            stop.shipmentIds.includes(
                                                shipment.id,
                                            )
                                        return (
                                            <li
                                                key={shipment.id}
                                                className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800/60"
                                            >
                                                <Checkbox
                                                    checked={checked}
                                                    onChange={(value) =>
                                                        onToggle(
                                                            stop.key,
                                                            shipment.id,
                                                            Boolean(value),
                                                        )
                                                    }
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                            {shipment.reference}
                                                            {shipment.customerName
                                                                ? ` · ${shipment.customerName}`
                                                                : ''}
                                                        </p>
                                                        <p className="truncate text-xs text-gray-500">
                                                            → {shipment.destAddress}
                                                        </p>
                                                        <p className="text-xs text-gray-400">
                                                            {shipment.quantity}{' '}
                                                            items
                                                            {shipment.weightKg
                                                                ? ` · ${shipment.weightKg} kg`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                </Checkbox>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
