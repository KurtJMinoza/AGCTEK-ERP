'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import CrmSelect from './CrmSelect'
import CustomerSelect from './CustomerSelect'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { enumOptions } from '../utils/format'
import {
    TICKET_CATEGORIES,
    TICKET_PRIORITIES,
    TICKET_STATUSES,
    type CreateTicketInput,
    type Ticket,
    type TicketCategory,
    type TicketPriority,
    type TicketStatus,
    type UpdateTicketInput,
} from '../types'

type TicketForm = {
    customerId: string | null
    subject: string
    description: string
    status: TicketStatus
    priority: TicketPriority
    category: TicketCategory
    rmaReference: string
}

const toForm = (ticket: Ticket | null, customerId?: string): TicketForm => ({
    customerId: ticket?.customerId ?? customerId ?? null,
    subject: ticket?.subject ?? '',
    description: ticket?.description ?? '',
    status: ticket?.status ?? 'OPEN',
    priority: ticket?.priority ?? 'MEDIUM',
    category: ticket?.category ?? 'GENERAL',
    rmaReference: ticket?.rmaReference ?? '',
})

export const isTerminalTicket = (ticket: Ticket | null) =>
    ticket?.status === 'CLOSED' || ticket?.status === 'CANCELLED'

type TicketFormDialogProps = {
    isOpen: boolean
    ticket: Ticket | null
    /** Pre-selects and locks the customer (Customer 360). */
    customerId?: string
    onClose: () => void
    onCreate: (body: CreateTicketInput) => Promise<unknown>
    onUpdate: (id: string, body: UpdateTicketInput) => Promise<unknown>
}

export default function TicketFormDialog({
    isOpen,
    ticket,
    customerId,
    onClose,
    onCreate,
    onUpdate,
}: TicketFormDialogProps) {
    const [form, setForm] = useState<TicketForm>(() => toForm(ticket, customerId))
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const readOnly = isTerminalTicket(ticket)

    useEffect(() => {
        if (isOpen) {
            setForm(toForm(ticket, customerId))
            setFormError(null)
        }
    }, [isOpen, ticket, customerId])

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        try {
            if (ticket) {
                await onUpdate(ticket.id, {
                    subject: form.subject.trim(),
                    description: form.description.trim() || null,
                    status: form.status,
                    priority: form.priority,
                    category: form.category,
                    rmaReference: form.rmaReference.trim() || null,
                })
            } else {
                if (!form.customerId) {
                    setFormError('Select a customer')
                    return
                }
                await onCreate({
                    customerId: form.customerId,
                    subject: form.subject.trim(),
                    description: form.description.trim() || undefined,
                    priority: form.priority,
                    category: form.category,
                    rmaReference: form.rmaReference.trim() || undefined,
                })
            }
            onClose()
        } catch (err) {
            setFormError(
                getApiErrorMessage(err, ticket ? 'Failed to update ticket' : 'Failed to create ticket'),
            )
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={ticket ? 'Edit ticket' : 'New ticket'}
            description={readOnly ? 'Closed and cancelled tickets are read-only.' : undefined}
            onSubmit={readOnly ? undefined : onSubmit}
            confirmText={ticket ? 'Save' : 'Create'}
            confirmLoading={saving}
        >
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem label="Customer" asterisk className="md:col-span-2">
                    <CustomerSelect
                        value={form.customerId}
                        isDisabled={Boolean(ticket) || Boolean(customerId)}
                        onChange={(id) => setForm((f) => ({ ...f, customerId: id }))}
                    />
                </FormItem>
                <FormItem label="Subject" asterisk className="md:col-span-2">
                    <Input
                        value={form.subject}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Priority">
                    <CrmSelect
                        options={enumOptions(TICKET_PRIORITIES)}
                        value={form.priority}
                        isDisabled={readOnly}
                        onChange={(value) =>
                            setForm((f) => ({
                                ...f,
                                priority: (value ?? f.priority) as TicketPriority,
                            }))
                        }
                    />
                </FormItem>
                <FormItem label="Category">
                    <CrmSelect
                        options={enumOptions(TICKET_CATEGORIES)}
                        value={form.category}
                        isDisabled={readOnly}
                        onChange={(value) =>
                            setForm((f) => ({
                                ...f,
                                category: (value ?? f.category) as TicketCategory,
                            }))
                        }
                    />
                </FormItem>
                {ticket ? (
                    <FormItem label="Status">
                        <CrmSelect
                            options={enumOptions(TICKET_STATUSES)}
                            value={form.status}
                            isDisabled={readOnly}
                            onChange={(value) =>
                                setForm((f) => ({
                                    ...f,
                                    status: (value ?? f.status) as TicketStatus,
                                }))
                            }
                        />
                    </FormItem>
                ) : null}
                <FormItem label="RMA reference" className={ticket ? '' : 'md:col-span-2'}>
                    <Input
                        value={form.rmaReference}
                        disabled={readOnly}
                        placeholder="Optional, free text"
                        onChange={(e) => setForm((f) => ({ ...f, rmaReference: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Description" className="md:col-span-2">
                    <Input
                        textArea
                        rows={4}
                        value={form.description}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                </FormItem>
            </div>
        </FormDialog>
    )
}
