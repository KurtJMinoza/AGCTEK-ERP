'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { HiOutlineArrowDown, HiOutlineArrowUp, HiOutlineTrash } from 'react-icons/hi'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Dialog from '@/components/ui/Dialog'
import Input from '@/components/ui/Input'
import Segment from '@/components/ui/Segment'
import Spinner from '@/components/ui/Spinner'
import StatusBadge from '@/components/shared/StatusBadge'
import CrmSelect from '@/modules/crm/components/CrmSelect'
import { apiCreateLead, apiGetLeads } from '@/modules/crm/services/crmApi'
import { CRM_PATHS, crmHref } from '@/modules/crm/utils/deepLinks'
import LocationSearchField from '../location/LocationSearchField'
import {
    apiAddOcularStop,
    apiGetTrip,
    apiRemoveOcularStop,
    apiReorderOcularStops,
    apiSetOcularStopStatus,
    apiUpdateTripStatus,
} from '../../services/scmApi'
import { getApiErrorMessage } from '../../utils/apiError'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type { Trip, TripStop } from '../../types'

type OcularTripStopsDialogProps = {
    tripId: string | null
    isOpen: boolean
    onClose: () => void
    onChanged?: () => void
    canEdit?: boolean
}

type StopDraft = {
    type: 'PICKUP' | 'DROPOFF'
    address: string
    lat: number | null
    lng: number | null
    name: string
    notes: string
    existingLeadId: string | null
}

type LeadDraft = { stopId: string; name: string; phone: string; email: string }
type OutcomeDraft = { stopId: string; action: 'COMPLETED' | 'SKIPPED'; notes: string }

const emptyStop: StopDraft = {
    type: 'DROPOFF',
    address: '',
    lat: null,
    lng: null,
    name: '',
    notes: '',
    existingLeadId: null,
}

/** Pickup point (stopType SHIP): done before the trip leaves; every other stop is a dropoff. */
const isPickup = (stop: TripStop) => stop.stopType === 'SHIP'

const TERMINAL_TRIP = new Set(['COMPLETED', 'CANCELLED'])
const TERMINAL_STOP = new Set(['COMPLETED', 'SKIPPED', 'FAILED'])

/**
 * Plan and run one OCULAR trip: stops in manual order, field progress per stop, and
 * "Create lead" from a stop (CRM stamps source = OCULAR). Rules live in SCM / CRM services.
 */
export default function OcularTripStopsDialog({
    tripId,
    isOpen,
    onClose,
    onChanged,
    canEdit = true,
}: OcularTripStopsDialogProps) {
    const [trip, setTrip] = useState<Trip | null>(null)
    const [loading, setLoading] = useState(false)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [draft, setDraft] = useState<StopDraft>(emptyStop)
    const [leadOptions, setLeadOptions] = useState<{ value: string; label: string }[]>([])
    const [leadDraft, setLeadDraft] = useState<LeadDraft | null>(null)
    const [outcome, setOutcome] = useState<OutcomeDraft | null>(null)

    const load = useCallback(async () => {
        if (!tripId) return
        setLoading(true)
        try {
            setTrip(await apiGetTrip(tripId))
            setError(null)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to load trip'))
        } finally {
            setLoading(false)
        }
    }, [tripId])

    useEffect(() => {
        if (!isOpen || !tripId) {
            setTrip(null)
            setError(null)
            setDraft(emptyStop)
            setLeadDraft(null)
            setOutcome(null)
            return
        }
        void load()
        void apiGetLeads({ page: 1, pageSize: 100 })
            .then((res) =>
                setLeadOptions(
                    res.data.map((lead) => ({ value: lead.id, label: lead.name })),
                ),
            )
            .catch(() => setLeadOptions([]))
    }, [isOpen, tripId, load])

    const stops = useMemo(
        () => [...(trip?.stops ?? [])].sort((a, b) => a.sequence - b.sequence),
        [trip],
    )
    const cancelledOrDone = !trip || TERMINAL_TRIP.has(trip.status)
    const planLocked = cancelledOrDone || !canEdit
    const started = trip?.status === 'IN_TRANSIT'
    const allTerminal = stops.length > 0 && stops.every((s) => TERMINAL_STOP.has(s.status))
    const openPickups = stops.filter((s) => isPickup(s) && s.status !== 'COMPLETED')
    const dropoffCount = stops.filter((s) => !isPickup(s)).length
    // Pickups can only be added while the trip is still being prepared.
    const addType: StopDraft['type'] = started ? 'DROPOFF' : draft.type

    const run = async (action: () => Promise<unknown>, fallback: string) => {
        setBusy(true)
        setError(null)
        try {
            await action()
            await load()
            onChanged?.()
        } catch (err) {
            setError(getApiErrorMessage(err, fallback))
        } finally {
            setBusy(false)
        }
    }

    const move = (index: number, delta: number) => {
        if (!trip) return
        const ids = stops.map((stop) => stop.id)
        const target = index + delta
        if (target < 0 || target >= ids.length) return
        ;[ids[index], ids[target]] = [ids[target], ids[index]]
        void run(() => apiReorderOcularStops(trip.id, ids), 'Failed to reorder stops')
    }

    const addStop = () =>
        run(async () => {
            await apiAddOcularStop(trip!.id, {
                address: draft.address.trim(),
                lat: draft.lat,
                lng: draft.lng,
                name: draft.name.trim() || undefined,
                notes: draft.notes.trim() || undefined,
                type: addType,
                existingLeadId:
                    addType === 'DROPOFF' ? draft.existingLeadId || undefined : undefined,
            })
            setDraft(emptyStop)
        }, 'Failed to add stop')

    const saveOutcome = () =>
        run(async () => {
            if (!outcome) return
            await apiSetOcularStopStatus(
                trip!.id,
                outcome.stopId,
                outcome.action,
                outcome.notes.trim() || undefined,
            )
            setOutcome(null)
        }, 'Failed to update stop')

    const createLead = () =>
        run(async () => {
            if (!leadDraft) return
            // CRM owns lead creation; the stop id makes it an OCULAR capture and SCM links it back.
            await apiCreateLead({
                name: leadDraft.name.trim(),
                phone: leadDraft.phone.trim() || undefined,
                email: leadDraft.email.trim() || undefined,
                originTripStopId: leadDraft.stopId,
            })
            setLeadDraft(null)
        }, 'Failed to create lead')

    const renderStopActions = (stop: TripStop) => {
        if (cancelledOrDone || !canEdit) return null
        const done = TERMINAL_STOP.has(stop.status)
        // Leads are captured at dropoff points (the visits), never at pickups.
        const canCapture =
            !isPickup(stop) &&
            stop.status !== 'SKIPPED' &&
            !stop.createdLeadId &&
            !stop.existingLeadId

        if (outcome?.stopId === stop.id) {
            return (
                <div className="mt-2 flex gap-2">
                    <Input
                        size="sm"
                        placeholder="Outcome notes (optional)"
                        value={outcome.notes}
                        onChange={(e) => setOutcome({ ...outcome, notes: e.target.value })}
                    />
                    <Button size="sm" variant="solid" loading={busy} onClick={() => void saveOutcome()}>
                        {outcome.action === 'SKIPPED' ? 'Skip stop' : 'Mark done'}
                    </Button>
                    <Button size="sm" onClick={() => setOutcome(null)}>
                        Cancel
                    </Button>
                </div>
            )
        }

        if (leadDraft?.stopId === stop.id) {
            return (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Input
                        size="sm"
                        placeholder="Prospect name *"
                        value={leadDraft.name}
                        onChange={(e) => setLeadDraft({ ...leadDraft, name: e.target.value })}
                    />
                    <Input
                        size="sm"
                        placeholder="Phone"
                        value={leadDraft.phone}
                        onChange={(e) => setLeadDraft({ ...leadDraft, phone: e.target.value })}
                    />
                    <Input
                        size="sm"
                        placeholder="Email"
                        value={leadDraft.email}
                        onChange={(e) => setLeadDraft({ ...leadDraft, email: e.target.value })}
                    />
                    <div className="flex gap-2 sm:col-span-3">
                        <Button
                            size="sm"
                            variant="solid"
                            loading={busy}
                            disabled={!leadDraft.name.trim()}
                            onClick={() => void createLead()}
                        >
                            Create lead (source: Ocular)
                        </Button>
                        <Button size="sm" onClick={() => setLeadDraft(null)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            )
        }

        return (
            <div className="mt-2 flex flex-wrap gap-2">
                {(started || isPickup(stop)) && stop.status === 'PENDING' ? (
                    <Button
                        size="xs"
                        disabled={busy}
                        onClick={() =>
                            void run(
                                () => apiSetOcularStopStatus(trip!.id, stop.id, 'ARRIVED'),
                                'Failed to mark arrival',
                            )
                        }
                    >
                        Arrived
                    </Button>
                ) : null}
                {(started || isPickup(stop)) && !done ? (
                    <>
                        <Button
                            size="xs"
                            disabled={busy}
                            onClick={() =>
                                setOutcome({ stopId: stop.id, action: 'COMPLETED', notes: '' })
                            }
                        >
                            Done
                        </Button>
                        {!isPickup(stop) ? (
                            <Button
                                size="xs"
                                disabled={busy}
                                onClick={() =>
                                    setOutcome({ stopId: stop.id, action: 'SKIPPED', notes: '' })
                                }
                            >
                                Skip
                            </Button>
                        ) : null}
                    </>
                ) : null}
                {canCapture ? (
                    <Button
                        size="xs"
                        variant="solid"
                        disabled={busy}
                        onClick={() =>
                            setLeadDraft({
                                stopId: stop.id,
                                name: stop.name ?? '',
                                phone: '',
                                email: '',
                            })
                        }
                    >
                        Create lead
                    </Button>
                ) : null}
            </div>
        )
    }

    return (
        <Dialog isOpen={isOpen} width={760} onClose={onClose} onRequestClose={onClose}>
            <div className="flex max-h-[80vh] flex-col gap-4 overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h5 className="mb-1">Ocular trip {trip?.code ?? ''}</h5>
                        <p className="text-sm text-gray-500">
                            {trip?.vehicle
                                ? `${trip.vehicle.code} (${trip.vehicle.plateNumber})`
                                : 'No vehicle'}
                            {trip?.driver
                                ? ` · ${trip.driver.firstName} ${trip.driver.lastName}`
                                : ''}
                            {trip?.plannedStartAt
                                ? ` · ${new Date(trip.plannedStartAt).toLocaleString()}`
                                : ''}
                        </p>
                    </div>
                    {trip ? (
                        <StatusBadge tone={statusTone(trip.status)}>
                            {formatStatusLabel(trip.status)}
                        </StatusBadge>
                    ) : null}
                </div>

                {error ? (
                    <Alert showIcon type="danger">
                        {error}
                    </Alert>
                ) : null}

                {loading && !trip ? (
                    <div className="flex justify-center py-8">
                        <Spinner />
                    </div>
                ) : (
                    <>
                        {stops.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No stops yet. Add pickup points (done before the trip leaves) and dropoff points (the places to visit), in visiting order.
                            </p>
                        ) : (
                            <ol className="flex flex-col gap-2">
                                {stops.map((stop, index) => {
                                    const done = TERMINAL_STOP.has(stop.status)
                                    return (
                                        <li
                                            key={stop.id}
                                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-600"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold">
                                                        {stop.sequence}. {stop.name ?? (isPickup(stop) ? 'Pickup point' : 'Ocular visit')}
                                                    </p>
                                                    <p className="truncate text-xs text-gray-500">
                                                        {stop.address}
                                                    </p>
                                                    {stop.notes ? (
                                                        <p className="text-xs text-gray-500">
                                                            {stop.notes}
                                                        </p>
                                                    ) : null}
                                                    {stop.createdLeadId ? (
                                                        <Link
                                                            className="text-xs text-primary hover:underline"
                                                            href={crmHref(CRM_PATHS.leads, {
                                                                source: 'OCULAR',
                                                            })}
                                                        >
                                                            Lead captured here (source: Ocular)
                                                        </Link>
                                                    ) : stop.existingLeadId ? (
                                                        <p className="text-xs text-gray-500">
                                                            Visit to an existing lead
                                                        </p>
                                                    ) : null}
                                                </div>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <StatusBadge tone={isPickup(stop) ? 'warning' : 'info'}>
                                                        {isPickup(stop) ? 'Pickup' : 'Dropoff'}
                                                    </StatusBadge>
                                                    <StatusBadge tone={statusTone(stop.status)}>
                                                        {formatStatusLabel(stop.status)}
                                                    </StatusBadge>
                                                    {!planLocked && !done ? (
                                                        <>
                                                            <Button
                                                                size="xs"
                                                                variant="plain"
                                                                icon={<HiOutlineArrowUp />}
                                                                aria-label="Move up"
                                                                disabled={
                                                                    busy ||
                                                                    index === 0 ||
                                                                    isPickup(stops[index - 1]) !== isPickup(stop)
                                                                }
                                                                onClick={() => move(index, -1)}
                                                            />
                                                            <Button
                                                                size="xs"
                                                                variant="plain"
                                                                icon={<HiOutlineArrowDown />}
                                                                aria-label="Move down"
                                                                disabled={
                                                                    busy ||
                                                                    index === stops.length - 1 ||
                                                                    isPickup(stops[index + 1]) !== isPickup(stop)
                                                                }
                                                                onClick={() => move(index, 1)}
                                                            />
                                                            {stop.status === 'PENDING' &&
                                                            !stop.createdLeadId ? (
                                                                <Button
                                                                    size="xs"
                                                                    variant="plain"
                                                                    icon={<HiOutlineTrash />}
                                                                    aria-label="Remove stop"
                                                                    disabled={busy}
                                                                    onClick={() =>
                                                                        void run(
                                                                            () =>
                                                                                apiRemoveOcularStop(
                                                                                    trip!.id,
                                                                                    stop.id,
                                                                                ),
                                                                            'Failed to remove stop',
                                                                        )
                                                                    }
                                                                />
                                                            ) : null}
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {renderStopActions(stop)}
                                        </li>
                                    )
                                })}
                            </ol>
                        )}

                        {!planLocked ? (
                            <div className="rounded-lg border border-dashed border-gray-300 p-3 dark:border-gray-600">
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold text-gray-500">
                                        {addType === 'PICKUP'
                                            ? 'Add pickup point (placed before the dropoffs)'
                                            : 'Add dropoff point (appended at the end)'}
                                    </p>
                                    {!started ? (
                                        <Segment
                                            size="sm"
                                            value={draft.type}
                                            onChange={(v) =>
                                                v && setDraft({ ...draft, type: v as StopDraft['type'] })
                                            }
                                        >
                                            <Segment.Item value="DROPOFF">Dropoff</Segment.Item>
                                            <Segment.Item value="PICKUP">Pickup</Segment.Item>
                                        </Segment>
                                    ) : null}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <LocationSearchField
                                        value={draft.address}
                                        placeholder={
                                            addType === 'PICKUP'
                                                ? 'Search the pickup address…'
                                                : 'Search the address to visit…'
                                        }
                                        onChange={(next) =>
                                            setDraft((current) => ({
                                                ...current,
                                                address: next.address,
                                                lat: next.lat ?? null,
                                                lng: next.lng ?? null,
                                            }))
                                        }
                                    />
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <Input
                                            size="sm"
                                            placeholder={
                                                addType === 'PICKUP'
                                                    ? 'Pickup name (optional)'
                                                    : 'Place / prospect name (optional)'
                                            }
                                            value={draft.name}
                                            onChange={(e) =>
                                                setDraft({ ...draft, name: e.target.value })
                                            }
                                        />
                                        <Input
                                            size="sm"
                                            placeholder="Notes (optional)"
                                            value={draft.notes}
                                            onChange={(e) =>
                                                setDraft({ ...draft, notes: e.target.value })
                                            }
                                        />
                                    </div>
                                    {addType === 'DROPOFF' ? (
                                        <CrmSelect
                                            options={leadOptions}
                                            value={draft.existingLeadId}
                                            onChange={(value) =>
                                                setDraft({ ...draft, existingLeadId: value })
                                            }
                                            isClearable
                                            placeholder="Visiting an existing lead? (optional)"
                                        />
                                    ) : null}
                                    {draft.address.trim() && draft.lat == null ? (
                                        <p className="text-xs text-amber-600">
                                            No map position for this address; the stop will not show
                                            on the live map.
                                        </p>
                                    ) : null}
                                    <div>
                                        <Button
                                            size="sm"
                                            disabled={!draft.address.trim() || busy}
                                            onClick={() => void addStop()}
                                        >
                                            {addType === 'PICKUP' ? 'Add pickup point' : 'Add dropoff point'}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </>
                )}

                {!planLocked && !started && openPickups.length > 0 ? (
                    <Alert showIcon type="warning">
                        Mark {openPickups.length} pickup point{openPickups.length > 1 ? 's' : ''} done
                        before the trip can start.
                    </Alert>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
                    <Link
                        className="text-sm text-primary hover:underline"
                        href={`/scm/tracking?purpose=OCULAR&tripId=${trip?.id ?? ''}`}
                    >
                        Open live tracking
                    </Link>
                    <div className="flex gap-2">
                        {!planLocked && !started ? (
                            <Button
                                size="sm"
                                variant="solid"
                                disabled={busy || dropoffCount === 0 || openPickups.length > 0}
                                title={
                                    openPickups.length > 0
                                        ? 'Mark every pickup point done first'
                                        : dropoffCount === 0
                                          ? 'Add at least one dropoff point'
                                          : undefined
                                }
                                onClick={() =>
                                    void run(
                                        () => apiUpdateTripStatus(trip!.id, 'IN_TRANSIT'),
                                        'Failed to start trip',
                                    )
                                }
                            >
                                Start trip
                            </Button>
                        ) : null}
                        {started && allTerminal ? (
                            <Button
                                size="sm"
                                variant="solid"
                                disabled={busy}
                                onClick={() =>
                                    void run(
                                        () => apiUpdateTripStatus(trip!.id, 'COMPLETED'),
                                        'Failed to complete trip',
                                    )
                                }
                            >
                                Complete trip
                            </Button>
                        ) : null}
                        {!planLocked ? (
                            <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                    void run(
                                        () => apiUpdateTripStatus(trip!.id, 'CANCELLED'),
                                        'Failed to cancel trip',
                                    )
                                }
                            >
                                Cancel trip
                            </Button>
                        ) : null}
                        <Button size="sm" onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </Dialog>
    )
}
