'use client'

import { useEffect, useMemo, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Alert from '@/components/ui/Alert'
import { Form, FormItem } from '@/components/ui/Form'
import {
    apiGetDrivers,
    apiGetVehicles,
} from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import type { Driver, Trip, TripStatus, Vehicle } from '../../types'

type Option = { value: string; label: string }

type EditTripDialogProps = {
    isOpen: boolean
    trip: Trip | null
    onClose: () => void
    onSave: (
        id: string,
        body: {
            code?: string
            vehicleId?: string | null
            driverId?: string | null
            plannedStartAt?: string | null
            notes?: string | null
            status?: TripStatus
        },
    ) => Promise<unknown>
}

const editableStatuses: TripStatus[] = ['DRAFT', 'PLANNED', 'ASSIGNED']

export default function EditTripDialog({
    isOpen,
    trip,
    onClose,
    onSave,
}: EditTripDialogProps) {
    const [code, setCode] = useState('')
    const [vehicleId, setVehicleId] = useState('')
    const [driverId, setDriverId] = useState('')
    const [plannedStartAt, setPlannedStartAt] = useState('')
    const [notes, setNotes] = useState('')
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [loadingOptions, setLoadingOptions] = useState(false)

    useEffect(() => {
        if (!isOpen || !trip) return

        setCode(trip.code)
        setVehicleId(trip.vehicleId ?? '')
        setDriverId(trip.driverId ?? '')
        setPlannedStartAt(
            trip.plannedStartAt
                ? new Date(trip.plannedStartAt).toISOString().slice(0, 16)
                : '',
        )
        setNotes(trip.notes ?? '')
        setError(null)
        setSaving(false)

        let cancelled = false
        setLoadingOptions(true)
        void Promise.all([
            apiGetVehicles({ page: 1, pageSize: 100 }),
            apiGetDrivers({ page: 1, pageSize: 100 }),
        ])
            .then(([vehicleResult, driverResult]) => {
                if (cancelled) return
                setVehicles(
                    vehicleResult.data.filter(
                        (vehicle) =>
                            !vehicle.routingBlocked ||
                            vehicle.id === trip.vehicleId,
                    ),
                )
                setDrivers(driverResult.data)
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
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
    }, [isOpen, trip])

    const vehicleOptions: Option[] = useMemo(
        () =>
            vehicles.map((item) => ({
                value: item.id,
                label: `${item.code} · ${item.plateNumber}`,
            })),
        [vehicles],
    )

    const driverOptions: Option[] = useMemo(
        () => [
            { value: '', label: 'No driver' },
            ...drivers.map((item) => ({
                value: item.id,
                label: `${item.firstName} ${item.lastName}`,
            })),
        ],
        [drivers],
    )

    const canEdit = trip
        ? editableStatuses.includes(trip.status)
        : false

    const submit = async () => {
        if (!trip || !canEdit) return
        setSaving(true)
        setError(null)
        try {
            await onSave(trip.id, {
                code: code.trim(),
                vehicleId: vehicleId || null,
                driverId: driverId || null,
                plannedStartAt: plannedStartAt
                    ? new Date(plannedStartAt).toISOString()
                    : null,
                notes: notes.trim() || null,
            })
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to update trip'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog
            isOpen={isOpen}
            width={520}
            onClose={onClose}
            onRequestClose={onClose}
        >
            <h4 className="mb-1">Edit trip</h4>
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                Update planned trip details before the run starts.
            </p>

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="Update failed">
                    {error}
                </Alert>
            ) : null}

            {!canEdit ? (
                <Alert showIcon type="warning" className="mb-4">
                    Only DRAFT, PLANNED, or ASSIGNED trips can be edited (before start).
                </Alert>
            ) : null}

            <Form
                onSubmit={(e) => {
                    e.preventDefault()
                    void submit()
                }}
            >
                <FormItem label="Trip code">
                    <Input
                        value={code}
                        disabled={!canEdit || saving}
                        onChange={(e) => setCode(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Vehicle">
                    <Select
                        isLoading={loadingOptions}
                        isDisabled={!canEdit || saving}
                        options={vehicleOptions}
                        value={
                            vehicleOptions.find((o) => o.value === vehicleId) ??
                            null
                        }
                        onChange={(option) =>
                            setVehicleId(
                                (option as Option | null)?.value ?? '',
                            )
                        }
                    />
                </FormItem>
                <FormItem label="Driver">
                    <Select
                        isLoading={loadingOptions}
                        isDisabled={!canEdit || saving}
                        options={driverOptions}
                        value={
                            driverOptions.find((o) => o.value === driverId) ??
                            driverOptions[0]
                        }
                        onChange={(option) =>
                            setDriverId(
                                (option as Option | null)?.value ?? '',
                            )
                        }
                    />
                </FormItem>
                <FormItem label="Planned start">
                    <Input
                        type="datetime-local"
                        value={plannedStartAt}
                        disabled={!canEdit || saving}
                        onChange={(e) => setPlannedStartAt(e.target.value)}
                    />
                </FormItem>
                <FormItem label="Notes">
                    <Input
                        textArea
                        rows={3}
                        value={notes}
                        disabled={!canEdit || saving}
                        onChange={(e) => setNotes(e.target.value)}
                    />
                </FormItem>

                <div className="mt-2 flex justify-end gap-2">
                    <Button type="button" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        variant="solid"
                        type="submit"
                        loading={saving}
                        disabled={!canEdit || !code.trim()}
                    >
                        Save changes
                    </Button>
                </div>
            </Form>
        </Dialog>
    )
}
