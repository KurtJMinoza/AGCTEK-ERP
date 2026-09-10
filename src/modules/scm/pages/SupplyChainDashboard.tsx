'use client'

import Link from 'next/link'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Chart from '@/components/shared/Chart'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { useScmDashboardSummary } from '../hooks/useScmDashboardSummary'
import { scmPageBreadcrumbs } from '../utils/breadcrumbs'
import { formatStatusLabel } from '../utils/status'
import type { ScmDashboardSummary } from '../types'

function StatCell({
    label,
    value,
    hint,
}: {
    label: string
    value: string | number
    hint?: string
}) {
    return (
        <div className="rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {label}
            </p>
            <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                {value}
            </p>
            {hint ? (
                <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
            ) : null}
        </div>
    )
}

function statusEntries(
    byStatus: Record<string, number>,
): Array<{ label: string; count: number }> {
    return Object.entries(byStatus)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
            label: formatStatusLabel(status),
            count,
        }))
}

function StatusDonut({
    title,
    byStatus,
    totalLabel,
}: {
    title: string
    byStatus: Record<string, number>
    totalLabel: string
}) {
    const entries = statusEntries(byStatus)
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)
    const labels = entries.map((e) => e.label)
    const series = entries.map((e) => e.count)

    return (
        <AdaptiveCard>
            <h5 className="mb-1">{title}</h5>
            <p className="mb-3 text-sm text-gray-500">{totalLabel}</p>
            {total === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">
                    No records yet.
                </p>
            ) : (
                <Chart
                    type="donut"
                    height={260}
                    series={series}
                    customOptions={{
                        labels,
                        legend: { position: 'bottom' },
                    }}
                    donutTitle="total"
                    donutText={String(total)}
                />
            )}
        </AdaptiveCard>
    )
}

function IssuesList({
    issues,
}: {
    issues: ScmDashboardSummary['recentIssues']
}) {
    if (issues.length === 0) {
        return (
            <p className="py-6 text-center text-sm text-gray-500">
                No recent failed stops or late deliveries.
            </p>
        )
    }

    return (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {issues.map((issue) => (
                <li
                    key={`${issue.kind}-${issue.id}`}
                    className="flex items-start justify-between gap-3 py-3"
                >
                    <div className="min-w-0">
                        <div className="mb-1">
                            <StatusBadge
                                tone={
                                    issue.kind === 'LATE_DELIVERY'
                                        ? 'warning'
                                        : 'danger'
                                }
                            >
                                {issue.kind === 'LATE_DELIVERY'
                                    ? 'Late delivery'
                                    : 'Stop failed'}
                            </StatusBadge>
                        </div>
                        <p className="truncate text-sm text-gray-800 dark:text-gray-100">
                            {issue.label}
                        </p>
                    </div>
                    <p className="shrink-0 text-xs text-gray-400">
                        {new Date(issue.at).toLocaleString()}
                    </p>
                </li>
            ))}
        </ul>
    )
}

export default function SupplyChainDashboardPage() {
    const { summary, loading, error, reload } = useScmDashboardSummary()

    const onTimeTotal =
        (summary?.shipments.deliveredOnTime ?? 0) +
        (summary?.shipments.deliveredLate ?? 0)
    const onTimePct =
        onTimeTotal > 0 && summary
            ? Math.round(
                  (summary.shipments.deliveredOnTime / onTimeTotal) * 1000,
              ) / 10
            : null

    return (
        <PageContainer>
            <PageHeader
                title="Supply Chain Dashboard"
                description="Transportation ops KPIs — fleet utilization, shipments, trips. OTIF deferred until MM promise dates."
                breadcrumbs={scmPageBreadcrumbs(
                    'Supply Chain Dashboard',
                    'reports',
                )}
                actions={
                    <Button
                        size="sm"
                        loading={loading}
                        onClick={() => void reload()}
                    >
                        Refresh
                    </Button>
                }
            />

            <Alert showIcon type="info" className="mb-4" title="Ops KPIs now">
                Built from live Shipment / Trip / Vehicle / Maintenance data.
                Full OTIF and demand analytics stay deferred (see SCM progress
                gantt).
            </Alert>

            {error && (
                <Alert showIcon type="danger" className="mb-4">
                    {error}
                </Alert>
            )}

            <AdaptiveCard bodyClass="py-3 mb-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                    <StatCell
                        label="Fleet utilization"
                        value={
                            loading
                                ? '…'
                                : `${summary?.fleet.utilizationPct ?? 0}%`
                        }
                        hint="In transit / fleet"
                    />
                    <StatCell
                        label="Available units"
                        value={loading ? '…' : (summary?.fleet.available ?? 0)}
                    />
                    <StatCell
                        label="In transit"
                        value={
                            loading
                                ? '…'
                                : (summary?.trips.inTransitCount ?? 0)
                        }
                        hint="Active trips"
                    />
                    <StatCell
                        label="Open shipments"
                        value={
                            loading ? '…' : (summary?.shipments.openCount ?? 0)
                        }
                    />
                    <StatCell
                        label="Stops done today"
                        value={
                            loading
                                ? '…'
                                : (summary?.trips.stopsCompletedToday ?? 0)
                        }
                    />
                    <StatCell
                        label="Routing blocked"
                        value={
                            loading
                                ? '…'
                                : (summary?.fleet.routingBlocked ?? 0)
                        }
                        hint="Maintenance / block"
                    />
                </div>
            </AdaptiveCard>

            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
                <StatusDonut
                    title="Shipments by status"
                    byStatus={summary?.shipments.byStatus ?? {}}
                    totalLabel={`${summary?.shipments.openCount ?? 0} open (excl. delivered/cancelled)`}
                />
                <StatusDonut
                    title="Trips by status"
                    byStatus={summary?.trips.byStatus ?? {}}
                    totalLabel={
                        summary?.trips.avgDurationHours != null
                            ? `Avg completed duration ${summary.trips.avgDurationHours}h`
                            : 'Avg duration —'
                    }
                />
                <StatusDonut
                    title="Fleet by status"
                    byStatus={summary?.fleet.byStatus ?? {}}
                    totalLabel={`${summary?.fleet.withRecentGps ?? 0} with GPS in last 30 min`}
                />
            </div>

            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <AdaptiveCard>
                    <h5 className="mb-1">On-time proxy</h5>
                    <p className="mb-3 text-sm text-gray-500">
                        {summary?.shipments.onTimeNote ??
                            'Requires latestDeliveryAt on delivered shipments.'}
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                        <StatCell
                            label="On time"
                            value={
                                loading
                                    ? '…'
                                    : (summary?.shipments.deliveredOnTime ?? 0)
                            }
                        />
                        <StatCell
                            label="Late"
                            value={
                                loading
                                    ? '…'
                                    : (summary?.shipments.deliveredLate ?? 0)
                            }
                        />
                        <StatCell
                            label="Rate"
                            value={
                                loading
                                    ? '…'
                                    : onTimePct != null
                                      ? `${onTimePct}%`
                                      : '—'
                            }
                        />
                    </div>
                </AdaptiveCard>

                <AdaptiveCard>
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <h5>Recent issues</h5>
                        <StatusBadge tone="default">
                            {summary?.recentIssues.length ?? 0}
                        </StatusBadge>
                    </div>
                    <IssuesList issues={summary?.recentIssues ?? []} />
                </AdaptiveCard>
            </div>

            <AdaptiveCard>
                <h5 className="mb-3">Maintenance</h5>
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCell
                        label="Open"
                        value={
                            loading
                                ? '…'
                                : (summary?.maintenance.openCount ?? 0)
                        }
                    />
                    <StatCell
                        label="Scheduled"
                        value={
                            loading
                                ? '…'
                                : (summary?.maintenance.byStatus.SCHEDULED ?? 0)
                        }
                    />
                    <StatCell
                        label="In progress"
                        value={
                            loading
                                ? '…'
                                : (summary?.maintenance.byStatus.IN_PROGRESS ??
                                  0)
                        }
                    />
                    <StatCell
                        label="Blocking routing"
                        value={
                            loading
                                ? '…'
                                : (summary?.maintenance.blockingRouting ?? 0)
                        }
                    />
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link href="/scm">
                        <Button variant="solid" size="sm">
                            Transportation
                        </Button>
                    </Link>
                    <Link href="/scm/tracking">
                        <Button size="sm">Live Tracking</Button>
                    </Link>
                    <Link href="/scm/shipments">
                        <Button size="sm">Shipments</Button>
                    </Link>
                    <Link href="/scm/maintenance">
                        <Button size="sm">Maintenance</Button>
                    </Link>
                </div>
            </AdaptiveCard>
        </PageContainer>
    )
}
