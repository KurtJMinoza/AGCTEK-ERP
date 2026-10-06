'use client'

import { useEffect, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import FormDialog from '@/components/shared/FormDialog'
import CrmSelect from './CrmSelect'
import CustomerSelect from './CustomerSelect'
import { LinkedSalesOrderInfo } from './OpportunitySalesOrderDialog'
import { useOpportunityStages } from '../hooks/useOpportunityPipeline'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'
import { enumOptions, formatEnumLabel, toDateInput } from '../utils/format'
import {
    OPPORTUNITY_OPEN_STAGES,
    OPPORTUNITY_STAGES,
    type CreateOpportunityInput,
    type Opportunity,
    type OpportunityStage,
    type OpportunityStageMeta,
    type UpdateOpportunityInput,
} from '../types'

type OpportunityForm = {
    customerId: string | null
    name: string
    description: string
    amount: string
    currency: string
    stage: OpportunityStage
    probability: string
    expectedCloseDate: string
    lostReason: string | null
    lostNotes: string
}

const toForm = (row: Opportunity | null, customerId?: string): OpportunityForm => ({
    customerId: row?.customerId ?? customerId ?? null,
    name: row?.name ?? '',
    description: row?.description ?? '',
    amount: row?.amount == null ? '' : String(row.amount),
    currency: row?.currency ?? 'PHP',
    stage: row?.stage ?? 'PROSPECTING',
    probability: row?.probability == null ? '' : String(row.probability),
    expectedCloseDate: toDateInput(row?.expectedCloseDate),
    lostReason: row?.lostReason ?? null,
    lostNotes: row?.lostNotes ?? '',
})

const optionalNumber = (value: string) => (value.trim() === '' ? null : Number(value))

const OPEN_STAGES: readonly OpportunityStage[] = OPPORTUNITY_OPEN_STAGES

const openStageIndex = (stage: OpportunityStage) => OPEN_STAGES.indexOf(stage)

/** Advisory only: advancing an open opportunity that has no open activity scheduled. */
export const advancesWithoutActivity = (row: Opportunity | null, stage: OpportunityStage) =>
    row?.nextActivityStatus === 'NONE' &&
    openStageIndex(row.stage) >= 0 &&
    openStageIndex(stage) > openStageIndex(row.stage)

/** Closed → closed is not allowed server-side; offer only reachable stages. */
export function reachableStages(row: Opportunity | null): readonly OpportunityStage[] {
    if (!row) return OPPORTUNITY_OPEN_STAGES
    if (row.stage === 'CLOSED_WON') return ['CLOSED_WON', ...OPEN_STAGES]
    if (row.stage === 'CLOSED_LOST') return [...OPEN_STAGES, 'CLOSED_LOST']
    return OPPORTUNITY_STAGES
}

/** Closing as won needs the SD order step (workspace win dialog), so the form never offers it. */
const stageOptions = (row: Opportunity | null) =>
    enumOptions(
        reachableStages(row).filter((stage) => stage !== 'CLOSED_WON' || row?.stage === 'CLOSED_WON'),
    )

export function requirementHint(meta: OpportunityStageMeta | undefined) {
    if (!meta) return null
    const items = [
        meta.requiresAmount && 'an amount',
        meta.requiresExpectedClose && 'an expected close date',
        meta.requiresCustomer && 'an active SD customer',
    ].filter(Boolean) as string[]
    if (meta.isLost) return 'Closing as lost requires a reason.'
    if (items.length === 0) return null
    const list = items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
    return `${formatEnumLabel(meta.stage)} requires ${list}.`
}

type OpportunityFormDialogProps = {
    isOpen: boolean
    opportunity: Opportunity | null
    /** Pre-selects and locks the customer (Customer 360). */
    customerId?: string
    onClose: () => void
    onCreate: (body: CreateOpportunityInput) => Promise<unknown>
    onUpdate: (id: string, body: UpdateOpportunityInput) => Promise<unknown>
}

export default function OpportunityFormDialog({
    isOpen,
    opportunity,
    customerId,
    onClose,
    onCreate,
    onUpdate,
}: OpportunityFormDialogProps) {
    const { config, meta } = useOpportunityStages()
    const [form, setForm] = useState<OpportunityForm>(() => toForm(opportunity, customerId))
    const [saving, setSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)
    const isWon = opportunity?.stage === 'CLOSED_WON'
    const reopening = isWon && form.stage !== 'CLOSED_WON'
    /** Closed Won is read-only until the user picks an open stage to reopen it. */
    const readOnly = isWon && !reopening
    const targetMeta = meta(form.stage)
    const isLost = form.stage === 'CLOSED_LOST'
    const notesRequired = Boolean(
        form.lostReason && config?.lostReasonsRequiringNotes.includes(form.lostReason),
    )

    useEffect(() => {
        if (isOpen) {
            setForm(toForm(opportunity, customerId))
            setFormError(null)
        }
    }, [isOpen, opportunity, customerId])

    const changeStage = (stage: OpportunityStage) =>
        setForm((f) => {
            if (stage === f.stage) return f
            const defaultProbability = meta(stage)?.defaultProbability
            return {
                ...f,
                stage,
                probability:
                    defaultProbability === undefined ? f.probability : String(defaultProbability),
            }
        })

    const onSubmit = async () => {
        if (isLost && !form.lostReason) {
            setFormError('Select a lost reason')
            return
        }
        if (isLost && notesRequired && !form.lostNotes.trim()) {
            setFormError('Add notes explaining the lost reason')
            return
        }
        setSaving(true)
        setFormError(null)
        const amount = optionalNumber(form.amount)
        const probability = optionalNumber(form.probability)
        try {
            if (opportunity) {
                await onUpdate(opportunity.id, {
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    amount,
                    currency: form.currency.trim().toUpperCase(),
                    stage: form.stage,
                    probability,
                    expectedCloseDate: form.expectedCloseDate || null,
                    ...(isLost
                        ? { lostReason: form.lostReason, lostNotes: form.lostNotes.trim() || null }
                        : {}),
                })
            } else {
                if (!form.customerId) {
                    setFormError('Select a customer')
                    return
                }
                await onCreate({
                    customerId: form.customerId,
                    name: form.name.trim(),
                    description: form.description.trim() || undefined,
                    amount: amount ?? undefined,
                    currency: form.currency.trim().toUpperCase() || undefined,
                    stage: form.stage as CreateOpportunityInput['stage'],
                    probability: probability ?? undefined,
                    expectedCloseDate: form.expectedCloseDate || undefined,
                })
            }
            onClose()
        } catch (err) {
            setFormError(
                getApiErrorMessage(
                    err,
                    opportunity ? 'Failed to update opportunity' : 'Failed to create opportunity',
                ),
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
            title={opportunity ? 'Edit opportunity' : 'New opportunity'}
            description={
                readOnly
                    ? 'Closed Won opportunities are read-only. Choose an open stage to reopen it.'
                    : (requirementHint(targetMeta) ?? undefined)
            }
            onSubmit={readOnly ? undefined : onSubmit}
            confirmText={reopening ? 'Reopen' : opportunity ? 'Save' : 'Create'}
            confirmLoading={saving}
        >
            {formError ? (
                <Alert showIcon type="danger" className="mb-4">
                    {formError}
                </Alert>
            ) : null}
            {!readOnly && advancesWithoutActivity(opportunity, form.stage) ? (
                <Alert showIcon type="warning" className="mb-4">
                    No open activity is scheduled for this opportunity. You can still save; consider
                    scheduling the next step from Activities.
                </Alert>
            ) : null}
            {reopening ? (
                <Alert showIcon type="info" className="mb-4">
                    {opportunity?.sdSalesOrderId
                        ? 'The linked SD sales order stays linked and unchanged; CRM does not cancel or edit it.'
                        : 'Reopening moves this deal back into the pipeline.'}
                </Alert>
            ) : null}
            {opportunity?.sdSalesOrderId ? (
                <div className="mb-4">
                    <LinkedSalesOrderInfo opportunityId={opportunity.id} />
                </div>
            ) : null}
            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                <FormItem label="Customer" asterisk className="md:col-span-2">
                    <CustomerSelect
                        value={form.customerId}
                        isDisabled={Boolean(opportunity) || Boolean(customerId)}
                        onChange={(id) => setForm((f) => ({ ...f, customerId: id }))}
                    />
                </FormItem>
                <FormItem label="Name" asterisk className="md:col-span-2">
                    <Input
                        value={form.name}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Amount" asterisk={Boolean(targetMeta?.requiresAmount)}>
                    <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.amount}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Currency">
                    <Input
                        value={form.currency}
                        maxLength={3}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                    />
                </FormItem>
                <FormItem label="Stage">
                    <CrmSelect
                        options={stageOptions(opportunity)}
                        value={form.stage}
                        onChange={(value) => value && changeStage(value as OpportunityStage)}
                    />
                </FormItem>
                <FormItem label="Probability (%)">
                    <Input
                        type="number"
                        min={0}
                        max={100}
                        value={form.probability}
                        disabled={readOnly || Boolean(targetMeta?.isWon || targetMeta?.isLost)}
                        onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
                    />
                </FormItem>
                <FormItem
                    label="Expected close date"
                    asterisk={Boolean(targetMeta?.requiresExpectedClose)}
                >
                    <Input
                        type="date"
                        value={form.expectedCloseDate}
                        disabled={readOnly}
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
                                placeholder="Why was this opportunity lost?"
                                onChange={(value) => setForm((f) => ({ ...f, lostReason: value }))}
                            />
                        </FormItem>
                        <FormItem
                            label="Lost notes"
                            asterisk={notesRequired}
                            className="md:col-span-2"
                        >
                            <Input
                                textArea
                                rows={2}
                                maxLength={1000}
                                value={form.lostNotes}
                                onChange={(e) =>
                                    setForm((f) => ({ ...f, lostNotes: e.target.value }))
                                }
                            />
                        </FormItem>
                    </>
                ) : null}
                <FormItem label="Description" className="md:col-span-2">
                    <Input
                        textArea
                        rows={3}
                        value={form.description}
                        disabled={readOnly}
                        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    />
                </FormItem>
            </div>
        </FormDialog>
    )
}
