'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import { HiOutlineRefresh } from 'react-icons/hi'
import {
    FicoCompanySelect,
    notifyError,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import { FicoStatusCell } from '../components/ficoTableUi'
import type { FicoBadgeTone } from '../components/ficoTableUi'
import { ficoPeriodClosingService, ficoPeriodService } from '../services/ficoService'
import type { FicoClosingCheck, FicoPeriod, FicoPeriodClosingReadiness } from '../types'

const ROUTE = '/modules/fico/period-closing'

const CLOSING_LEVEL_MAP: Record<string, 'danger' | 'warning' | 'success' | 'default'> = {
    blocking: 'danger',
    warning: 'warning',
    completed: 'success',
    not_applicable: 'default',
}

const PeriodClosingPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [periods, setPeriods] = useState<FicoPeriod[]>([])
    const [periodId, setPeriodId] = useState('')
    const [loading, setLoading] = useState(false)
    const [readiness, setReadiness] = useState<FicoPeriodClosingReadiness | null>(
        null,
    )

    const loadPeriods = useCallback(() => {
        if (!companyId) return
        ficoPeriodService
            .list({ companyId })
            .then((rows) => {
                setPeriods(rows)
                const open = rows.find((p) => p.status === 'OPEN') ?? rows[0]
                setPeriodId((current) => current || open?.id || '')
            })
            .catch((error) => notifyError(error, 'Unable to load periods.'))
    }, [companyId])

    const loadReadiness = useCallback(() => {
        if (!companyId || !periodId) return
        setLoading(true)
        ficoPeriodClosingService
            .readiness({ companyId, fiscalPeriodId: periodId })
            .then(setReadiness)
            .catch((error) =>
                notifyError(error, 'Unable to evaluate closing readiness.'),
            )
            .finally(() => setLoading(false))
    }, [companyId, periodId])

    useEffect(() => {
        loadPeriods()
    }, [loadPeriods])

    useEffect(() => {
        loadReadiness()
    }, [loadReadiness])

    const periodOptions = periods.map((p) => ({
        label: `${p.fiscalYear} · P${p.periodNumber} · ${p.status}`,
        value: p.id,
    }))

    const columns: ColumnDef<FicoClosingCheck>[] = [
        {
            header: 'Control',
            accessorKey: 'label',
            cell: ({ row }) => (
                <div>
                    <div className="font-medium">{row.original.label}</div>
                    {row.original.detail ? (
                        <div className="text-xs text-gray-500">{row.original.detail}</div>
                    ) : null}
                </div>
            ),
        },
        {
            header: 'Level',
            accessorKey: 'level',
            cell: ({ row }) => (
                <FicoStatusCell
                    status={row.original.level}
                    map={CLOSING_LEVEL_MAP as Record<string, FicoBadgeTone>}
                />
            ),
        },
        {
            header: 'Count',
            accessorKey: 'count',
            cell: ({ row }) =>
                row.original.count != null ? String(row.original.count) : '—',
        },
        {
            header: '',
            id: 'link',
            cell: ({ row }) =>
                row.original.href ? (
                    <Link href={row.original.href}>
                        <Button size="sm" variant="plain">
                            Open
                        </Button>
                    </Link>
                ) : null,
        },
    ]

    return (
        <PageContainer>
            <PageHeader
                title="Period-End Closing"
                description="Closing readiness checklist before you close or lock a posting period. Unsupported modules appear as not applicable — never marked reconciled."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        <FormItem className="mb-0 min-w-[220px]">
                            <Select
                                value={periodId}
                                onChange={(v) => setPeriodId(v ?? '')}
                                options={periodOptions}
                            />
                        </FormItem>
                        <Button icon={<HiOutlineRefresh />} loading={loading} onClick={loadReadiness}>
                            Refresh
                        </Button>
                        <Link href="/modules/fico/fiscal-periods">
                            <Button variant="twoTone">Posting periods</Button>
                        </Link>
                    </div>
                }
            />

            {readiness ? (
                <>
                    <ClosingSummary readiness={readiness} />
                    <FicoResponsiveTable
                        columns={columns}
                        data={readiness.checks}
                        loading={loading}
                        noData={!loading && readiness.checks.length === 0}
                    />
                </>
            ) : null}
        </PageContainer>
    )
}

function ClosingSummary({ readiness }: { readiness: FicoPeriodClosingReadiness }) {
    const { summary, fiscalPeriod } = readiness
    return (
        <>
            <AdaptiveCard className="mb-4 p-4">
                <p className="text-sm">
                    Period <strong>{fiscalPeriod.name || `P${fiscalPeriod.periodNumber}`}</strong>{' '}
                    ({fiscalPeriod.status}) · FY {fiscalPeriod.fiscalYear}
                </p>
                {!summary.readyToClose && summary.blocking > 0 ? (
                    <p className="mt-2 text-sm text-red-600 dark:text-red-300">
                        Closing is blocked until {summary.blocking} blocking control(s) are cleared.
                    </p>
                ) : summary.readyToClose ? (
                    <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                        No blocking controls — you may proceed with period close from Posting
                        Periods (audit and permissions still apply).
                    </p>
                ) : null}
            </AdaptiveCard>
            <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                    label="Blocking"
                    value={String(summary.blocking)}
                    tone={summary.blocking > 0 ? 'danger' : 'success'}
                />
                <StatCard label="Warnings" value={String(summary.warning)} />
                <StatCard label="Completed" value={String(summary.completed)} />
                <StatCard label="N/A" value={String(summary.notApplicable)} />
                <StatCard
                    label="Ready to close"
                    value={summary.readyToClose ? 'Yes' : 'No'}
                    tone={
                        summary.readyToClose ? ('success' as const) : ('warning' as const)
                    }
                />
            </div>
        </>
    )
}

export default PeriodClosingPage