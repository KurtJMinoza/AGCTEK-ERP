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
import CadencePanel from '../components/CadencePanel'
import CrmSelect from '../components/CrmSelect'
import PipelineMetricsPanel from '../components/PipelineMetricsPanel'
import LeadSourcesPanel from '../components/LeadSourcesPanel'
import StalledPanel from '../components/StalledPanel'
import { useCrmCadence } from '../hooks/useCrmCadence'
import { useCrmDashboard } from '../hooks/useCrmDashboard'
import { useCrmLeadSources } from '../hooks/useCrmLeadSources'
import { useCrmPipelineMetrics } from '../hooks/useCrmPipelineMetrics'
import { useCrmStalled } from '../hooks/useCrmStalled'
import { crmDashboardBreadcrumbs } from '../utils/breadcrumbs'
import { CRM_PATHS, crmHref } from '../utils/deepLinks'
import { crmTone, formatEnumLabel } from '../utils/format'
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
    const cadence = useCrmCadence()
    const pipelineMetrics = useCrmPipelineMetrics(days, 'all')
    const stalled = useCrmStalled('all')
    const leadSources = useCrmLeadSources(days, 'all')
    const periodLabel = periodOptions.find((o) => o.value === String(days))?.label ?? ''
    const initialLoad = loading && !data

    return (
        <PageContainer>
            <PageHeader
                title="CRM"
                description="Your next actions first, then org pipeline and customer service. Every number opens the matching list."
                breadcrumbs={crmDashboardBreadcrumbs()}
                actions={
                    <div className="flex items-center gap-2">
                        <Link href={CRM_PATHS.calendar} className="text-sm text-primary">
                            Activity calendar
                        </Link>
                        <CrmSelect
                            className="w-44"
                            options={periodOptions}
                            value={String(days)}
                            onChange={(value) => setDays(Number(value) as DashboardPeriod)}
                        />
                        <Button
                            onClick={() => {
                                void reload()
                                void cadence.reload()
                                void pipelineMetrics.reload()
                                void stalled.reload()
                                void leadSources.reload()
                            }}
                            loading={
                                loading ||
                                cadence.loading ||
                                pipelineMetrics.loading ||
                                stalled.loading ||
                                leadSources.loading
                            }
                        >
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

            <CadencePanel
                data={cadence.data}
                loading={cadence.loading}
                error={cadence.error}
            />

            <PipelineMetricsPanel
                data={pipelineMetrics.data}
                loading={pipelineMetrics.loading}
                error={pipelineMetrics.error}
                periodLabel={periodLabel}
            />

            <StalledPanel
                data={stalled.data}
                loading={stalled.loading}
                error={stalled.error}
            />

            <LeadSourcesPanel
                data={leadSources.data}
                loading={leadSources.loading}
                error={leadSources.error}
                periodLabel={periodLabel}
            />

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
                    <TicketsWidget data={data} />
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
