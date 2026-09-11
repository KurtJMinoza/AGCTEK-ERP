'use client'

import { useEffect, useMemo, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Alert from '@/components/ui/Alert'
import StatusBadge from '@/components/shared/StatusBadge'
import ScrollBar from '@/components/ui/ScrollBar'
import VehicleCapacityMonitor from '../VehicleCapacityMonitor'
import { apiGetTrip } from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type { Shipment, Trip } from '../../types'

type TripLoadManifestDialogProps = {
    tripId: string | null
    isOpen: boolean
    onClose: () => void
}

function uniqueShipments(trip: Trip): Shipment[] {
    const links =
        trip.stops?.flatMap(
            (stop) =>
                stop.shipments
                    ?.map((link) => link.shipment)
                    .filter((s): s is Shipment => Boolean(s)) ?? [],
        ) ?? []
    return [...new Map(links.map((s) => [s.id, s])).values()]
}

export default function TripLoadManifestDialog({
    tripId,
    isOpen,
    onClose,
}: TripLoadManifestDialogProps) {
    const [trip, setTrip] = useState<Trip | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!isOpen || !tripId) {
            setTrip(null)
            setError(null)
            return
        }

        let cancelled = false
        setLoading(true)
        setError(null)
        void apiGetTrip(tripId)
            .then((data) => {
                if (!cancelled) setTrip(data)
            })
            .catch((err) => {
                if (!cancelled) {
                    setTrip(null)
                    setError(getApiErrorMessage(err, 'Failed to load trip'))
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })

        return () => {
            cancelled = true
        }
    }, [isOpen, tripId])

    const shipments = useMemo(
        () => (trip ? uniqueShipments(trip) : []),
        [trip],
    )

    const orderedStops = useMemo(() => {
        if (!trip?.stops?.length) return []
        return [...trip.stops].sort((a, b) => a.sequence - b.sequence)
    }, [trip])

    return (
        <Dialog
            isOpen={isOpen}
            width={720}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h5 className="mb-1">Load manifest</h5>
            {trip ? (
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                    {trip.code}
                    {trip.vehicle
                        ? ` · ${trip.vehicle.code} (${trip.vehicle.plateNumber})`
                        : ''}
                    {trip.driver
                        ? ` · ${trip.driver.firstName} ${trip.driver.lastName}`
                        : ''}
                </p>
            ) : (
                <p className="mb-4 text-sm text-gray-500">Trip load details</p>
            )}

            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}

            {loading ? (
                <div className="flex justify-center py-12">
                    <Spinner size={36} />
                </div>
            ) : trip ? (
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={statusTone(trip.status)}>
                            {formatStatusLabel(trip.status)}
                        </StatusBadge>
                        <span className="text-xs text-gray-500">
                            {shipments.length} shipment
                            {shipments.length === 1 ? '' : 's'} ·{' '}
                            {orderedStops.length} stop
                            {orderedStops.length === 1 ? '' : 's'}
                        </span>
                    </div>

                    <VehicleCapacityMonitor
                        vehicle={trip.vehicle ?? null}
                        shipments={shipments}
                    />

                    <div>
                        <h6 className="mb-2">Shipments on load</h6>
                        {shipments.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No shipments linked to this trip.
                            </p>
                        ) : (
                            <ScrollBar className="max-h-48">
                                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {shipments.map((shipment) => (
                                        <li
                                            key={shipment.id}
                                            className="flex items-start justify-between gap-3 py-2 text-sm"
                                        >
                                            <div className="min-w-0">
                                                <p className="font-medium">
                                                    {shipment.reference}
                                                </p>
                                                <p className="truncate text-xs text-gray-500">
                                                    {shipment.customerName
                                                        ? `${shipment.customerName} · `
                                                        : ''}
                                                    {shipment.destAddress}
                                                </p>
                                                {(shipment.materialCode ||
                                                    shipment.externalOrderId ||
                                                    shipment.description) && (
                                                    <p className="text-xs text-gray-400">
                                                        {[
                                                            shipment.materialCode,
                                                            shipment.externalOrderId,
                                                            shipment.description,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(' · ')}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <StatusBadge
                                                    tone={statusTone(
                                                        shipment.status,
                                                    )}
                                                >
                                                    {formatStatusLabel(
                                                        shipment.status,
                                                    )}
                                                </StatusBadge>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {(
                                                        shipment.quantity ?? 0
                                                    ).toLocaleString()}{' '}
                                                    items
                                                </p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </ScrollBar>
                        )}
                    </div>

                    <div>
                        <h6 className="mb-2">Stop sequence</h6>
                        {orderedStops.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No stops on this trip.
                            </p>
                        ) : (
                            <ScrollBar className="max-h-56">
                                <ol className="space-y-2">
                                    {orderedStops.map((stop, index) => {
                                        const stopShipments =
                                            stop.shipments
                                                ?.map((link) => link.shipment)
                                                .filter(
                                                    (s): s is Shipment =>
                                                        Boolean(s),
                                                ) ?? []
                                        const actions = [
                                            ...new Set(
                                                stop.shipments?.map(
                                                    (link) => link.action,
                                                ) ?? [],
                                            ),
                                        ]
                                        return (
                                            <li
                                                key={stop.id}
                                                className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium">
                                                            {index + 1}.{' '}
                                                            {stop.name ||
                                                                stop.address}
                                                        </p>
                                                        <p className="truncate text-xs text-gray-500">
                                                            {stop.address}
                                                        </p>
                                                        <p className="text-xs text-gray-400">
                                                            {actions.length
                                                                ? actions.join(
                                                                      ', ',
                                                                  )
                                                                : 'Stop'}
                                                            {stopShipments.length
                                                                ? ` · ${stopShipments.length} shipment(s)`
                                                                : ''}
                                                        </p>
                                                    </div>
                                                    <StatusBadge
                                                        tone={statusTone(
                                                            stop.status,
                                                        )}
                                                    >
                                                        {formatStatusLabel(
                                                            stop.status,
                                                        )}
                                                    </StatusBadge>
                                                </div>
                                            </li>
                                        )
                                    })}
                                </ol>
                            </ScrollBar>
                        )}
                    </div>
                </div>
            ) : null}

            <div className="mt-6 flex justify-end">
                <Button onClick={onClose}>Close</Button>
            </div>
        </Dialog>
    )
}
