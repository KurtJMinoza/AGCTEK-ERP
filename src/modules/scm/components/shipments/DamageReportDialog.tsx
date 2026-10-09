'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import {
    apiCancelDamageReport,
    apiCreateShipmentDamageReport,
    apiGetShipment,
    apiGetShipmentDamageReports,
    apiInitiateSalesReturn,
} from '../../services/scmApi'
import { formatStatusLabel, statusTone } from '../../utils/status'
import type {
    CreateDamageReportInput,
    DamageReport,
    InitiateSalesReturnResult,
    Shipment,
    ShipmentLine,
} from '../../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

const REPORTABLE = new Set(['DELIVERED', 'EXCEPTION_HOLD'])

type LineOption = { value: string; label: string }

type DamageReportDialogProps = {
    shipment: Shipment | null
    canCreate: boolean
    onClose: () => void
}

/**
 * Report damage against a delivered shipment. The report is appended to the delivery history —
 * the shipment itself is never rewritten. Sale-order resolution happens server-side through the
 * verified package → picking task → reservation chain; UNRESOLVED reports are stored but excluded
 * from the automated SD handoff (Phase 3).
 */
export default function DamageReportDialog({
    shipment,
    canCreate,
    onClose,
}: DamageReportDialogProps) {
    const shipmentId = shipment?.id ?? null
    const reportable = shipment ? REPORTABLE.has(shipment.status) : false

    const [lines, setLines] = useState<ShipmentLine[]>([])
    const [reports, setReports] = useState<DamageReport[]>([])
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [lineId, setLineId] = useState('')
    const [quantity, setQuantity] = useState('')
    const [description, setDescription] = useState('')
    const [photoUrls, setPhotoUrls] = useState('')
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [initiatingId, setInitiatingId] = useState<string | null>(null)
    const [handoffInfo, setHandoffInfo] =
        useState<InitiateSalesReturnResult | null>(null)

    const reload = useCallback(async () => {
        if (!shipmentId) return
        setLoading(true)
        setLoadError(null)
        try {
            const [detail, page] = await Promise.all([
                apiGetShipment(shipmentId),
                apiGetShipmentDamageReports(shipmentId, { pageSize: 50 }),
            ])
            setLines(detail.lines ?? [])
            setReports(page.data)
        } catch (err) {
            setLoadError(
                getApiErrorMessage(
                    err,
                    'Unable to load shipment damage records',
                ),
            )
        } finally {
            setLoading(false)
        }
    }, [shipmentId])

    useEffect(() => {
        setLines([])
        setReports([])
        setLineId('')
        setQuantity('')
        setDescription('')
        setPhotoUrls('')
        setFormError(null)
        setHandoffInfo(null)
        void reload()
    }, [reload])

    const options: LineOption[] = [
        { value: '', label: 'Whole shipment' },
        ...lines.map((line) => ({
            value: line.id,
            label: `#${line.lineNo} ${line.materialCode ?? line.description ?? 'item'} (qty ${line.quantity})`,
        })),
    ]

    const submit = async () => {
        if (!shipmentId) return
        const damagedQuantity = Number(quantity)
        if (
            !Number.isInteger(damagedQuantity) ||
            damagedQuantity < 1 ||
            !description.trim()
        ) {
            setFormError(
                'A whole damaged quantity and a description are required',
            )
            return
        }
        const body: CreateDamageReportInput = {
            shipmentLineId: lineId || null,
            damagedQuantity,
            description: description.trim(),
            photoUrls: photoUrls
                .split(/\s*[,;\n]\s*/)
                .map((url) => url.trim())
                .filter(Boolean),
            idempotencyKey: `damage:${shipmentId}:${Date.now()}`,
        }
        setSaving(true)
        setFormError(null)
        try {
            await apiCreateShipmentDamageReport(shipmentId, body)
            setQuantity('')
            setDescription('')
            setPhotoUrls('')
            await reload()
        } catch (err) {
            setFormError(
                getApiErrorMessage(err, 'Failed to save the damage report'),
            )
        } finally {
            setSaving(false)
        }
    }

    const cancel = async (reportId: string) => {
        if (!shipmentId) return
        setBusyId(reportId)
        setFormError(null)
        try {
            await apiCancelDamageReport(shipmentId, reportId)
            await reload()
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to cancel the report'))
        } finally {
            setBusyId(null)
        }
    }

    const startReturn = async (report: DamageReport) => {
        if (!shipmentId) return
        setInitiatingId(report.id)
        setFormError(null)
        setHandoffInfo(null)
        try {
            const result = await apiInitiateSalesReturn(shipmentId, report.id)
            setHandoffInfo(result)
            await reload()
        } catch (err) {
            setFormError(
                getApiErrorMessage(
                    err,
                    'Failed to initiate the SD sales return',
                ),
            )
        } finally {
            setInitiatingId(null)
        }
    }

    return (
        <FormDialog
            isOpen={Boolean(shipment)}
            onClose={onClose}
            size="lg"
            title={`Report damage — ${shipment?.reference ?? ''}`}
            description={
                shipment
                    ? `${shipment.customerName || 'Customer'} · ${formatStatusLabel(shipment.status)}`
                    : undefined
            }
            confirmText="Save report"
            confirmLoading={saving}
            onSubmit={() => void submit()}
        >
            {loadError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {loadError}
                </Alert>
            ) : null}
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}

            {canCreate && reportable ? (
                <div className="mb-5 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <h6 className="mb-3">Record damage</h6>
                    <div className="flex flex-col gap-3">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500">
                                Affected item
                            </label>
                            <Select
                                options={options}
                                value={
                                    options.find((o) => o.value === lineId) ??
                                    options[0]
                                }
                                onChange={(option) =>
                                    setLineId(
                                        (option as LineOption | null)?.value ??
                                            '',
                                    )
                                }
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Input
                                type="number"
                                min={1}
                                placeholder="Damaged quantity"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                            <Input
                                placeholder="Photo URLs (optional, one per line)"
                                value={photoUrls}
                                onChange={(e) => setPhotoUrls(e.target.value)}
                            />
                        </div>
                        <Input
                            textArea
                            rows={3}
                            placeholder="Describe the damage…"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>
                </div>
            ) : shipment && !reportable ? (
                <Alert showIcon type="warning" className="mb-4">
                    Damage can only be reported for DELIVERED or EXCEPTION_HOLD
                    shipments.
                </Alert>
            ) : null}

            <h6 className="mb-2">Existing reports</h6>
            {loading && reports.length === 0 ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : reports.length === 0 ? (
                <p className="text-sm text-gray-500">No damage reports yet.</p>
            ) : (
                <ul className="flex flex-col gap-2">
                    {reports.map((report) => (
                        <li
                            key={report.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700"
                        >
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">
                                        {report.reference}
                                    </span>
                                    <StatusBadge
                                        tone={statusTone(report.status)}
                                    >
                                        {formatStatusLabel(report.status)}
                                    </StatusBadge>
                                    <StatusBadge
                                        tone={
                                            report.salesOrderStatus ===
                                            'RESOLVED'
                                                ? 'success'
                                                : 'warning'
                                        }
                                    >
                                        {report.salesOrderStatus === 'RESOLVED'
                                            ? 'Order resolved'
                                            : 'No linked order'}
                                    </StatusBadge>
                                    {report.status === 'RETURN_CREATED' ? (
                                        <StatusBadge tone="success">
                                            Return{' '}
                                            {report.sdSalesReturnId
                                                ? 'created'
                                                : 'requested'}
                                        </StatusBadge>
                                    ) : null}
                                </div>
                                <p className="mt-1 text-gray-500">
                                    {report.damagedQuantity} item
                                    {report.damagedQuantity === 1
                                        ? ''
                                        : 's'} · {report.description} ·{' '}
                                    {new Date(
                                        report.reportedAt,
                                    ).toLocaleString()}
                                </p>
                                {report.sdSalesReturnId ? (
                                    <Link
                                        href={`/modules/sd/sales-returns?returnId=${report.sdSalesReturnId}`}
                                        className="mt-1 inline-block text-xs text-primary hover:underline"
                                    >
                                        View sales return
                                    </Link>
                                ) : null}
                            </div>
                            {report.status === 'SUBMITTED' &&
                            report.salesOrderStatus === 'RESOLVED' &&
                            canCreate ? (
                                <div className="flex shrink-0 flex-col gap-2">
                                    <Button
                                        size="xs"
                                        variant="solid"
                                        loading={initiatingId === report.id}
                                        disabled={
                                            Boolean(initiatingId) ||
                                            Boolean(busyId)
                                        }
                                        onClick={() => void startReturn(report)}
                                    >
                                        Start return
                                    </Button>
                                    <Button
                                        size="xs"
                                        loading={busyId === report.id}
                                        disabled={Boolean(initiatingId)}
                                        onClick={() => void cancel(report.id)}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            ) : report.status === 'SUBMITTED' && canCreate ? (
                                <Button
                                    size="xs"
                                    loading={busyId === report.id}
                                    disabled={Boolean(busyId)}
                                    onClick={() => void cancel(report.id)}
                                >
                                    Cancel
                                </Button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}

            {handoffInfo ? (
                <Alert showIcon type="success" className="mt-4">
                    {handoffInfo.created
                        ? `Sales return ${handoffInfo.salesReturn.returnNumber} created — it is REQUESTED until authorized in SD.`
                        : `Already created ${handoffInfo.salesReturn.returnNumber} for this report.`}
                </Alert>
            ) : null}
        </FormDialog>
    )
}
