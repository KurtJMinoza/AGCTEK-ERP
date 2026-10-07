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
    LEAD_SOURCES,
    LEAD_STATUSES,
    type CreateLeadInput,
    type Lead,
    type LeadSource,
    type LeadStatus,
    type UpdateLeadInput,
} from '../types'

type LeadForm = {
    name: string
    email: string
    phone: string
    source: LeadSource
    status: LeadStatus
    customerId: string | null
    score: string
}

const toForm = (lead: Lead | null): LeadForm => ({
    name: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    source: lead?.source ?? 'OTHER',
    status: lead?.status ?? 'NEW',
    customerId: lead?.customerId ?? null,
    score: lead?.score == null ? '' : String(lead.score),
})

type LeadFormDialogProps = {
    isOpen: boolean
    lead: Lead | null
    onClose: () => void
    onCreate: (body: CreateLeadInput) => Promise<unknown>
    onUpdate: (id: string, body: UpdateLeadInput) => Promise<unknown>
}

export default function LeadFormDialog({
    isOpen,
    lead,
    onClose,
    onCreate,
    onUpdate,
}: LeadFormDialogProps) {
    const [form, setForm] = useState<LeadForm>(() => toForm(lead))
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const readOnly = lead?.status === 'CONVERTED'

    useEffect(() => {
        if (isOpen) {
            setForm(toForm(lead))
            setFormError(null)
        }
    }, [isOpen, lead])

    const onSubmit = async () => {
        setSaving(true)
        setFormError(null)
        const score = form.score.trim() === '' ? null : Number(form.score)
        try {
            if (lead) {
                await onUpdate(lead.id, {
                    name: form.name.trim(),
                    email: form.email.trim() || null,
                    phone: form.phone.trim() || null,
                    source: form.source,
                    status: form.status,
                    customerId: form.customerId,
                    score,
                })
            } else {
                await onCreate({
                    name: form.name.trim(),
                    email: form.email.trim() || undefined,
                    phone: form.phone.trim() || undefined,
                    source: form.source,
                    customerId: form.customerId ?? undefined,
                    score: score ?? undefined,
                })
            }
            onClose()
        } catch (err) {
            setFormError(
                getApiErrorMessage(err, lead ? 'Failed to update lead' : 'Failed to create lead'),
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
            title={lead ? 'Edit lead' : 'New lead'}
            description={
                readOnly
                    ? 'Converted leads are read-only.'
                    : 'Use Convert on the leads list to turn a lead into an opportunity.'
            }
            onSubmit={readOnly ? undefined : onSubmit}
            confirmText={lead ? 'Save' : 'Create'}
            confirmLoading={saving}
        >
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem label="Name" asterisk className="md:col-span-2">
                    <Input
                        value={form.name}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Email">
                    <Input
                        type="email"
                        value={form.email}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Phone">
                    <Input
                        value={form.phone}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Source">
                    <CrmSelect
                        options={enumOptions(LEAD_SOURCES)}
                        value={form.source}
                        isDisabled={readOnly}
                        onChange={(value) =>
                            setForm((f) => ({ ...f, source: (value ?? 'OTHER') as LeadSource }))
                        }
                    />
                </FormItem>
                <FormItem label="Score (0–100)">
                    <Input
                        type="number"
                        min={0}
                        max={100}
                        value={form.score}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                    />
                </FormItem>
                {lead ? (
                    <FormItem label="Status">
                        <CrmSelect
                            options={enumOptions(
                                readOnly
                                    ? LEAD_STATUSES
                                    : LEAD_STATUSES.filter((status) => status !== 'CONVERTED'),
                            )}
                            value={form.status}
                            isDisabled={readOnly}
                            onChange={(value) =>
                                setForm((f) => ({
                                    ...f,
                                    status: (value ?? f.status) as LeadStatus,
                                }))
                            }
                        />
                    </FormItem>
                ) : null}
                <FormItem label="Customer" className={lead ? '' : 'md:col-span-2'}>
                    <CustomerSelect
                        value={form.customerId}
                        isClearable
                        isDisabled={readOnly}
                        placeholder="Not linked"
                        onChange={(customerId) => setForm((f) => ({ ...f, customerId }))}
                    />
                </FormItem>
            </div>
        </FormDialog>
    )
}
