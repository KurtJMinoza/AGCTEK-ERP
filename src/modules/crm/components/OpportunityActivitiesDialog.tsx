'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import ActivitiesDialog from './ActivitiesDialog'
import NextActivityBadge from './NextActivityBadge'
import { crmTone, formatEnumLabel, formatMoney } from '../utils/format'
import { OPPORTUNITY_OPEN_STAGES, type Opportunity } from '../types'

const OPEN_STAGES: ReadonlySet<string> = new Set(OPPORTUNITY_OPEN_STAGES)

type OpportunityActivitiesDialogProps = {
    opportunity: Opportunity | null
    canCreate: boolean
    canUpdate: boolean
    onClose: () => void
    /** Called after any change so callers can refresh next-activity badges. */
    onChanged?: () => void
}

export default function OpportunityActivitiesDialog({
    opportunity,
    ...rest
}: OpportunityActivitiesDialogProps) {
    return (
        <ActivitiesDialog
            {...rest}
            parent={opportunity ? { kind: 'opportunity', id: opportunity.id } : null}
            title={opportunity?.name ?? 'Opportunity'}
            description={
                opportunity
                    ? `${opportunity.customer.companyName} · ${formatMoney(opportunity.amount, opportunity.currency)}`
                    : undefined
            }
            headerExtra={
                opportunity ? (
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={crmTone(opportunity.stage)}>
                            {formatEnumLabel(opportunity.stage)}
                        </StatusBadge>
                        <NextActivityBadge opportunity={opportunity} />
                    </div>
                ) : null
            }
            acceptsActivities={opportunity ? OPEN_STAGES.has(opportunity.stage) : false}
            closedHint="New activities can only be scheduled on open opportunities."
            summaryPlaceholder="e.g. Call to confirm proposal feedback"
        />
    )
}
