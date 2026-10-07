'use client'

import type { ReactNode } from 'react'
import Timeline from '@/components/ui/Timeline'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge, { type StatusTone } from '@/components/shared/StatusBadge'
import { formatEnumLabel, formatUserName } from '../../utils/format'
import type { Activity, LinkedSalesOrder, Opportunity } from '../../types'

type TimelineEntry = {
    key: string
    at: string
    tone: StatusTone
    label: string
    body: ReactNode
}

/**
 * v1 timeline from data CRM already stores: activities (scheduled / done), record creation,
 * the current close (closedAt) and the SD order link. There is no stage-change audit yet,
 * so intermediate stage moves are not shown.
 */
function buildEntries(
    opportunity: Opportunity,
    activities: Activity[],
    salesOrder: LinkedSalesOrder | null,
): TimelineEntry[] {
    const entries: TimelineEntry[] = []
    for (const activity of activities) {
        const what = `${formatEnumLabel(activity.type)}: ${activity.summary}`
        if (activity.doneAt) {
            entries.push({
                key: `${activity.id}-done`,
                at: activity.doneAt,
                tone: 'success',
                label: 'Activity done',
                body: `${what} · ${formatUserName(activity.assignee)}`,
            })
        }
        entries.push({
            key: `${activity.id}-scheduled`,
            at: activity.createdAt,
            tone: 'info',
            label: 'Activity scheduled',
            body: `${what} · due ${new Date(activity.dueAt).toLocaleString()}`,
        })
    }
    if (opportunity.closedAt) {
        const won = opportunity.stage === 'CLOSED_WON'
        entries.push({
            key: 'closed',
            at: opportunity.closedAt,
            tone: won ? 'success' : 'danger',
            label: won ? 'Closed won' : 'Closed lost',
            body: won
                ? 'The deal was won.'
                : [
                      opportunity.lostReason && formatEnumLabel(opportunity.lostReason),
                      opportunity.lostNotes,
                  ]
                      .filter(Boolean)
                      .join(' — ') || 'The deal was lost.',
        })
    }
    if (salesOrder) {
        entries.push({
            key: 'sales-order',
            at: salesOrder.createdAt,
            tone: 'success',
            label: 'SD order created',
            body: `${salesOrder.orderNumber} handed to SD (${formatEnumLabel(salesOrder.status)}).`,
        })
    }
    entries.push({
        key: 'created',
        at: opportunity.createdAt,
        tone: 'default',
        label: 'Opportunity created',
        body: opportunity.lead ? `Converted from lead “${opportunity.lead.name}”.` : 'Created directly.',
    })
    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

type OpportunityTimelineProps = {
    opportunity: Opportunity
    activities: Activity[]
    salesOrder: LinkedSalesOrder | null
}

export default function OpportunityTimeline({
    opportunity,
    activities,
    salesOrder,
}: OpportunityTimelineProps) {
    const entries = buildEntries(opportunity, activities, salesOrder)
    return (
        <AdaptiveCard>
            <h5 className="mb-3">Timeline</h5>
            <Timeline>
                {entries.map((entry) => (
                    <Timeline.Item key={entry.key}>
                        <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge tone={entry.tone}>{entry.label}</StatusBadge>
                            <span className="text-xs text-gray-500">
                                {new Date(entry.at).toLocaleString()}
                            </span>
                        </div>
                        <p className="mt-1 text-sm">{entry.body}</p>
                    </Timeline.Item>
                ))}
            </Timeline>
        </AdaptiveCard>
    )
}
