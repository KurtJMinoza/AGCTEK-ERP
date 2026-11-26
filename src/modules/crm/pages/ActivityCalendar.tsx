'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import CrmSelect from '../components/CrmSelect'
import { useCrmActivityCalendar } from '../hooks/useCrmActivityCalendar'
import { crmPageBreadcrumbs } from '../utils/breadcrumbs'
import {
    manilaDayEnd,
    manilaDayStart,
    monthRange,
    rangeLabel,
    shiftAnchor,
    todayManila,
    weekRange,
    type CalendarView,
} from '../utils/calendarRange'
import { CRM_PATHS, opportunityHref, ticketHref } from '../utils/deepLinks'
import { crmTone, formatEnumLabel } from '../utils/format'
import type { CrmCalendarActivity } from '../types'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function parentHref(activity: CrmCalendarActivity) {
    if (!activity.parent) return CRM_PATHS.opportunities
    if (activity.parent.kind === 'opportunity') return opportunityHref(activity.parent.id)
    if (activity.parent.kind === 'ticket') return ticketHref(activity.parent.id)
    return CRM_PATHS.leads
}

export default function ActivityCalendarPage() {
    const [view, setView] = useState<CalendarView>('week')
    const [anchor, setAnchor] = useState(todayManila)
    const [scope, setScope] = useState<'mine' | 'all'>('mine')
    const [includeDone, setIncludeDone] = useState(false)

    const grid = useMemo(
        () => (view === 'week' ? weekRange(anchor) : monthRange(anchor)),
        [view, anchor],
    )
    const from = manilaDayStart(grid.start).toISOString()
    const to = manilaDayEnd(grid.end).toISOString()
    const { data, loading, error, reload } = useCrmActivityCalendar(
        from,
        to,
        scope,
        includeDone,
    )

    const byDay = useMemo(() => {
        const map = new Map<string, CrmCalendarActivity[]>()
        for (const day of grid.days) map.set(day, [])
        for (const item of data?.items ?? []) {
            const list = map.get(item.dueDay)
            if (list) list.push(item)
        }
        return map
    }, [data, grid.days])

    const today = todayManila()

    return (
        <PageContainer>
            <PageHeader
                title="Activity calendar"
                description="Plan the week or month. Days use Asia/Manila. Click an activity to open its lead, opportunity, or ticket."
                breadcrumbs={crmPageBreadcrumbs('/crm/calendar')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <CrmSelect
                            className="w-32"
                            options={[
                                { value: 'week', label: 'Week' },
                                { value: 'month', label: 'Month' },
                            ]}
                            value={view}
                            onChange={(value) => setView(value as CalendarView)}
                        />
                        <CrmSelect
                            className="w-36"
                            options={[
                                { value: 'mine', label: 'My activities' },
                                { value: 'all', label: 'All owners' },
                            ]}
                            value={scope}
                            onChange={(value) => setScope(value as 'mine' | 'all')}
                        />
                        <Button
                            size="sm"
                            variant={includeDone ? 'solid' : 'plain'}
                            onClick={() => setIncludeDone((v) => !v)}
                        >
                            {includeDone ? 'Including done' : 'Open only'}
                        </Button>
                        <Button size="sm" onClick={() => setAnchor(todayManila())}>
                            Today
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={() => setAnchor(shiftAnchor(anchor, view, -1))}
                        >
                            Prev
                        </Button>
                        <Button
                            size="sm"
                            variant="plain"
                            onClick={() => setAnchor(shiftAnchor(anchor, view, 1))}
                        >
                            Next
                        </Button>
                        <Button onClick={() => void reload()} loading={loading}>
                            Refresh
                        </Button>
                    </div>
                }
            />

            {error ? (
                <Alert showIcon type="danger" className="mb-4" title="API error">
                    {error}
                </Alert>
            ) : null}

            <AdaptiveCard>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h5>{rangeLabel(view, anchor)}</h5>
                    <p className="text-xs text-gray-500">
                        Time zone: {data?.timeZone ?? 'Asia/Manila'}
                        {data?.truncated ? ' · results truncated' : ''}
                    </p>
                </div>

                {loading && !data ? (
                    <p className="py-8 text-center text-sm text-gray-500">Loading…</p>
                ) : (
                    <div
                        className={
                            view === 'week'
                                ? 'grid grid-cols-1 gap-2 md:grid-cols-7'
                                : 'grid grid-cols-7 gap-1'
                        }
                    >
                        {WEEKDAYS.map((label) => (
                            <div
                                key={label}
                                className="hidden px-1 text-xs font-semibold uppercase text-gray-500 md:block"
                            >
                                {label}
                            </div>
                        ))}
                        {grid.days.map((day) => {
                            const items = byDay.get(day) ?? []
                            const inMonth =
                                view === 'week' || day.slice(0, 7) === anchor.slice(0, 7)
                            return (
                                <div
                                    key={day}
                                    className={`min-h-28 rounded-md border p-2 ${
                                        day === today
                                            ? 'border-primary/50 bg-primary/5'
                                            : 'border-gray-100 dark:border-gray-700'
                                    } ${inMonth ? '' : 'opacity-40'}`}
                                >
                                    <div className="mb-1 flex items-center justify-between">
                                        <span className="text-xs font-semibold tabular-nums heading-text">
                                            {day.slice(8)}
                                        </span>
                                        {items.length > 0 ? (
                                            <StatusBadge tone="info">{items.length}</StatusBadge>
                                        ) : null}
                                    </div>
                                    <ul className="space-y-1">
                                        {items.slice(0, view === 'month' ? 3 : 8).map((item) => (
                                            <li key={item.id}>
                                                <Link
                                                    href={parentHref(item)}
                                                    className="block rounded px-1 py-0.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                                >
                                                    <p className="truncate text-xs font-medium heading-text">
                                                        {item.summary}
                                                    </p>
                                                    <p className="truncate text-[10px] text-gray-500">
                                                        <StatusBadge tone={crmTone(item.dueStatus)}>
                                                            {formatEnumLabel(item.type)}
                                                        </StatusBadge>
                                                        {item.parent
                                                            ? ` · ${item.parent.label}`
                                                            : ''}
                                                    </p>
                                                </Link>
                                            </li>
                                        ))}
                                        {items.length > (view === 'month' ? 3 : 8) ? (
                                            <li className="px-1 text-[10px] text-gray-400">
                                                +{items.length - (view === 'month' ? 3 : 8)} more
                                            </li>
                                        ) : null}
                                    </ul>
                                </div>
                            )
                        })}
                    </div>
                )}
            </AdaptiveCard>
        </PageContainer>
    )
}
