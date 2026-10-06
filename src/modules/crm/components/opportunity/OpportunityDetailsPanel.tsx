'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import CrmSelect from '../CrmSelect'
import { useOpportunityStages } from '../../hooks/useOpportunityPipeline'
import {
    crmTone,
    enumOptions,
    formatDate,
    formatEnumLabel,
    formatMoney,
    toDateInput,
} from '../../utils/format'
import type { Opportunity, UpdateOpportunityInput } from '../../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

type DetailsForm = {
    name: string
    amount: string
    currency: string
    probability: string
    expectedCloseDate: string
    description: string
    lostReason: string | null
    lostNotes: string
}

const toForm = (row: Opportunity): DetailsForm => ({
    name: row.name,
    amount: row.amount == null ? '' : String(row.amount),
    currency: row.currency,
    probability: row.probability == null ? '' : String(row.probability),
    expectedCloseDate: toDateInput(row.expectedCloseDate),
    description: row.description ?? '',
    lostReason: row.lostReason,
    lostNotes: row.lostNotes ?? '',
})

const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value))

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-3 gap-3 border-b border-gray-100 py-2 text-sm last:border-0 dark:border-gray-700">
            <dt className="text-gray-500">{label}</dt>
            <dd className="col-span-2 min-w-0 break-words">{children}</dd>
        </div>
    )
}

type OpportunityDetailsPanelProps = {
    opportunity: Opportunity
    canUpdate: boolean
    onUpdate: (body: UpdateOpportunityInput) => Promise<unknown>
}

export default function OpportunityDetailsPanel({
    opportunity,
    canUpdate,
    onUpdate,
}: OpportunityDetailsPanelProps) {
    const { config } = useOpportunityStages()
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<DetailsForm>(() => toForm(opportunity))
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const isWon = opportunity.stage === 'CLOSED_WON'
    const isLost = opportunity.stage === 'CLOSED_LOST'
    const isClosed = isWon || isLost
    /** Closed Won is read-only server-side until reopened from the stage bar. */
    const editable = canUpdate && !isWon
    const notesRequired = Boolean(
        form.lostReason && config?.lostReasonsRequiringNotes.includes(form.lostReason),
    )

    useEffect(() => {
        if (!editing) setForm(toForm(opportunity))
    }, [opportunity, editing])

    const save = async () => {
        if (!form.name.trim()) {
            setError('Name is required')
            return
        }
        if (isLost && !form.lostReason) {
            setError('Select a lost reason')
            return
        }
        if (isLost && notesRequired && !form.lostNotes.trim()) {
            setError('Add notes explaining the lost reason')
            return
        }
        setSaving(true)
        setError(null)
        try {
            await onUpdate({
                name: form.name.trim(),
                description: form.description.trim() || null,
                amount: optionalNumber(form.amount),
                currency: form.currency.trim().toUpperCase(),
                expectedCloseDate: form.expectedCloseDate || null,
                ...(isClosed ? {} : { probability: optionalNumber(form.probability) }),
                ...(isLost
                    ? { lostReason: form.lostReason, lostNotes: form.lostNotes.trim() || null }
                    : {}),
            })
            setEditing(false)
        } catch (err) {
            setError(getApiErrorMessage(err, 'Failed to save opportunity'))
        } finally {
            setSaving(false)
        }
    }

    const cancel = () => {
        setEditing(false)
        setError(null)
        setForm(toForm(opportunity))
    }

    const lead = opportunity.lead

    return (
        <AdaptiveCard className="h-full">
            <div className="mb-3 flex items-center justify-between gap-2">
                <h5>Details</h5>
                {editing ? (
                    <div className="flex gap-2">
                        <Button size="sm" onClick={cancel} disabled={saving}>
                            Cancel
                        </Button>
                        <Button size="sm" variant="solid" loading={saving} onClick={() => void save()}>
                            Save
                        </Button>
                    </div>
                ) : editable ? (
                    <Button size="sm" onClick={() => setEditing(true)}>
                        Edit
                    </Button>
                ) : null}
            </div>

            {error ? (
                <Alert showIcon type="danger" className="mb-3">
                    {error}
                </Alert>
            ) : null}
            {isWon && canUpdate ? (
                <p className="mb-3 text-xs text-gray-500">
                    Closed Won opportunities are read-only. Move to an open stage to reopen and edit.
                </p>
            ) : null}

            {editing ? (
                <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                    <FormItem label="Name" asterisk className="md:col-span-2">
                        <Input
                            value={form.name}
                            maxLength={200}
                            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Amount">
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={form.amount}
                            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Currency">
                        <Input
                            value={form.currency}
                            maxLength={3}
                            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Probability (%)">
                        <Input
                            type="number"
                            min={0}
                            max={100}
                            value={form.probability}
                            disabled={isClosed}
                            onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
                        />
                    </FormItem>
                    <FormItem label="Expected close date">
                        <Input
                            type="date"
                            value={form.expectedCloseDate}
                            onChange={(e) =>
                                setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))
                            }
                        />
                    </FormItem>
                    {isLost ? (
                        <>
                            <FormItem label="Lost reason" asterisk className="md:col-span-2">
                                <CrmSelect
                                    options={enumOptions(config?.lostReasons ?? [])}
                                    value={form.lostReason}
                                    isLoading={!config}
                                    onChange={(value) => setForm((f) => ({ ...f, lostReason: value }))}
                                />
                            </FormItem>
                            <FormItem label="Lost notes" asterisk={notesRequired} className="md:col-span-2">
                                <Input
                                    textArea
                                    rows={2}
                                    maxLength={1000}
                                    value={form.lostNotes}
                                    onChange={(e) => setForm((f) => ({ ...f, lostNotes: e.target.value }))}
                                />
                            </FormItem>
                        </>
                    ) : null}
                    <FormItem label="Description" className="md:col-span-2">
                        <Input
                            textArea
                            rows={4}
                            maxLength={4000}
                            value={form.description}
                            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                        />
                    </FormItem>
                </div>
            ) : (
                <dl>
                    <Field label="Stage">
                        <StatusBadge tone={crmTone(opportunity.stage)}>
                            {formatEnumLabel(opportunity.stage)}
                        </StatusBadge>
                        {opportunity.closedAt ? (
                            <span className="ml-2 text-xs text-gray-500">
                                closed {formatDate(opportunity.closedAt)}
                            </span>
                        ) : null}
                    </Field>
                    <Field label="Customer">
                        <Link
                            href={`/crm/customers/${opportunity.customerId}`}
                            className="text-primary hover:underline"
                        >
                            {opportunity.customer.companyName}
                        </Link>
                        <span className="ml-2 text-xs text-gray-500">
                            {opportunity.customer.customerNumber}
                        </span>
                        {opportunity.sdSalesOrderId ? (
                            <p className="text-xs text-gray-500">
                                Locked: an SD sales order is linked.
                            </p>
                        ) : null}
                    </Field>
                    <Field label="Amount">
                        <span className="tabular-nums">
                            {formatMoney(opportunity.amount, opportunity.currency)}
                        </span>
                    </Field>
                    <Field label="Probability">
                        {opportunity.probability == null ? '—' : `${opportunity.probability}%`}
                    </Field>
                    <Field label="Expected close">{formatDate(opportunity.expectedCloseDate)}</Field>
                    <Field label="Source">
                        {lead ? (
                            <>
                                {lead.source ? formatEnumLabel(lead.source) : 'Lead'}
                                <span className="text-xs text-gray-500"> · lead “{lead.name}”</span>
                            </>
                        ) : (
                            <span className="text-gray-500">Created directly (no lead)</span>
                        )}
                    </Field>
                    {isLost ? (
                        <>
                            <Field label="Lost reason">
                                {opportunity.lostReason ? formatEnumLabel(opportunity.lostReason) : '—'}
                            </Field>
                            <Field label="Lost notes">{opportunity.lostNotes || '—'}</Field>
                        </>
                    ) : null}
                    <Field label="Description">
                        {opportunity.description ? (
                            <span className="whitespace-pre-line">{opportunity.description}</span>
                        ) : (
                            <span className="text-gray-500">—</span>
                        )}
                    </Field>
                </dl>
            )}
        </AdaptiveCard>
    )
}
