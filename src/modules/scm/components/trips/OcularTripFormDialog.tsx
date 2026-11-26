'use client'

import { useEffect, useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import CrmSelect from '@/modules/crm/components/CrmSelect'
import {
    apiCreateOcularTrip,
    apiGetAvailableVehicles,
    apiGetDrivers,
} from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import type { Driver, Vehicle } from '../../types'

type OcularTripFormDialogProps = {
    open: boolean
    onClose: () => void
    /** Called with the new trip id so the caller can open the stop planner. */
    onCreated: (tripId: string) => void
}

/** `YYYY-MM-DDTHH:mm` in local time for `datetime-local` inputs. */
function toLocalInput(date: Date) {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function defaultWindow() {
    const start = new Date()
    start.setMinutes(0, 0, 0)
    start.setHours(start.getHours() + 1)
    const end = new Date(start.getTime() + 8 * 60 * 60 * 1000)
    return { start: toLocalInput(start), end: toLocalInput(end) }
}

/**
 * Plan an ocular run: pick the window, then a vehicle that is free for it (SCM
 * availability), optionally a driver. Stops are added afterwards in the planner.
 */
export default function OcularTripFormDialog({
    open,
    onClose,
    onCreated,
}: OcularTripFormDialogProps) {
    const [windowStart, setWindowStart] = useState('')
    const [windowEnd, setWindowEnd] = useState('')
    const [vehicleId, setVehicleId] = useState<string | null>(null)
    const [driverId, setDriverId] = useState<string | null>(null)
    const [notes, setNotes] = useState('')
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [loadingVehicles, setLoadingVehicles] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        const win = defaultWindow()
        setWindowStart(win.start)
        setWindowEnd(win.end)
        setVehicleId(null)
        setDriverId(null)
        setNotes('')
        setError(null)
        void apiGetDrivers({ page: 1, pageSize: 100 })
            .then((res) => setDrivers(res.data))
            .catch(() => setDrivers([]))
    }, [open])

    const windowValid = useMemo(() => {
        if (!windowStart || !windowEnd) return false
        return new Date(windowEnd).getTime() > new Date(windowStart).getTime()
    }, [windowStart, windowEnd])

    // Availability follows the window; refetch whenever it changes.
    useEffect(() => {
        if (!open || !windowValid) {
            setVehicles([])
            return
        }
        let cancelled = false
        setLoadingVehicles(true)
        void apiGetAvailableVehicles({
            from: new Date(windowStart).toISOString(),
            to: new Date(windowEnd).toISOString(),
        })
            .then((res) => {
                if (cancelled) return
                setVehicles(res.data)
                setVehicleId((current) =>
                    res.data.some((vehicle) => vehicle.id === current) ? current : null,
                )
            })
            .catch((err) => {
                if (cancelled) return
                setVehicles([])
                setError(getApiErrorMessage(err, 'Failed to load available vehicles'))
            })
            .finally(() => {
                if (!cancelled) setLoadingVehicles(false)
            })
        return () => {
            cancelled = true
        }
    }, [open, windowValid, windowStart, windowEnd])

    const vehicleOptions = vehicles.map((vehicle) => ({
        value: vehicle.id,
        label: `${vehicle.code} (${vehicle.plateNumber})`,
    }))
    const driverOptions = drivers
        .filter((driver) => driver.status === 'AVAILABLE')
        .map((driver) => ({
            value: driver.id,
            label: `${driver.firstName} ${driver.lastName}`,
        }))

    const submit = async () => {
        if (!vehicleId || !windowValid) return
        setSaving(true)
        setError(null)
        try {
            const trip = await apiCreateOcularTrip({
                vehicleId,
                driverId: driverId || undefined,
                windowStart: new Date(windowStart).toISOString(),
                windowEnd: new Date(windowEnd).toISOString(),
                notes: notes.trim() || undefined,
            })
            onCreated(trip.id)
            onClose()
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to create ocular trip'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog isOpen={open} width={560} onClose={onClose} onRequestClose={onClose}>
            <div className="flex flex-col gap-4">
                <div>
                    <h5 className="mb-1">New ocular trip</h5>
                    <p className="text-sm text-gray-500">
                        Plan a field run. Pick the time window first, then a vehicle that is
                        free for it. Add stops on the next screen.
                    </p>
                </div>

                {error ? (
                    <Alert showIcon type="danger">
                        {error}
                    </Alert>
                ) : null}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                        <p className="mb-1 text-xs font-semibold text-gray-500">Window start</p>
                        <Input
                            type="datetime-local"
                            value={windowStart}
                            onChange={(e) => setWindowStart(e.target.value)}
                        />
                    </div>
                    <div>
                        <p className="mb-1 text-xs font-semibold text-gray-500">Window end</p>
                        <Input
                            type="datetime-local"
                            value={windowEnd}
                            onChange={(e) => setWindowEnd(e.target.value)}
                        />
                    </div>
                </div>
                {!windowValid ? (
                    <p className="text-xs text-red-500">Window end must be after the start.</p>
                ) : null}

                <div>
                    <p className="mb-1 text-xs font-semibold text-gray-500">Vehicle</p>
                    <CrmSelect
                        options={vehicleOptions}
                        value={vehicleId}
                        onChange={setVehicleId}
                        isLoading={loadingVehicles}
                        isDisabled={!windowValid}
                        placeholder={
                            loadingVehicles
                                ? 'Checking availability…'
                                : vehicleOptions.length === 0
                                  ? 'No vehicle free for this window'
                                  : 'Select vehicle'
                        }
                    />
                </div>

                <div>
                    <p className="mb-1 text-xs font-semibold text-gray-500">Driver (optional)</p>
                    <CrmSelect
                        options={driverOptions}
                        value={driverId}
                        onChange={setDriverId}
                        isClearable
                        placeholder="No driver assigned"
                    />
                </div>

                <div>
                    <p className="mb-1 text-xs font-semibold text-gray-500">Notes (optional)</p>
                    <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                </div>

                <div className="flex justify-end gap-2">
                    <Button size="sm" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        size="sm"
                        variant="solid"
                        loading={saving}
                        disabled={!vehicleId || !windowValid}
                        onClick={() => void submit()}
                    >
                        Create trip
                    </Button>
                </div>
            </div>
        </Dialog>
    )
}
