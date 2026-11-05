'use client'

import { useCallback, useEffect, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    notifyError,
    statusTag,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoOverviewService } from '../services/ficoService'
import type { FicoAuditEntry, FicoOverview } from '../types'

const ROUTE = '/modules/fico/overview'

const dateTime = (value?: string | null) =>
    value
        ? new Date(value).toLocaleString(undefined, {
              year: 'numeric',
              month: 'short',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
          })
        : '—'

const OverviewPage = () => {
    const { companies, companyId, setCompanyId, loading } = useFicoCompanies()
    const [overview, setOverview] = useState<FicoOverview | null>(null)
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        if (!companyId) return
        setBusy(true)
        ficoOverviewService
            .get(companyId)
            .then(setOverview)
            .catch((error) => notifyError(error, 'Unable to load finance overview.'))
            .finally(() => setBusy(false))
    }, [companyId])

    useEffect(() => {
        load()
    }, [load])

    const activityColumns: ColumnDef<FicoAuditEntry>[] = [
        {
            header: 'When',
            accessorKey: 'createdAt',
            cell: ({ row }) => dateTime(row.original.createdAt),
        },
        { header: 'Action', accessorKey: 'action' },
        { header: 'Entity', accessorKey: 'entityType' },
        {
            header: 'Reason',
            accessorKey: 'reason',
            cell: ({ row }) => row.original.reason ?? '—',
        },
    ]

    const metrics = overview
        ? [
              ['Charts of accounts', overview.metrics.charts],
              ['G/L accounts', overview.metrics.accounts],
              ['Posting accounts', overview.metrics.postingAccounts],
              ['Journal documents', overview.metrics.journals],
              ['Fiscal periods', overview.metrics.periods],
              [
                  'Open periods',
                  (overview.metrics.periodsByStatus.OPEN ?? 0) +
                      (overview.metrics.periodsByStatus.RESTRICTED ?? 0),
              ],
          ]
        : []

    return (
        <PageContainer>
            <PageHeader
                title="Finance Overview"
                description="Company accounting configuration, period health and recent finance activity."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <FicoCompanySelect
                        companies={companies}
                        value={companyId}
                        onChange={setCompanyId}
                        loading={loading}
                    />
                }
            />
            {!companyId && !loading ? (
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">
                        No accessible company was found. Ask an administrator for company
                        membership.
                    </p>
                </AdaptiveCard>
            ) : null}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
                {metrics.map(([label, value]) => (
                    <AdaptiveCard key={String(label)}>
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                            {label}
                        </p>
                        <p className="mt-2 text-2xl font-bold heading-text">
                            {busy ? '—' : value}
                        </p>
                    </AdaptiveCard>
                ))}
            </div>

            {overview?.settings ? (
                <AdaptiveCard className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h6 className="font-semibold heading-text">
                                {overview.settings.legalName ||
                                    overview.settings.chartOfAccounts?.name}
                            </h6>
                            <p className="mt-1 text-sm text-gray-500">
                                {overview.settings.baseCurrency} ·{' '}
                                {overview.settings.accountingMethod} ·{' '}
                                {overview.settings.timezone}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            {statusTag(overview.settings.status)}
                            <Button size="sm" onClick={load} loading={busy}>
                                Refresh
                            </Button>
                        </div>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-gray-500">Chart of accounts</dt>
                            <dd className="font-medium">
                                {overview.settings.chartOfAccounts
                                    ? `${overview.settings.chartOfAccounts.code} — ${overview.settings.chartOfAccounts.name}`
                                    : 'Not assigned'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Fiscal year variant</dt>
                            <dd className="font-medium">
                                {overview.settings.fiscalYearVariant
                                    ? `${overview.settings.fiscalYearVariant.code} — ${overview.settings.fiscalYearVariant.name}`
                                    : 'Not assigned'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-gray-500">Posting period variant</dt>
                            <dd className="font-medium">
                                {overview.settings.postingPeriodVariant
                                    ? `${overview.settings.postingPeriodVariant.code} — ${overview.settings.postingPeriodVariant.name}`
                                    : 'Not assigned'}
                            </dd>
                        </div>
                    </dl>
                </AdaptiveCard>
            ) : null}

            {overview?.warnings.length ? (
                <AdaptiveCard className="mt-4">
                    <h6 className="mb-3 font-semibold heading-text">Attention</h6>
                    <ul className="space-y-2">
                        {overview.warnings.map((warning) => (
                            <li
                                key={warning.code}
                                className={`rounded-lg px-3 py-2 text-sm ${
                                    warning.severity === 'error'
                                        ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                                        : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                                }`}
                            >
                                {warning.message}
                            </li>
                        ))}
                    </ul>
                </AdaptiveCard>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <AdaptiveCard>
                    <h6 className="mb-3 font-semibold heading-text">
                        Periods open for posting
                    </h6>
                    {overview?.openPeriods.length ? (
                        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                            {overview.openPeriods.map((period) => (
                                <li
                                    key={period.id}
                                    className="flex items-center justify-between py-2 text-sm"
                                >
                                    <span>
                                        {String(period.periodNumber).padStart(2, '0')}/
                                        {period.fiscalYear} · {period.name}
                                    </span>
                                    {statusTag(period.status)}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No period is open for posting.
                        </p>
                    )}
                </AdaptiveCard>

                <AdaptiveCard>
                    <h6 className="mb-3 font-semibold heading-text">
                        Recent finance activity
                    </h6>
                    <DataTable
                        columns={activityColumns}
                        data={overview?.recentActivity ?? []}
                        loading={busy}
                        hidePagination
                        noData={!overview?.recentActivity.length}
                        getRowId={(row) => row.id}
                    />
                </AdaptiveCard>
            </div>
        </PageContainer>
    )
}

export default OverviewPage
