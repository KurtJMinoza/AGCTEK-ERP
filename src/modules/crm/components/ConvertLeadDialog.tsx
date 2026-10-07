'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import CrmSelect from './CrmSelect'
import CustomerSelect from './CustomerSelect'
import { requirementHint } from './OpportunityFormDialog'
import { useOpportunityStages } from '../hooks/useOpportunityPipeline'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { enumOptions } from '../utils/format'
import {
    OPPORTUNITY_OPEN_STAGES,
    type ConvertLeadInput,
    type ConvertLeadResult,
    type Lead,
} from '../types'

type OpenStage = (typeof OPPORTUNITY_OPEN_STAGES)[number]
type CustomerMode = 'existing' | 'new'

type ConvertForm = {
    mode: CustomerMode
    customerId: string | null
    companyName: string
    contactName: string
    email: string
    phone: string
    opportunityName: string
    amount: string
    currency: string
    stage: OpenStage
    expectedCloseDate: string
}

const toForm = (lead: Lead | null): ConvertForm => ({
    mode: 'existing',
    customerId: lead?.customerId ?? null,
    companyName: '',
    contactName: lead?.name ?? '',
    email: lead?.email ?? '',
    phone: lead?.phone ?? '',
    opportunityName: lead?.name ?? '',
    amount: '',
    currency: 'PHP',
    stage: 'PROSPECTING',
    expectedCloseDate: '',
})

type ConvertLeadDialogProps = {
    lead: Lead | null
    /** sd:create — creating an SD customer from CRM needs SD permission too (checked server-side). */
    canCreateCustomer: boolean
    onClose: () => void
    onConvert: (id: string, body: ConvertLeadInput) => Promise<ConvertLeadResult>
    onConverted: (result: ConvertLeadResult) => void
}

export default function ConvertLeadDialog({
    lead,
    canCreateCustomer,
    onClose,
    onConvert,
    onConverted,
}: ConvertLeadDialogProps) {
    const { meta } = useOpportunityStages()
    const [form, setForm] = useState<ConvertForm>(() => toForm(lead))
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const linked = Boolean(lead?.customerId)
    const stageMeta = meta(form.stage)

    useEffect(() => {
        setForm(toForm(lead))
        setFormError(null)
    }, [lead])

    const set = <K extends keyof ConvertForm>(key: K, value: ConvertForm[K]) =>
        setForm((f) => ({ ...f, [key]: value }))

    const onSubmit = async () => {
        if (!lead) return
        if (!linked && form.mode === 'existing' && !form.customerId) {
            setFormError('Select the SD customer to link')
            return
        }
        if (form.mode === 'new' && (!form.companyName.trim() || !form.email.trim())) {
            setFormError('Company name and email are required to create the SD customer')
            return
        }
        const body: ConvertLeadInput = {
            ...(linked
                ? {}
                : form.mode === 'existing'
                  ? { customerId: form.customerId! }
                  : {
                        newCustomer: {
                            companyName: form.companyName.trim(),
                            contactName: form.contactName.trim() || undefined,
                            email: form.email.trim(),
                            phone: form.phone.trim() || undefined,
                        },
                    }),
            opportunity: {
                name: form.opportunityName.trim() || undefined,
                amount: form.amount.trim() === '' ? undefined : Number(form.amount),
                currency: form.currency.trim().toUpperCase() || undefined,
                stage: form.stage,
                expectedCloseDate: form.expectedCloseDate || undefined,
            },
        }
        setSaving(true)
        setFormError(null)
        try {
            onConverted(await onConvert(lead.id, body))
        } catch (err) {
            setFormError(getApiErrorMessage(err, 'Failed to convert lead'))
        } finally {
            setSaving(false)
        }
    }

    return (
        <FormDialog
            isOpen={Boolean(lead)}
            onClose={onClose}
            size="lg"
            title={lead ? `Convert “${lead.name}”` : 'Convert lead'}
            description="Creates an opportunity, moves the lead's activities onto it and marks the lead Converted."
            onSubmit={onSubmit}
            confirmText="Convert"
            confirmLoading={saving}
        >
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}

            <h6 className="mb-2">SD customer</h6>
            {linked ? (
                <p className="mb-4 text-sm">
                    Linked to <span className="font-medium">{lead?.customer?.companyName}</span>
                    {lead?.customer ? ` · ${lead.customer.customerNumber}` : ''}
                </p>
            ) : (
                <>
                    <div className="mb-3 flex gap-1">
                        <Button
                            size="sm"
                            variant={form.mode === 'existing' ? 'solid' : 'default'}
                            onClick={() => set('mode', 'existing')}
                        >
                            Link existing
                        </Button>
                        <Button
                            size="sm"
                            variant={form.mode === 'new' ? 'solid' : 'default'}
                            disabled={!canCreateCustomer}
                            title={canCreateCustomer ? undefined : 'Requires SD create permission'}
                            onClick={() => set('mode', 'new')}
                        >
                            Create in SD
                        </Button>
                    </div>
                    {form.mode === 'existing' ? (
                        <FormItem label="Customer" asterisk>
                            <CustomerSelect
                                value={form.customerId}
                                onChange={(id) => set('customerId', id)}
                            />
                        </FormItem>
                    ) : (
                        <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                            <FormItem label="Company name" asterisk className="md:col-span-2">
                                <Input
                                    maxLength={200}
                                    value={form.companyName}
                                    onChange={(e) => set('companyName', e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Contact name">
                                <Input
                                    maxLength={120}
                                    value={form.contactName}
                                    onChange={(e) => set('contactName', e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Email" asterisk>
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => set('email', e.target.value)}
                                />
                            </FormItem>
                            <FormItem label="Phone">
                                <Input
                                    maxLength={40}
                                    value={form.phone}
                                    onChange={(e) => set('phone', e.target.value)}
                                />
                            </FormItem>
                            <p className="self-center text-xs text-gray-500">
                                SD creates the customer with no credit limit; SD sets credit later.
                            </p>
                        </div>
                    )}
                </>
            )}

            <h6 className="mb-2 mt-2">Opportunity</h6>
            {requirementHint(stageMeta) ? (
                <p className="mb-2 text-xs text-gray-500">{requirementHint(stageMeta)}</p>
            ) : null}
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem label="Name" className="md:col-span-2">
                    <Input
                        maxLength={200}
                        value={form.opportunityName}
                        onChange={(e) => set('opportunityName', e.target.value)}
                    />
                </FormItem>
                <FormItem label="Stage">
                    <CrmSelect
                        options={enumOptions(OPPORTUNITY_OPEN_STAGES)}
                        value={form.stage}
                        onChange={(value) => value && set('stage', value as OpenStage)}
                    />
                </FormItem>
                <FormItem label="Expected close date" asterisk={Boolean(stageMeta?.requiresExpectedClose)}>
                    <Input
                        type="date"
                        value={form.expectedCloseDate}
                        onChange={(e) => set('expectedCloseDate', e.target.value)}
                    />
                </FormItem>
                <FormItem label="Amount" asterisk={Boolean(stageMeta?.requiresAmount)}>
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.amount}
                        onChange={(e) => set('amount', e.target.value)}
                    />
                </FormItem>
                <FormItem label="Currency">
                    <Input
                        maxLength={3}
                        value={form.currency}
                        onChange={(e) => set('currency', e.target.value)}
                    />
                </FormItem>
            </div>
        </FormDialog>
    )
}
