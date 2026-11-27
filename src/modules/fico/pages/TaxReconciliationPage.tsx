'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar from '@/components/shared/FilterBar'
import StatCard from '@/components/shared/StatCard'
import StatusBadge from '@/components/shared/StatusBadge'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable from '../components/FicoResponsiveTable'
import { FicoCodeCell } from '../components/ficoTableUi'
import { formatMoney } from '../components/journal/journalUi'
import {
    FicoWorkbenchAlert,
    FicoCompanyRequired,
    FicoWorkbenchPanel,
} from '../components/workbench/FicoWorkbenchChrome'
import {
    treasuryService,
    type TaxReconciliationResponse,
} from '../services/treasuryService'
import { HiOutlineReceiptRefund, HiOutlineRefresh } from 'react-icons/hi'

const ROUTE = '/modules/fico/tax-reconciliation'

type TaxRow = TaxReconciliationResponse['rows'][number]

const TaxReconciliationPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [draftFrom, setDraftFrom] = useState('')
    const [draftTo, setDraftTo] = useState('')
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [data, setData] = useState<TaxReconciliationResponse | null>(null)

    const load = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        setError('')
        treasuryService
            .fetchTaxReconciliation({
                companyId,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
            })
            .then(setData)
            .catch((e) => setError(e instanceof Error ? e.message : 'Load failed'))
            .finally(() => setLoading(false))
    }, [companyId, fromDate, toDate])

    useEffect(() => {
        load()
    }, [load])

    const runReport = () => {
        setFromDate(draftFrom)
        setToDate(draftTo)
    }

    const chips = useMemo(() => {
        const list: Array<{ key: string; label: string; onRemove: () => void }> = []
        if (fromDate) {
            list.push({
                key: 'from',
                label: `From ${fromDate}`,
                onRemove: () => setFromDate(''),
            })
        }
        if (toDate) {
            list.push({
                key: 'to',
                label: `To ${toDate}`,
                onRemove: () => setToDate(''),
            })
        }
        return list
    }, [fromDate, toDate])

    const columns = useMemo<ColumnDef<TaxRow>[]>(
        () => [
            {
                header: 'Tax code',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.taxCode}
                        name={row.original.taxName}
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'taxType',
            },
            {
                header: 'Snapshot tax',
                cell: ({ row }) => (
                    <span className="tabular-nums font-medium">
                        {formatMoney('PHP', row.original.snapshotTaxAmount)}
                    </span>
                ),
            },
            {
                header: 'G/L balance',
                cell: ({ row }) => (
                    <span className="tabular-nums text-gray-700 dark:text-gray-300">
                        {formatMoney('PHP', row.original.glBalance)}
                    </span>
                ),
            },
            {
                header: 'Variance',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.reconciled
                                ? 'tabular-nums text-emerald-600'
                                : 'tabular-nums font-semibold text-amber-600'
                        }
                    >
                        {formatMoney('PHP', row.original.variance)}
                    </span>
                ),
            },
            {
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge
                        status={row.original.reconciled ? 'RECONCILED' : 'VARIANCE'}
                        tone={row.original.reconciled ? 'success' : 'warning'}
                    />
                ),
            },
        ],
        [],
    )

    return (
        <PageContainer>
            <PageHeader
                title="Tax reconciliation"
                description="Immutable posted tax snapshots compared to tax G/L movement — management report, not statutory filing."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                            allowAll={false}
                        />
                        <Button
                            size="sm"
                            variant="plain"
                            loading={loading}
                            icon={<HiOutlineRefresh />}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                    </div>
                }
            />

            {!companyId ? (
                <FicoCompanyRequired />
            ) : (
                <>
                    <FilterBar
                        className="mb-4"
                        fields={[
                            {
                                key: 'from',
                                label: 'Posting from',
                                kind: 'text',
                                inputType: 'date',
                                value: draftFrom,
                                onChange: setDraftFrom,
                            },
                            {
                                key: 'to',
                                label: 'Posting to',
                                kind: 'text',
                                inputType: 'date',
                                value: draftTo,
                                onChange: setDraftTo,
                            },
                        ]}
                        chips={chips}
                        onClear={() => {
                            setDraftFrom('')
                            setDraftTo('')
                            setFromDate('')
                            setToDate('')
                        }}
                        actions={
                            <Button size="sm" variant="solid" loading={loading} onClick={runReport}>
                                Run report
                            </Button>
                        }
                    />

                    <FicoWorkbenchAlert message={error} onDismiss={() => setError('')} />

                    {data ? (
                        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <StatCard
                                label="Output tax (snapshots)"
                                value={formatMoney('PHP', data.summary.outputTaxFromSnapshots)}
                                icon={<HiOutlineReceiptRefund />}
                            />
                            <StatCard
                                label="Input tax (snapshots)"
                                value={formatMoney('PHP', data.summary.inputTaxFromSnapshots)}
                            />
                            <StatCard
                                label="WHT payable"
                                value={formatMoney(
                                    'PHP',
                                    data.summary.withholdingPayableFromSnapshots,
                                )}
                            />
                            <StatCard
                                label="WHT receivable"
                                value={formatMoney(
                                    'PHP',
                                    data.summary.withholdingReceivableFromSnapshots,
                                )}
                            />
                        </div>
                    ) : null}

                    <FicoWorkbenchPanel>
                        <AdaptiveCard className="border-0 shadow-none" bodyClass="p-0">
                            <FicoResponsiveTable
                                columns={columns}
                                data={data?.rows ?? []}
                                loading={loading}
                                noData={!loading && !data?.rows.length}
                                tableMinWidthClass="min-w-[880px]"
                            />
                        </AdaptiveCard>
                    </FicoWorkbenchPanel>
                </>
            )}
        </PageContainer>
    )
}

export default TaxReconciliationPage