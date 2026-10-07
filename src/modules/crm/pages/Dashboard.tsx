'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import Progress from '@/components/ui/Progress'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import CrmSelect from '../components/CrmSelect'
import { useCrmDashboard } from '../hooks/useCrmDashboard'
import { crmDashboardBreadcrumbs } from '../utils/breadcrumbs'
import { CRM_PATHS, crmHref } from '../utils/deepLinks'
import { crmTone, formatEnumLabel, formatMoney } from '../utils/format'
import { DASHBOARD_PERIODS, type CrmDashboard, type DashboardPeriod } from '../types'

const periodOptions = DASHBOARD_PERIODS.map((days) => ({
    value: String(days),
    label: days === 365 ? 'Last 12 months' : `Last ${days} days`,
}))

const PRIORITY_BAR: Record<string, string> = {
    URGENT: 'bg-rose-500',
    HIGH: 'bg-amber-500',
    MEDIUM: 'bg-blue-500',
    LOW: 'bg-gray-400',
}

const pct = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function WidgetCard({
    title,
    subtitle,
    action,
    children,
}: {
    title: string
    subtitle?: string
    action?: ReactNode
    children: ReactNode
}) {
    return (
        <AdaptiveCard className="h-full">
            <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                    <h5>{title}</h5>
                    {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
                </div>
                {action}
            </div>
            {children}
        </AdaptiveCard>
    )
}

/** One linked metric row: the number always opens the list filtered to exactly those records. */
function LinkRow({ href, label, value }: { href: string; label: ReactNode; value: ReactNode }) {
    return (
        <Link
            href={href}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
        >
            <span className="min-w-0 truncate">{label}</span>
            <span className="shrink-0 font-semibold tabular-nums heading-text">{value}</span>
        </Link>
    )
}

const Empty = ({ children }: { children: ReactNode }) => (
    <p className="py-6 text-center text-sm text-gray-500">{children}</p>
)

function PipelineWidget({ data }: { data: CrmDashboard }) {
    const { pipeline } = data
    return (
        <WidgetCard
            title="Weighted pipeline"
            subtitle="Open opportunities · amount × probability, per currency"
            action={
                <Link
                    href={crmHref(CRM_PATHS.opportunities, { view: 'board' })}
                    className="text-sm text-primary"
                >
                    Open board
                </Link>
            }
        >
            {pipeline.totals.length === 0 ? (
                <Empty>No open opportunities.</Empty>
            ) : (
                <>
                    <div className="mb-3 flex flex-wrap gap-x-6 gap-y-1">
                        {pipeline.totals.map((total) => (
                            <div key={total.currency}>
                                <p className="text-2xl font-bold tabular-nums heading-text">
                                    {formatMoney(Number(total.weightedAmount), total.currency)}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {plural(total.count, 'opportunity', 'opportunities')} ·{' '}
                                    {formatMoney(Number(total.amount), total.currency)} open
                                </p>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col">
                        {pipeline.stages.map((stage) => (
                            <LinkRow
                                key={stage.stage}
                                href={crmHref(CRM_PATHS.opportunities, { stage: stage.stage })}
                                label={
                                    <span className="flex items-center gap-2">
                                        <StatusBadge tone={crmTone(stage.stage)}>
                                            {formatEnumLabel(stage.stage)}
                                        </StatusBadge>
                                        <span className="text-xs text-gray-500">{stage.count}</span>
                                    </span>
                                }
                                value={
                                    stage.byCurrency.length === 0
                                        ? '—'
                                        : stage.byCurrency
                                              .map((c) => formatMoney(Number(c.weightedAmount), c.currency))
                                              .join(' · ')
                                }
                            />
                        ))}
                    </div>
                </>
            )}
        </WidgetCard>
    )
}

function TicketsWidget({ data }: { data: CrmDashboard }) {
    const { tickets } = data
    return (
        <WidgetCard
            title="Tickets by priority"
            subtitle="Default queue · Open + Waiting customer"
            action={
                <Link href={CRM_PATHS.tickets} className="text-sm text-primary">
                    Open queue
                </Link>
            }
        >
            {tickets.queueTotal === 0 ? (
                <Empty>The ticket queue is empty.</Empty>
            ) : (
                <>
                    <div className="flex flex-col gap-1">
                        {tickets.byPriority.map((row) => (
                            <Link
                                key={row.priority}
                                href={crmHref(CRM_PATHS.tickets, { priority: row.priority })}
                                className="rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                            >
                                <div className="flex items-center justify-between text-sm">
                                    <span>{formatEnumLabel(row.priority)}</span>
                                    <span className="font-semibold tabular-nums heading-text">
                                        {row.count}
                                    </span>
                                </div>
                                <Progress
                                    percent={pct(row.count, tickets.queueTotal)}
                                    showInfo={false}
                                    size="sm"
                                    customColorClass={PRIORITY_BAR[row.priority]}
                                />
                            </Link>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 dark:border-gray-700">
                        <LinkRow
                            href={crmHref(CRM_PATHS.tickets, { status: 'OPEN' })}
                            label="Open"
                            value={tickets.byStatus.OPEN}
                        />
                        <LinkRow
                            href={crmHref(CRM_PATHS.tickets, { status: 'WAITING_CUSTOMER' })}
                            label="Waiting customer"
                            value={tickets.byStatus.WAITING_CUSTOMER}
                        />
                    </div>
                </>
            )}
        </WidgetCard>
    )
}

function WinLossWidget({ data, periodLabel }: { data: CrmDashboard; periodLabel: string }) {
    const { winLoss, periodFrom } = data
    const closedFrom = periodFrom
    const closed = winLoss.won.count + winLoss.lost.count
    return (
        <WidgetCard title="Win / loss" subtitle={`Closed in the ${periodLabel.toLowerCase()}`}>
            {closed === 0 ? (
                <Empty>No opportunities closed in this period.</Empty>
            ) : (
                <>
                    <div className="mb-3 flex items-end gap-6">
                        <div>
                            <p className="text-2xl font-bold tabular-nums heading-text">
                                {winLoss.winRate === null ? '—' : `${winLoss.winRate}%`}
                            </p>
                            <p className="text-xs text-gray-500">Win rate</p>
                        </div>
                        <div className="text-xs text-gray-500">
                            {winLoss.won.byCurrency.map((c) => (
                                <p key={c.currency}>
                                    Won {formatMoney(Number(c.amount), c.currency)}
                                </p>
                            ))}
                        </div>
                    </div>
                    <LinkRow
                        href={crmHref(CRM_PATHS.opportunities, { stage: 'CLOSED_WON', closedFrom })}
                        label={<StatusBadge tone="success">Won</StatusBadge>}
                        value={winLoss.won.count}
                    />
                    <LinkRow
                        href={crmHref(CRM_PATHS.opportunities, { stage: 'CLOSED_LOST', closedFrom })}
                        label={<StatusBadge tone="danger">Lost</StatusBadge>}
                        value={winLoss.lost.count}
                    />
                    {winLoss.lost.byReason.length > 0 ? (
                        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
                            <p className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">
                                Lost by reason
                            </p>
                            {winLoss.lost.byReason.map((row) => (
                                <Link
                                    key={row.reason}
                                    href={crmHref(CRM_PATHS.opportunities, {
                                        stage: 'CLOSED_LOST',
                                        lostReason: row.reason,
                                        closedFrom,
                                    })}
                                    className="block rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <div className="flex items-center justify-between text-sm">
                                        <span>{formatEnumLabel(row.reason)}</span>
                                        <span className="font-semibold tabular-nums heading-text">
                                            {row.count}
                                        </span>
                                    </div>
                                    <Progress
                                        percent={pct(row.count, winLoss.lost.count)}
                                        showInfo={false}
                                        size="sm"
                                        customColorClass="bg-rose-400"
                                    />
                                </Link>
                            ))}
                        </div>
                    ) : null}
                </>
            )}
        </WidgetCard>
    )
}

function ConversionWidget({ data, periodLabel }: { data: CrmDashboard; periodLabel: string }) {
    const { conversion, periodFrom } = data
    const createdFrom = periodFrom
    const leadsHref = (status?: string) => crmHref(CRM_PATHS.leads, { status, createdFrom })
    return (
        <WidgetCard
            title="Lead conversion"
            subtitle={`Leads created in the ${periodLabel.toLowerCase()}, by current status`}
        >
            {conversion.leadsCreated === 0 ? (
                <Empty>No leads created in this period.</Empty>
            ) : (
                <>
                    <div className="mb-3">
                        <p className="text-2xl font-bold tabular-nums heading-text">
                            {conversion.conversionRate === null ? '—' : `${conversion.conversionRate}%`}
                        </p>
                        <p className="text-xs text-gray-500">
                            {conversion.converted} of {plural(conversion.leadsCreated, 'lead')} converted
                        </p>
                    </div>
                    <LinkRow href={leadsHref()} label="Created" value={conversion.leadsCreated} />
                    <LinkRow
                        href={leadsHref('CONVERTED')}
                        label={<StatusBadge tone="success">Converted</StatusBadge>}
                        value={conversion.converted}
                    />
                    {(['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'LOST'] as const).map((status) => (
                        <LinkRow
                            key={status}
                            href={leadsHref(status)}
                            label={
                                <StatusBadge tone={crmTone(status)}>{formatEnumLabel(status)}</StatusBadge>
                            }
                            value={conversion.byStatus[status]}
                        />
                    ))}
                </>
            )}
        </WidgetCard>
    )
}

export default function CrmDashboardPage() {
    const [days, setDays] = useState<DashboardPeriod>(90)
    const { data, loading, error, reload } = useCrmDashboard(days)
    const periodLabel = periodOptions.find((o) => o.value === String(days))?.label ?? ''
    const initialLoad = loading && !data

    return (
        <PageContainer>
            <PageHeader
                title="CRM"
                description="Leads, pipeline and customer service for SD customers. Every number opens the matching list."
                breadcrumbs={crmDashboardBreadcrumbs()}
                actions={
                    <div className="flex items-center gap-2">
                        <CrmSelect
                            className="w-44"
                            options={periodOptions}
                            value={String(days)}
                            onChange={(value) => setDays(Number(value) as DashboardPeriod)}
                        />
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

            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="New leads"
                    value={data?.leads.new ?? 0}
                    tone="info"
                    href={crmHref(CRM_PATHS.leads, { status: 'NEW' })}
                    loading={initialLoad}
                />
                <StatCard
                    label="Qualified leads"
                    value={data?.leads.qualified ?? 0}
                    tone="success"
                    href={crmHref(CRM_PATHS.leads, { status: 'QUALIFIED' })}
                    loading={initialLoad}
                />
                <StatCard
                    label="Opportunities with overdue activities"
                    value={data?.overdue.opportunities.records ?? 0}
                    tone={data?.overdue.opportunities.records ? 'danger' : 'default'}
                    href={crmHref(CRM_PATHS.opportunities, { activity: 'OVERDUE' })}
                    loading={initialLoad}
                    badge={
                        data?.overdue.opportunities.activities
                            ? {
                                  tone: 'danger',
                                  label: `${plural(data.overdue.opportunities.activities, 'activity', 'activities')} overdue`,
                              }
                            : undefined
                    }
                />
                <StatCard
                    label="Tickets with overdue activities"
                    value={data?.overdue.tickets.records ?? 0}
                    tone={data?.overdue.tickets.records ? 'danger' : 'default'}
                    href={crmHref(CRM_PATHS.tickets, { queue: 'ALL', activity: 'OVERDUE' })}
                    loading={initialLoad}
                    badge={
                        data?.overdue.tickets.activities
                            ? {
                                  tone: 'danger',
                                  label: `${plural(data.overdue.tickets.activities, 'activity', 'activities')} overdue`,
                              }
                            : undefined
                    }
                />
            </div>

            {data ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <PipelineWidget data={data} />
                    <TicketsWidget data={data} />
                    <WinLossWidget data={data} periodLabel={periodLabel} />
                    <ConversionWidget data={data} periodLabel={periodLabel} />
                </div>
            ) : (
                <AdaptiveCard>
                    <Empty>{loading ? 'Loading…' : 'Dashboard unavailable.'}</Empty>
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}
