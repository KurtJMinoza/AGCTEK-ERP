'use client'

import { useCallback, useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    apiGetConsignment,
    apiUpdateConsignmentStatus,
} from '../../services/scmApi'
import { formatStatusLabel, statusTone } from '../../utils/status'
import { getApiErrorMessage } from '../../utils/apiError'
import type { CourierConsignment, CourierConsignmentStatus } from '../../types'

type Option = { value: CourierConsignmentStatus; label: string }

/** What each move means for stock / the order, shown before the dispatcher confirms. */
const STATUS_HINT: Partial<Record<CourierConsignmentStatus, string>> = {
    PICKED_UP:
        'Posts the goods issue — stock leaves the warehouse and the sales order becomes Shipped.',
    DELIVERED:
        'Marks the shipment delivered — the sales order is delivered and its invoice posts.',
    CANCELLED:
        'Releases the shipment back to Ready for our own fleet or another courier.',
    EXCEPTION: 'Puts the shipment on hold until the courier resolves it.',
    RETURNED:
        'The courier is bringing the parcel back. Receiving it into the warehouse is a separate MM step.',
}

const toLocalInput = (d: Date) => {
    const offset = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - offset).toISOString().slice(0, 16)
}

type Props = {
    consignmentId: string | null
    canUpdate: boolean
    onClose: () => void
    onChanged: () => void
}

export default function ConsignmentDetailDialog({
    consignmentId,
    canUpdate,
    onClose,
    onChanged,
}: Props) {
    const [detail, setDetail] = useState<CourierConsignment | null>(null)
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [nextStatus, setNextStatus] = useState<CourierConsignmentStatus | ''>('')
    const [occurredAt, setOccurredAt] = useState('')
    const [note, setNote] = useState('')
    const [podUrl, setPodUrl] = useState('')
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const load = useCallback(async () => {
        if (!consignmentId) return
        setLoading(true)
        setLoadError(null)
        try {
            const row = await apiGetConsignment(consignmentId)
            setDetail(row)
            setNextStatus(row.nextStatuses?.[0] ?? '')
            setOccurredAt(toLocalInput(new Date()))
            setNote('')
            setPodUrl('')
            setFormError(null)
        } catch (err) {
            setLoadError(getApiErrorMessage(err, 'Failed to load consignment'))
        } finally {
            setLoading(false)
        }
    }, [consignmentId])

    useEffect(() => {
        setDetail(null)
        void load()
    }, [load])

    const options: Option[] = (detail?.nextStatuses ?? []).map((s) => ({
        value: s,
        label: formatStatusLabel(s),
    }))

    const submit = async () => {
        if (!detail || !nextStatus) return
        setSaving(true)
        setFormError(null)
        try {
            await apiUpdateConsignmentStatus(detail.id, {
                status: nextStatus,
                occurredAt: occurredAt ? new Date(occurredAt).toISOString() : undefined,
                note: note.trim() || undefined,
                podUrl:
                    nextStatus === 'DELIVERED' && podUrl.trim()
                        ? podUrl.trim()
                        : undefined,
            })
            onChanged()
            await load()
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to update status'))
        } finally {
            setSaving(false)
        }
    }

    const final = detail ? (detail.nextStatuses ?? []).length === 0 : false

    return (
        <FormDialog
            isOpen={Boolean(consignmentId)}
            onClose={onClose}
            size="lg"
            title={
                detail
                    ? `${detail.carrier.name} · ${detail.trackingNumber ?? 'No tracking number'}`
                    : 'Consignment'
            }
            description={
                detail?.shipment
                    ? `${detail.shipment.reference} · ${detail.shipment.customerName || 'Customer'} · ${detail.shipment.destAddress}`
                    : undefined
            }
            footer={
                <div className="flex justify-end">
                    <Button onClick={onClose}>Close</Button>
                </div>
            }
        >
            {loadError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {loadError}
                </Alert>
            ) : null}
            {loading && !detail ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : null}

            {detail ? (
                <>
                    <div className="mb-5 flex flex-wrap items-center gap-2 text-sm">
                        <StatusBadge tone={statusTone(detail.status)}>
                            {formatStatusLabel(detail.status)}
                        </StatusBadge>
                        {detail.shipment ? (
                            <span className="text-gray-500">
                                Shipment: {formatStatusLabel(detail.shipment.status)}
                            </span>
                        ) : null}
                        {detail.trackingUrl ? (
                            <a
                                href={detail.trackingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                            >
                                Track on courier site
                            </a>
                        ) : null}
                        {detail.podUrl ? (
                            <a
                                href={detail.podUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary underline"
                            >
                                Proof of delivery
                            </a>
                        ) : null}
                    </div>

                    {canUpdate && !final ? (
                        <div className="mb-5 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                            <h6 className="mb-3">Update status</h6>
                            {formError ? (
                                <Alert showIcon type="danger" className="mb-3">
                                    {formError}
                                </Alert>
                            ) : null}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Select<Option>
                                    options={options}
                                    value={options.find((o) => o.value === nextStatus) ?? null}
                                    onChange={(option) =>
                                        setNextStatus(option?.value ?? '')
                                    }
                                />
                                <Input
                                    type="datetime-local"
                                    value={occurredAt}
                                    onChange={(e) => setOccurredAt(e.target.value)}
                                />
                                {nextStatus === 'DELIVERED' ? (
                                    <Input
                                        className="sm:col-span-2"
                                        placeholder="Proof of delivery URL from the courier (optional)"
                                        value={podUrl}
                                        onChange={(e) => setPodUrl(e.target.value)}
                                    />
                                ) : null}
                                <Input
                                    className="sm:col-span-2"
                                    textArea
                                    rows={2}
                                    placeholder="Note (optional)"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                />
                            </div>
                            {nextStatus && STATUS_HINT[nextStatus] ? (
                                <p className="mt-2 text-xs text-gray-500">
                                    {STATUS_HINT[nextStatus]}
                                </p>
                            ) : null}
                            <div className="mt-3 flex justify-end">
                                <Button
                                    variant="solid"
                                    loading={saving}
                                    disabled={!nextStatus}
                                    onClick={() => void submit()}
                                >
                                    Save status
                                </Button>
                            </div>
                        </div>
                    ) : null}

                    <h6 className="mb-2">History</h6>
                    {(detail.events ?? []).length === 0 ? (
                        <p className="text-sm text-gray-500">No events yet.</p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {(detail.events ?? []).map((event) => (
                                <li
                                    key={event.id}
                                    className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <StatusBadge tone={statusTone(event.status)}>
                                                {formatStatusLabel(event.status)}
                                            </StatusBadge>
                                            <span className="text-xs text-gray-500">
                                                {formatStatusLabel(event.source)}
                                            </span>
                                        </div>
                                        {event.note ? (
                                            <p className="mt-1 text-gray-600 dark:text-gray-300">
                                                {event.note}
                                            </p>
                                        ) : null}
                                    </div>
                                    <span className="shrink-0 text-xs text-gray-500">
                                        {new Date(event.occurredAt).toLocaleString()}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            ) : null}
        </FormDialog>
    )
}
