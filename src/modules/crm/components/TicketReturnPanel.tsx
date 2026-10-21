'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import {
    REFUND_STATUS_LABEL,
    RESOLUTION_LABEL,
    RESOLUTION_TONE,
    RETURN_STATUS_TONE,
} from '@/modules/sd/services/customerReturnRequestService'
import {
    apiApproveTicketReturn,
    apiGetTicketReturn,
    apiRejectTicketReturn,
} from '../services/crmApi'
import { formatDate, formatEnumLabel } from '../utils/format'
import type { TicketReturnCase } from '../types'

const SD_CUSTOMER_RETURNS_PATH = '/modules/sd/customer-returns'
const DECIDABLE_RESOLUTIONS: ReadonlySet<string> = new Set(['REPLACEMENT', 'REFUND'])
const RECEIVED_OR_LATER: ReadonlySet<string> = new Set([
    'RECEIVED',
    'UNDER_INSPECTION',
    'RESTOCKED',
    'MARKED_DAMAGED',
    'SCRAPPED',
    'REFUNDED',
    'CLOSED',
])

type Step = { label: string; done: boolean; detail: string }

/** Progress as SD / MM / finance report it; CRM only reads it. */
function progressSteps(rc: TicketReturnCase): Step[] {
    const approved = rc.approvedAt !== null
    const steps: Step[] = [
        { label: 'Requested', done: true, detail: `${formatDate(rc.createdAt)} by the customer` },
        {
            label: 'Approved',
            done: approved,
            detail: approved ? formatDate(rc.approvedAt) : 'Waiting for the agent',
        },
        {
            label: 'Inbound package (MM)',
            done: RECEIVED_OR_LATER.has(rc.status),
            detail: rc.mmCustomerReturn
                ? `${rc.mmCustomerReturn.returnNumber} · ${formatEnumLabel(rc.mmCustomerReturn.status)}`
                : 'Opens on approval',
        },
    ]
    if (rc.preferredResolution === 'REPLACEMENT') {
        steps.push({
            label: 'Replacement order (SD)',
            done: rc.replacementOrder !== null,
            detail: rc.replacementOrder
                ? `${rc.replacementOrder.orderNumber} · ${formatEnumLabel(rc.replacementOrder.status ?? 'DRAFT')} · no charge`
                : 'Opens on approval',
        })
    } else if (rc.preferredResolution === 'REFUND') {
        steps.push({
            label: 'Refund (finance)',
            done: rc.refundStatus === 'PAID',
            detail: `${REFUND_STATUS_LABEL[rc.refundStatus] ?? formatEnumLabel(rc.refundStatus)} · recorded in SD after inspection, paid by finance`,
        })
    }
    return steps
}

type TicketReturnPanelProps = {
    ticketId: string
    /** crm.tickets update (re-checked by the server). */
    canDecide: boolean
    /** The ticket is closed or cancelled. */
    readOnly: boolean
    /** After approve / reject (the server adds a ticket comment). */
    onDecided: () => void
}

/** SD customer return behind a CRM case: the agent decides it here; SD, MM and finance carry it out. */
export default function TicketReturnPanel({ ticketId, canDecide, readOnly, onDecided }: TicketReturnPanelProps) {
    const [rc, setRc] = useState<TicketReturnCase | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [saving, setSaving] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setRc(await apiGetTicketReturn(ticketId))
        } catch (err) {
            setError(getApiErrorMessage(err, 'Unable to load the customer return from SD'))
        } finally {
            setLoading(false)
        }
    }, [ticketId])

    useEffect(() => {
        void load()
    }, [load])

    const decide = async (run: () => Promise<TicketReturnCase>, fallback: string) => {
        setSaving(true)
        setError(null)
        try {
            setRc(await run())
            setDialog(null)
            setRejectReason('')
            onDecided()
        } catch (err) {
            setDialog(null)
            setError(getApiErrorMessage(err, fallback))
            void load()
        } finally {
            setSaving(false)
        }
    }

    if (!rc) {
        return (
            <div className="mb-4 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
                {error ? (
                    <Alert showIcon type="warning">
                        {error}
                    </Alert>
                ) : (
                    <span className="text-gray-500">{loading ? 'Loading customer return…' : null}</span>
                )}
            </div>
        )
    }

    const resolution = rc.preferredResolution ?? ''
    const isReplacement = resolution === 'REPLACEMENT'
    const pending = rc.status === 'REQUESTED' && !readOnly
    const canApprove = pending && canDecide && DECIDABLE_RESOLUTIONS.has(resolution)
    const canReject = pending && canDecide

    return (
        <div className="mb-4 rounded-lg border border-gray-200 p-3 text-sm dark:border-gray-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Customer return {rc.requestNumber}</span>
                <StatusBadge tone={RETURN_STATUS_TONE[rc.status] ?? 'default'}>
                    {formatEnumLabel(rc.status)}
                </StatusBadge>
                {resolution in RESOLUTION_LABEL ? (
                    <StatusBadge tone={RESOLUTION_TONE[resolution] ?? 'default'}>
                        {RESOLUTION_LABEL[resolution]}
                    </StatusBadge>
                ) : null}
                <span className="text-gray-500">
                    Order {rc.salesOrder.orderNumber}
                    {rc.reason ? ` · ${formatEnumLabel(rc.reason)}` : ''}
                </span>
            </div>

            <ul className="mt-2 list-disc pl-5 text-gray-600 dark:text-gray-300">
                {rc.lines.map((line) => (
                    <li key={line.id}>
                        {line.name ?? line.sku ?? 'Item'}
                        {line.sku && line.name ? ` (${line.sku})` : ''} × {line.quantity}
                    </li>
                ))}
            </ul>
            {rc.conditionNote ? (
                <p className="mt-1 text-xs text-gray-500">Customer note: {rc.conditionNote}</p>
            ) : null}

            {error ? (
                <Alert showIcon type="danger" className="mt-3">
                    {error}
                </Alert>
            ) : null}

            {rc.status === 'REJECTED' ? (
                <Alert showIcon type="warning" className="mt-3">
                    Rejected {formatDate(rc.rejectedAt)}
                    {rc.rejectReason ? `: ${rc.rejectReason}` : ''}
                </Alert>
            ) : (
                <ol className="mt-3 flex flex-col gap-1">
                    {progressSteps(rc).map((step) => (
                        <li key={step.label} className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={step.done ? 'success' : 'default'} className="shrink-0">
                                {step.done ? 'Done' : 'Pending'}
                            </StatusBadge>
                            <span className="font-medium">{step.label}</span>
                            <span className="text-gray-500">· {step.detail}</span>
                        </li>
                    ))}
                </ol>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {canApprove ? (
                    <Button size="sm" variant="solid" onClick={() => setDialog('approve')}>
                        {isReplacement ? 'Approve replacement' : 'Approve refund return'}
                    </Button>
                ) : null}
                {canReject ? (
                    <Button size="sm" onClick={() => setDialog('reject')}>
                        Reject return
                    </Button>
                ) : null}
                <Button size="sm" loading={loading} onClick={() => void load()}>
                    Refresh status
                </Button>
                <Link className="text-primary underline" href={SD_CUSTOMER_RETURNS_PATH}>
                    Open SD Customer Returns
                </Link>
            </div>
            {pending && !canDecide ? (
                <p className="mt-2 text-xs text-gray-500">Deciding the return needs ticket update rights.</p>
            ) : null}

            <ConfirmDialog
                isOpen={dialog === 'approve'}
                type="info"
                title={`Approve ${isReplacement ? 'replacement' : 'refund return'} for ${rc.requestNumber}?`}
                confirmText={isReplacement ? 'Approve replacement' : 'Approve refund return'}
                confirmButtonProps={{ loading: saving }}
                onClose={() => setDialog(null)}
                onCancel={() => setDialog(null)}
                onConfirm={() =>
                    void decide(() => apiApproveTicketReturn(ticketId), 'SD could not approve the return')
                }
            >
                {isReplacement
                    ? `MM opens a customer return that expects the inbound package, and SD opens a no-charge replacement order for ${rc.salesOrder.orderNumber} that goes to picking.`
                    : 'MM opens a customer return that expects the inbound package. After inspection the refund is recorded in SD and paid by finance; nothing is paid from CRM.'}
            </ConfirmDialog>

            <ConfirmDialog
                isOpen={dialog === 'reject'}
                type="warning"
                title={`Reject return ${rc.requestNumber}?`}
                confirmText="Reject return"
                confirmButtonProps={{ loading: saving, disabled: !rejectReason.trim() }}
                onClose={() => setDialog(null)}
                onCancel={() => setDialog(null)}
                onConfirm={() =>
                    void decide(
                        () => apiRejectTicketReturn(ticketId, rejectReason.trim()),
                        'SD could not reject the return',
                    )
                }
            >
                <p className="mb-2">The customer keeps the items; no MM intake or replacement is opened.</p>
                <Input
                    textArea
                    rows={3}
                    maxLength={500}
                    placeholder="Reason (required, recorded on the return and the ticket)"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                />
            </ConfirmDialog>
        </div>
    )
}
