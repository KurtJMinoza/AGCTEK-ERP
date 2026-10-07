'use client'

import { useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { FormItem } from '@/components/ui/Form'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import FormDialog from '@/components/shared/FormDialog'
import classNames from '@/utils/classNames'
import CrmSelect from '../CrmSelect'
import { advancesWithoutActivity, reachableStages, requirementHint } from '../OpportunityFormDialog'
import { useOpportunityStages } from '../../hooks/useOpportunityPipeline'
import { enumOptions, formatEnumLabel } from '../../utils/format'
import {
    OPPORTUNITY_OPEN_STAGES,
    OPPORTUNITY_STAGES,
    type Opportunity,
    type OpportunityStage,
    type UpdateOpportunityInput,
} from '../../types'
import { getApiErrorMessage } from '@/modules/scm/utils/apiError'

type OpportunityStageControlProps = {
    opportunity: Opportunity
    canUpdate: boolean
    onUpdate: (body: UpdateOpportunityInput) => Promise<unknown>
    /** Closed Won is not a PATCH: it opens the win dialog (SD order + stage together). */
    onWin: () => void
}

type Pending =
    | { kind: 'confirm'; stage: OpportunityStage; reason: 'no-activity' | 'reopen' }
    | { kind: 'lost' }

const openIndex = (stage: OpportunityStage) =>
    (OPPORTUNITY_OPEN_STAGES as readonly OpportunityStage[]).indexOf(stage)

/**
 * Odoo-style stage bar. Open/lost moves go through PATCH and Closed Won through the win
 * dialog; the server enforces gates, transitions and lost reasons — this control only adds
 * the same advisories as the edit dialog.
 */
export default function OpportunityStageControl({
    opportunity,
    canUpdate,
    onUpdate,
    onWin,
}: OpportunityStageControlProps) {
    const { config, meta } = useOpportunityStages()
    const [pending, setPending] = useState<Pending | null>(null)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [lostReason, setLostReason] = useState<string | null>(null)
    const [lostNotes, setLostNotes] = useState('')

    const reachable = new Set(reachableStages(opportunity))
    const current = opportunity.stage
    const currentOpenIndex = openIndex(current)
    const notesRequired = Boolean(
        lostReason && config?.lostReasonsRequiringNotes.includes(lostReason),
    )

    const move = async (body: UpdateOpportunityInput) => {
        setBusy(true)
        setError(null)
        try {
            await onUpdate(body)
            setPending(null)
        } catch (err) {
            setPending(null)
            setError(getApiErrorMessage(err, 'Failed to change stage'))
        } finally {
            setBusy(false)
        }
    }

    const select = (stage: OpportunityStage) => {
        if (stage === current || !reachable.has(stage) || busy) return
        setError(null)
        if (stage === 'CLOSED_WON') {
            onWin()
        } else if (stage === 'CLOSED_LOST') {
            setLostReason(null)
            setLostNotes('')
            setPending({ kind: 'lost' })
        } else if (current === 'CLOSED_WON') {
            setPending({ kind: 'confirm', stage, reason: 'reopen' })
        } else if (advancesWithoutActivity(opportunity, stage)) {
            setPending({ kind: 'confirm', stage, reason: 'no-activity' })
        } else {
            void move({ stage })
        }
    }

    const confirmLost = () => {
        if (!lostReason) {
            setError('Select a lost reason')
            return
        }
        if (notesRequired && !lostNotes.trim()) {
            setError('Add notes explaining the lost reason')
            return
        }
        void move({ stage: 'CLOSED_LOST', lostReason, lostNotes: lostNotes.trim() || null })
    }

    const confirmStage = pending?.kind === 'confirm' ? pending.stage : null

    return (
        <div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Opportunity stage">
                {OPPORTUNITY_STAGES.map((stage) => {
                    const isCurrent = stage === current
                    const passed =
                        currentOpenIndex >= 0 &&
                        openIndex(stage) >= 0 &&
                        openIndex(stage) < currentOpenIndex
                    const disabled = !canUpdate || !reachable.has(stage) || busy
                    return (
                        <Button
                            key={stage}
                            size="sm"
                            variant={isCurrent ? 'solid' : 'default'}
                            disabled={!isCurrent && disabled}
                            aria-current={isCurrent ? 'step' : undefined}
                            title={
                                isCurrent
                                    ? 'Current stage'
                                    : stage === 'CLOSED_WON'
                                      ? [requirementHint(meta(stage)), 'Creates the SD sales order first.']
                                            .filter(Boolean)
                                            .join(' ')
                                      : (requirementHint(meta(stage)) ?? undefined)
                            }
                            className={classNames(passed && 'text-primary')}
                            onClick={() => select(stage)}
                        >
                            {formatEnumLabel(stage)}
                        </Button>
                    )
                })}
            </div>
            {error && !pending ? (
                <Alert showIcon type="danger" className="mt-3">
                    {error}
                </Alert>
            ) : null}

            <ConfirmDialog
                isOpen={pending?.kind === 'confirm'}
                type={pending?.kind === 'confirm' && pending.reason === 'reopen' ? 'info' : 'warning'}
                title={confirmStage ? `Move to ${formatEnumLabel(confirmStage)}?` : ''}
                confirmText="Move"
                confirmButtonProps={{ loading: busy }}
                onClose={() => setPending(null)}
                onCancel={() => setPending(null)}
                onConfirm={() => confirmStage && void move({ stage: confirmStage })}
            >
                <p className="text-sm">
                    {pending?.kind === 'confirm' && pending.reason === 'reopen'
                        ? opportunity.sdSalesOrderId
                            ? 'Reopening moves this deal back into the pipeline. The linked SD sales order stays linked and unchanged; CRM does not cancel or edit it.'
                            : 'Reopening moves this deal back into the pipeline.'
                        : 'No open activity is scheduled for this opportunity. You can still move it; consider scheduling the next step.'}
                </p>
            </ConfirmDialog>

            <FormDialog
                isOpen={pending?.kind === 'lost'}
                onClose={() => setPending(null)}
                title="Close as lost"
                description="A reason is required. The opportunity can be reopened later."
                confirmText="Close as lost"
                confirmLoading={busy}
                onSubmit={confirmLost}
            >
                {error ? (
                    <Alert showIcon type="danger" className="mb-4">
                        {error}
                    </Alert>
                ) : null}
                <FormItem label="Lost reason" asterisk>
                    <CrmSelect
                        options={enumOptions(config?.lostReasons ?? [])}
                        value={lostReason}
                        isLoading={!config}
                        placeholder="Why was this opportunity lost?"
                        onChange={(value) => setLostReason(value)}
                    />
                </FormItem>
                <FormItem label="Lost notes" asterisk={notesRequired}>
                    <Input
                        textArea
                        rows={3}
                        maxLength={1000}
                        value={lostNotes}
                        onChange={(e) => setLostNotes(e.target.value)}
                    />
                </FormItem>
            </FormDialog>
        </div>
    )
}
