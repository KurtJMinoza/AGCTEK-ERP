'use client'

import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import {
    OPPORTUNITY_OPEN_STAGES,
    type NextActivityStatus,
    type Opportunity,
} from '../types'

const OPEN_STAGES: ReadonlySet<string> = new Set(OPPORTUNITY_OPEN_STAGES)

const badge: Record<NextActivityStatus, { tone: StatusTone; label: string }> = {
    OVERDUE: { tone: 'danger', label: 'Overdue' },
    DUE_TODAY: { tone: 'warning', label: 'Due today' },
    UPCOMING: { tone: 'info', label: 'Upcoming' },
    NONE: { tone: 'default', label: 'No activity' },
}

type ActivityStatusBadgeProps = {
    status: NextActivityStatus | undefined
    dueAt?: string | null
    className?: string
}

/** Server-computed next-activity state for any activity parent (opportunity or ticket). */
export function ActivityStatusBadge({ status, dueAt, className }: ActivityStatusBadgeProps) {
    if (!status) return null
    const { tone, label } = badge[status]
    return (
        <span title={dueAt ? `Next activity due ${new Date(dueAt).toLocaleString()}` : undefined}>
            <StatusBadge tone={tone} className={className}>
                {label}
            </StatusBadge>
        </span>
    )
}

type NextActivityBadgeProps = {
    opportunity: Pick<Opportunity, 'stage' | 'nextActivityStatus' | 'nextActivityDueAt'>
    className?: string
}

/** Next-activity state for open opportunities; renders nothing for closed ones or 360 rows. */
export default function NextActivityBadge({ opportunity, className }: NextActivityBadgeProps) {
    if (!OPEN_STAGES.has(opportunity.stage)) return null
    return (
        <ActivityStatusBadge
            status={opportunity.nextActivityStatus}
            dueAt={opportunity.nextActivityDueAt}
            className={className}
        />
    )
}
