'use client'

import StatusBadge from '@/components/shared/StatusBadge'
import ActivitiesDialog from './ActivitiesDialog'
import { ActivityStatusBadge } from './NextActivityBadge'
import { crmTone, formatEnumLabel } from '../utils/format'
import { leadAcceptsActivities, type Lead } from '../types'

type LeadActivitiesDialogProps = {
    lead: Lead | null
    canCreate: boolean
    canUpdate: boolean
    onClose: () => void
    onChanged?: () => void
}

/** Activity log for a lead from intake on; a converted lead shows its history read-only. */
export default function LeadActivitiesDialog({ lead, ...rest }: LeadActivitiesDialogProps) {
    return (
        <ActivitiesDialog
            {...rest}
            parent={lead ? { kind: 'lead', id: lead.id } : null}
            title={lead?.name ?? 'Lead'}
            description={
                lead ? [lead.email, lead.phone].filter(Boolean).join(' · ') || undefined : undefined
            }
            headerExtra={
                lead ? (
                    <div className="flex flex-wrap gap-2">
                        <StatusBadge tone={crmTone(lead.status)}>
                            {formatEnumLabel(lead.status)}
                        </StatusBadge>
                        <ActivityStatusBadge
                            status={lead.nextActivityStatus}
                            dueAt={lead.nextActivityDueAt}
                        />
                    </div>
                ) : null
            }
            acceptsActivities={lead ? leadAcceptsActivities(lead.status) : false}
            closedHint="Converted leads keep their history here; log follow-ups on the opportunity."
            summaryPlaceholder="e.g. Call to qualify budget and timeline"
        />
    )
}
