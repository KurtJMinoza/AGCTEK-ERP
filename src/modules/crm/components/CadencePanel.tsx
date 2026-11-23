'use client'

import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatusBadge from '@/components/shared/StatusBadge'
import type { CrmCadence, CrmCadenceActivity } from '../types'
import { CRM_PATHS, crmHref, opportunityHref, ticketHref } from '../utils/deepLinks'
import { crmTone, formatDate, formatEnumLabel, formatMoney } from '../utils/format'

function parentHref(activity: CrmCadenceActivity) {
    if (!activity.parent) return CRM_PATHS.opportunities
    if (activity.parent.kind === 'opportunity') return opportunityHref(activity.parent.id)
    if (activity.parent.kind === 'ticket') return ticketHref(activity.parent.id)
    return CRM_PATHS.leads
}

function ActivityList({
    title,
    tone,
    count,
    items,
    empty,
}: {
    title: string
    tone: 'danger' | 'warning' | 'info'
    count: number
    items: CrmCadenceActivity[]
    empty: string
}) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between gap-2">
                <h6 className="text-sm font-semibold">{title}</h6>
                <StatusBadge tone={tone}>{count}</StatusBadge>
            </div>
            {items.length === 0 ? (
                <p className="text-sm text-gray-500">{empty}</p>
            ) : (
                <ul className="space-y-1">
                    {items.map((item) => (
                        <li key={item.id}>
                            <Link
                                href={parentHref(item)}
                                className="block rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-medium heading-text">
                                            {item.summary}
                                        </p>
                                        <p className="truncate text-xs text-gray-500">
                                            {formatEnumLabel(item.type)}
                                            {item.parent
                                                ? ` · ${item.parent.label}`
                                                : ''}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-xs tabular-nums text-gray-400">
                                        {formatDate(item.dueAt)}
                                    </span>
                                </div>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

/** CRM home “what to do today” for the signed-in rep. */
export default function CadencePanel({
    data,
    loading,
    error,
}: {
    data: CrmCadence | null
    loading: boolean
    error: string | null
}) {
    return (
        <AdaptiveCard className="mb-4">
            <div className="mb-3">
                <h5>My cadence</h5>
                <p className="text-xs text-gray-500">
                    Overdue and due today (Asia/Manila), plus your open opportunities and
                    tickets.
                </p>
            </div>
            {error ? (
                <p className="text-sm text-rose-600">{error}</p>
            ) : loading && !data ? (
                <p className="text-sm text-gray-500">Loading…</p>
            ) : data ? (
                <div className="grid gap-6 lg:grid-cols-2">
                    <ActivityList
                        title="Overdue"
                        tone="danger"
                        count={data.overdueActivities.count}
                        items={data.overdueActivities.items}
                        empty="Nothing overdue."
                    />
                    <ActivityList
                        title="Due today"
                        tone="warning"
                        count={data.dueTodayActivities.count}
                        items={data.dueTodayActivities.items}
                        empty="Nothing due today."
                    />
                    <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h6 className="text-sm font-semibold">My open opportunities</h6>
                            <StatusBadge tone="info">
                                {data.openOpportunities.count}
                            </StatusBadge>
                        </div>
                        {data.openOpportunities.items.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No open opportunities assigned to you.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {data.openOpportunities.items.map((opp) => (
                                    <li key={opp.id}>
                                        <Link
                                            href={opportunityHref(opp.id)}
                                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium heading-text">
                                                    {opp.name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    <StatusBadge tone={crmTone(opp.stage)}>
                                                        {formatEnumLabel(opp.stage)}
                                                    </StatusBadge>
                                                    {opp.expectedCloseDate
                                                        ? ` · close ${formatDate(opp.expectedCloseDate)}`
                                                        : ''}
                                                </p>
                                            </div>
                                            <span className="shrink-0 text-sm tabular-nums">
                                                {opp.amount
                                                    ? formatMoney(
                                                          Number(opp.amount),
                                                          opp.currency,
                                                      )
                                                    : '—'}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <h6 className="text-sm font-semibold">My open tickets</h6>
                            <StatusBadge tone="info">{data.openTickets.count}</StatusBadge>
                        </div>
                        {data.openTickets.items.length === 0 ? (
                            <p className="text-sm text-gray-500">
                                No open tickets assigned to you.
                            </p>
                        ) : (
                            <ul className="space-y-1">
                                {data.openTickets.items.map((ticket) => (
                                    <li key={ticket.id}>
                                        <Link
                                            href={ticketHref(ticket.id)}
                                            className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                        >
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-medium heading-text">
                                                    {ticket.subject}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {formatEnumLabel(ticket.status)}
                                                </p>
                                            </div>
                                            <StatusBadge tone={crmTone(ticket.priority)}>
                                                {formatEnumLabel(ticket.priority)}
                                            </StatusBadge>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-sm text-gray-500">Cadence unavailable.</p>
            )}
        </AdaptiveCard>
    )
}
