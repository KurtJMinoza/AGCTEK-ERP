'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { notifyError } from '../components/FicoCompanySelect'
import {
    FicoStatusCell,
    FICO_PERIOD_STATUS,
} from '../components/ficoTableUi'
import { ficoPeriodService } from '../services/ficoService'
import type { FicoPeriodDetail, FicoPeriodHistoryEntry } from '../types'

const ROUTE = '/modules/fico/fiscal-periods'

function formatDateTime(value: string) {
    return new Date(value).toLocaleString()
}

const PeriodHistoryPage = () => {
    const params = useParams()
    const periodId = String(params?.id ?? '')
    const [period, setPeriod] = useState<FicoPeriodDetail | null>(null)
    const [history, setHistory] = useState<FicoPeriodHistoryEntry[]>([])
    const [loading, setLoading] = useState(true)

    const load = useCallback(async () => {
        if (!periodId) return
        setLoading(true)
        try {
            const [detail, entries] = await Promise.all([
                ficoPeriodService.get(periodId),
                ficoPeriodService.history(periodId),
            ])
            setPeriod(detail)
            setHistory(entries)
        } catch (error) {
            notifyError(error, 'Unable to load the period history.')
        } finally {
            setLoading(false)
        }
    }, [periodId])

    useEffect(() => {
        load()
    }, [load])

    const periodLabel = period
        ? `${String(period.periodNumber).padStart(2, '0')}/${period.fiscalYear}`
        : 'Accounting period'

    return (
        <PageContainer>
            <PageHeader
                title={`Period history — ${periodLabel}`}
                description="Append-only audit trail of every accounting period status change."
                breadcrumbs={buildErpBreadcrumbs(`${ROUTE}/${periodId}/history`, {
                    detailLabel: period?.name || periodLabel,
                })}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href={`${ROUTE}/${periodId}`}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            Period details
                        </Link>
                        <Link
                            href={ROUTE}
                            className="text-sm font-medium text-primary hover:underline"
                        >
                            All periods
                        </Link>
                        <Button size="sm" onClick={load} loading={loading}>
                            Refresh
                        </Button>
                    </div>
                }
            />

            {period ? (
                <AdaptiveCard>
                    <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-gray-500">Current status</span>
                        <FicoStatusCell status={period.status} map={FICO_PERIOD_STATUS} />
                        <span className="text-gray-500">
                            {period.startDate.slice(0, 10)} →{' '}
                            {period.endDate.slice(0, 10)}
                        </span>
                        <span className="text-gray-500">
                            {period.company
                                ? `${period.company.code} — ${period.company.name}`
                                : period.companyId}
                        </span>
                    </div>

                    {history.length ? (
                        <ol className="relative space-y-4 border-l border-gray-200 pl-6 dark:border-gray-700">
                            {history.map((entry) => (
                                <li key={entry.id} className="relative">
                                    <span className="absolute -left-[31px] top-2 h-2.5 w-2.5 rounded-full bg-primary" />
                                    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-sm font-semibold">
                                                    {entry.action}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {entry.fromStatus ?? '—'} →{' '}
                                                    {entry.toStatus ?? '—'}
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-500">
                                                {formatDateTime(
                                                    entry.createdAt,
                                                )}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-xs text-gray-500">
                                            Actor: {entry.actorId ?? 'System'}
                                        </p>
                                        {entry.reason ? (
                                            <p className="mt-2 text-sm">
                                                {entry.reason}
                                            </p>
                                        ) : (
                                            <p className="mt-2 text-sm text-gray-400">
                                                No reason was recorded.
                                            </p>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    ) : (
                        <p className="text-sm text-gray-500">
                            No status history has been recorded for this period.
                        </p>
                    )}
                </AdaptiveCard>
            ) : (
                <AdaptiveCard>
                    <p className="text-sm text-gray-500">
                        {loading
                            ? 'Loading period history…'
                            : 'The period history could not be loaded.'}
                    </p>
                </AdaptiveCard>
            )}
        </PageContainer>
    )
}

export default PeriodHistoryPage
