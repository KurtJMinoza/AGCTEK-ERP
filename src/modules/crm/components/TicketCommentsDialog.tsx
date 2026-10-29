'use client'

import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import FormDialog from '@/components/shared/FormDialog'
import StatusBadge from '@/components/shared/StatusBadge'
import { useTicketComments } from '../hooks/useTickets'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { crmTone, formatEnumLabel } from '../utils/format'
import usePermissions from '@/utils/hooks/usePermissions'
import AttachmentsPanel from './AttachmentsPanel'
import AuditTrail from './AuditTrail'
import TicketReturnPanel from './TicketReturnPanel'
import { apiGetAuditTrail } from '../services/crmApi'
import type { Ticket, TicketComment, TicketStatus } from '../types'

const authorName = (comment: TicketComment) => {
    if (!comment.author) return 'Unknown user'
    const name = `${comment.author.firstName} ${comment.author.lastName}`.trim()
    return name || comment.author.userName
}

type TicketCommentsDialogProps = {
    ticket: Ticket | null
    canComment: boolean
    /** crm.tickets update: approve / reject the linked customer return. */
    canDecideReturn?: boolean
    onClose: () => void
    /** Called after a comment is added so callers can refresh comment counts. */
    onCommented?: () => void
}

export default function TicketCommentsDialog({
    ticket,
    canComment,
    canDecideReturn = false,
    onClose,
    onCommented,
}: TicketCommentsDialogProps) {
    const { comments, loading, error, reload, add } = useTicketComments(ticket?.id ?? null)
    const [body, setBody] = useState('')
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    /** Status set by a return-case override while the dialog is open (the caller's row is a snapshot). */
    const [changed, setChanged] = useState<{ ticketId: string; status: TicketStatus } | null>(null)
    const status = ticket && changed?.ticketId === ticket.id ? changed.status : ticket?.status
    const closed = status === 'CLOSED' || status === 'CANCELLED'
    const { can } = usePermissions()
    const canRemoveAttachments = can('crm.tickets', 'delete')
    const [auditRefresh, setAuditRefresh] = useState(0)

    const submit = async () => {
        if (!body.trim()) return
        setSaving(true)
        setFormError(null)
        try {
            await add(body.trim())
            setBody('')
            onCommented?.()
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to add comment'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={Boolean(ticket)}
            onClose={onClose}
            size="lg"
            title={ticket?.subject ?? 'Ticket'}
            description={ticket ? `${ticket.customer.companyName} · ${ticket.customer.customerNumber}` : undefined}
            headerExtra={
                ticket ? (
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={crmTone(status ?? ticket.status)}>
                            {formatEnumLabel(status ?? ticket.status)}
                        </StatusBadge>
                        <StatusBadge tone={crmTone(ticket.priority)}>
                            {formatEnumLabel(ticket.priority)}
                        </StatusBadge>
                        <StatusBadge>{formatEnumLabel(ticket.category)}</StatusBadge>
                    </div>
                ) : null
            }
            footer={<Button onClick={onClose}>Close</Button>}
        >
            {ticket?.sdReturnRequestId ? (
                <TicketReturnPanel
                    key={ticket.id}
                    ticketId={ticket.id}
                    ticketStatus={ticket.status}
                    canDecide={canDecideReturn}
                    readOnly={closed}
                    onStatusChanged={(next) => setChanged({ ticketId: ticket.id, status: next })}
                    onDecided={() => {
                        setAuditRefresh((n) => n + 1)
                        void reload()
                        onCommented?.()
                    }}
                />
            ) : null}
            {ticket?.description ? (
                <p className="mb-4 whitespace-pre-wrap text-sm">{ticket.description}</p>
            ) : null}
            {ticket ? (
                <>
                    <h6 className="mb-2">Attachments</h6>
                    <div className="mb-4">
                        <AttachmentsPanel
                            key={ticket.id}
                            parent={{ kind: 'ticket', id: ticket.id }}
                            canUpload={canComment}
                            canRemove={canRemoveAttachments}
                            readOnly={closed}
                            onChanged={() => setAuditRefresh((n) => n + 1)}
                        />
                    </div>
                    <h6 className="mb-2">History</h6>
                    <div className="mb-4">
                        <AuditTrail
                            sourceKey={`ticket:${ticket.id}`}
                            refreshToken={auditRefresh}
                            load={() => apiGetAuditTrail({ kind: 'ticket', id: ticket.id })}
                        />
                    </div>
                </>
            ) : null}
            {error ? (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            ) : null}
            <h6 className="mb-2">Comments</h6>
            {loading && comments.length === 0 ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : comments.length === 0 ? (
                <p className="text-sm text-gray-500">No comments yet.</p>
            ) : (
                <ul className="mb-4 flex flex-col gap-3">
                    {comments.map((comment) => (
                        <li
                            key={comment.id}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                            <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500">
                                <span className="font-medium">{authorName(comment)}</span>
                                <span>{new Date(comment.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                        </li>
                    ))}
                </ul>
            )}
            {canComment && !closed ? (
                <div className="mt-4">
                    {formError ? (
                        <Alert showIcon type="danger" className="mb-2">
                            {formError}
                        </Alert>
                    ) : null}
                    <Input
                        textArea
                        rows={3}
                        maxLength={4000}
                        placeholder="Add a comment…"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                        <Button
                            variant="solid"
                            size="sm"
                            loading={saving}
                            disabled={!body.trim()}
                            onClick={() => void submit()}
                        >
                            Add comment
                        </Button>
                    </div>
                </div>
            ) : closed ? (
                <p className="mt-4 text-xs text-gray-500">
                    Comments are disabled on closed or cancelled tickets.
                </p>
            ) : null}
        </FormDialog>
    )
}
