'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Alert from '@/components/ui/Alert'
import Button from '@/components/ui/Button'
import type { ColumnDef } from '../FicoResponsiveTable'
import {
    FICO_RECORD_STATUS,
    FicoTwoLineCell,
    formatFicoDate,
    ficoStatusTone,
} from '../ficoTableUi'
import FicoLedgerTable from '../workbench/FicoLedgerTable'
import { FicoTableToolbar } from '../workbench/FicoWorkbenchChrome'
import { ficoOverviewService } from '../../services/ficoService'
import { notifyError } from '../FicoCompanySelect'
import type { FicoAuditEntry, FicoOverview, FicoPeriod } from '../../types'
import {
    HiOutlineBookOpen,
    HiOutlineCalendar,
    HiOutlineClipboardList,
    HiOutlineCollection,
    HiOutlineCog,
    HiOutlineDocumentText,
    HiOutlineHashtag,
    HiOutlineLibrary,
    HiOutlineLightningBolt,
    HiOutlineRefresh,
    HiOutlineShieldCheck,
} from 'react-icons/hi'

const PERIOD_STATUS_MAP: Record<
    string,
    'default' | 'success' | 'warning' | 'danger' | 'info'
> = {
    FUTURE: 'default',
    OPEN: 'success',
    RESTRICTED: 'warning',
    CLOSED: 'info',
    LOCKED: 'danger',
}

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

type Props = {
    companyId: string
}

export default function FinanceOverviewWorkbench({ companyId }: Props) {
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

    const metrics = overview?.metrics
    const openPostingPeriods =
        (metrics?.periodsByStatus.OPEN ?? 0) +
        (metrics?.periodsByStatus.RESTRICTED ?? 0)

    const periodStatusRows = useMemo(() => {
        if (!metrics?.periodsByStatus) return []
        const order = ['OPEN', 'RESTRICTED', 'FUTURE', 'CLOSED', 'LOCKED'] as const
        return order
            .filter((key) => (metrics.periodsByStatus[key] ?? 0) > 0)
            .map((key) => ({
                status: key,
                count: metrics.periodsByStatus[key] ?? 0,
            }))
    }, [metrics])

    const activityColumns = useMemo<ColumnDef<FicoAuditEntry>[]>(
        () => [
            {
                header: 'When',
                size: 160,
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm tabular-nums text-gray-700 dark:text-gray-300">
                        {dateTime(row.original.createdAt)}
                    </span>
                ),
            },
            {
                header: 'Action',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.action.replace(/_/g, ' ')}
                        secondary={row.original.reason ?? undefined}
                    />
                ),
            },
            {
                header: 'Entity',
                cell: ({ row }) => (
                    <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                        {row.original.entityType}
                    </span>
                ),
            },
        ],
        [],
    )

    const periodColumns = useMemo<ColumnDef<FicoPeriod>[]>(
        () => [
            {
                header: 'Period',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={`P${String(row.original.periodNumber).padStart(2, '0')} · FY${row.original.fiscalYear}`}
                        secondary={row.original.name}
                    />
                ),
            },
            {
                header: 'Range',
                cell: ({ row }) => (
                    <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">
                        {formatFicoDate(row.original.startDate)} –{' '}
                        {formatFicoDate(row.original.endDate)}
                    </span>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        status={row.original.status}
                        tone={ficoStatusTone(row.original.status, PERIOD_STATUS_MAP)}
                    />
                ),
            },
            {
                header: 'Postings',
                meta: { className: '!text-right' },
                cell: ({ row }) => (
                    <span className="block text-right text-sm tabular-nums">
                        {row.original._count?.journalEntries?.toLocaleString() ?? '—'}
                    </span>
                ),
            },
        ],
        [],
    )

    const quickLinks = [
        {
            label: 'Journal entries',
            href: '/modules/fico/journal-entries',
            icon: <HiOutlineDocumentText />,
        },
        {
            label: 'General ledger',
            href: '/modules/fico/general-ledger',
            icon: <HiOutlineBookOpen />,
        },
        {
            label: 'Fiscal periods',
            href: '/modules/fico/fiscal-periods',
            icon: <HiOutlineCalendar />,
        },
        {
            label: 'Company settings',
            href: '/modules/fico/company-accounting-settings',
            icon: <HiOutlineCog />,
        },
    ]

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                <StatCard
                    label="Charts of accounts"
                    value={metrics?.charts?.toLocaleString() ?? '—'}
                    icon={<HiOutlineLibrary />}
                    loading={busy && !overview}
                    tone="info"
                />
                <StatCard
                    label="G/L accounts"
                    value={metrics?.accounts?.toLocaleString() ?? '—'}
                    icon={<HiOutlineHashtag />}
                    loading={busy && !overview}
                />
                <StatCard
                    label="Posting accounts"
                    value={metrics?.postingAccounts?.toLocaleString() ?? '—'}
                    icon={<HiOutlineShieldCheck />}
                    loading={busy && !overview}
                    tone="success"
                />
                <StatCard
                    label="Journal documents"
                    value={metrics?.journals?.toLocaleString() ?? '—'}
                    icon={<HiOutlineClipboardList />}
                    loading={busy && !overview}
                    href="/modules/fico/journal-entries"
                />
                <StatCard
                    label="Fiscal periods"
                    value={metrics?.periods?.toLocaleString() ?? '—'}
                    icon={<HiOutlineCalendar />}
                    loading={busy && !overview}
                    href="/modules/fico/fiscal-periods"
                />
                <StatCard
                    label="Open for posting"
                    value={openPostingPeriods.toLocaleString()}
                    icon={<HiOutlineLightningBolt />}
                    loading={busy && !overview}
                    tone={openPostingPeriods > 0 ? 'success' : 'warning'}
                    badge={
                        openPostingPeriods > 0
                            ? { tone: 'success', label: 'Posting allowed' }
                            : { tone: 'warning', label: 'No open period' }
                    }
                />
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {quickLinks.map((link) => (
                    <StatCard
                        key={link.href}
                        label={link.label}
                        value="View"
                        icon={link.icon}
                        href={link.href}
                        tone="default"
                        size="lg"
                    />
                ))}
            </div>

            {overview?.settings ? (
                <AdaptiveCard bodyClass="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-semibold heading-text">
                                    {overview.settings.legalName ||
                                        overview.settings.chartOfAccounts?.name ||
                                        'Company accounting'}
                                </h2>
                                <StatusBadge
                                    status={overview.settings.status}
                                    tone={
                                        FICO_RECORD_STATUS[overview.settings.status] ??
                                        'default'
                                    }
                                />
                            </div>
                            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                {overview.settings.baseCurrency} ·{' '}
                                {overview.settings.accountingMethod} ·{' '}
                                {overview.settings.timezone}
                            </p>
                            <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                        Chart of accounts
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                                        {overview.settings.chartOfAccounts
                                            ? `${overview.settings.chartOfAccounts.code} — ${overview.settings.chartOfAccounts.name}`
                                            : 'Not assigned'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                        Fiscal year variant
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                                        {overview.settings.fiscalYearVariant
                                            ? `${overview.settings.fiscalYearVariant.code} — ${overview.settings.fiscalYearVariant.name}`
                                            : 'Not assigned'}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                        Posting period variant
                                    </dt>
                                    <dd className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                                        {overview.settings.postingPeriodVariant
                                            ? `${overview.settings.postingPeriodVariant.code} — ${overview.settings.postingPeriodVariant.name}`
                                            : 'Not assigned'}
                                    </dd>
                                </div>
                            </dl>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                            <Link href="/modules/fico/gl-accounts">
                                <Button size="sm" variant="plain">
                                    G/L accounts
                                </Button>
                            </Link>
                            <Link href="/modules/fico/accounting-events">
                                <Button size="sm" variant="plain">
                                    Accounting events
                                </Button>
                            </Link>
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlineRefresh />}
                                loading={busy}
                                onClick={load}
                            >
                                Refresh
                            </Button>
                        </div>
                    </div>
                </AdaptiveCard>
            ) : null}

            {overview?.warnings.length ? (
                <Alert showIcon type="warning">
                    <ul className="list-inside list-disc space-y-1 text-sm">
                        {overview.warnings.map((warning) => (
                            <li
                                key={warning.code}
                                className={
                                    warning.severity === 'error'
                                        ? 'text-red-700 dark:text-red-300'
                                        : undefined
                                }
                            >
                                {warning.message}
                            </li>
                        ))}
                    </ul>
                </Alert>
            ) : null}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <div className="xl:col-span-2">
                    <AdaptiveCard bodyClass="p-4 sm:p-5">
                        <FicoTableToolbar
                            title="Period health"
                            description="Fiscal period distribution and posting windows."
                        />
                        {periodStatusRows.length ? (
                            <ul className="mb-4 space-y-2">
                                {periodStatusRows.map((row) => (
                                    <li
                                        key={row.status}
                                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800"
                                    >
                                        <div className="flex items-center gap-2">
                                            <StatusBadge
                                                status={row.status}
                                                tone={ficoStatusTone(
                                                    row.status,
                                                    PERIOD_STATUS_MAP,
                                                )}
                                            />
                                        </div>
                                        <span className="font-semibold tabular-nums heading-text">
                                            {row.count.toLocaleString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mb-4 text-sm text-gray-500">
                                No fiscal periods are configured yet.
                            </p>
                        )}
                        <Link
                            href="/modules/fico/fiscal-periods"
                            className="text-xs font-medium text-primary hover:underline"
                        >
                            Manage fiscal periods →
                        </Link>
                    </AdaptiveCard>
                </div>

                <div className="xl:col-span-3">
                    <FicoLedgerTable
                        title="Periods open for posting"
                        description="Periods where journals may be posted or are restricted."
                        columns={periodColumns}
                        data={overview?.openPeriods ?? []}
                        loading={busy}
                        noData={!busy && !(overview?.openPeriods.length ?? 0)}
                        hidePagination
                        tableMinWidthClass="min-w-[640px]"
                    />
                </div>
            </div>

            <FicoLedgerTable
                title="Recent finance activity"
                description="Latest configuration and posting audit events for this company."
                toolbar={
                    <Link href="/modules/fico/accounting-events">
                        <Button size="sm" variant="plain" icon={<HiOutlineCollection />}>
                            All events
                        </Button>
                    </Link>
                }
                columns={activityColumns}
                data={overview?.recentActivity ?? []}
                loading={busy}
                noData={!busy && !(overview?.recentActivity.length ?? 0)}
                hidePagination
                tableMinWidthClass="min-w-[720px]"
            />
        </div>
    )
}