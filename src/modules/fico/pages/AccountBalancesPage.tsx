'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import FilterBar from '@/components/shared/FilterBar'
import Button from '@/components/ui/Button'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    notifyError,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import FicoResponsiveTable, { type ColumnDef } from '../components/FicoResponsiveTable'
import {
    FicoAccountTypeTag,
    FicoBalanceCell,
    FicoCodeCell,
    FicoCountCell,
} from '../components/ficoTableUi'
import TrialBalanceSummaryPanel from '../components/trialBalance/TrialBalanceSummaryPanel'
import {
    TRIAL_BALANCE_AMOUNT_COL,
    TrialBalanceAmountCell,
    trialBalanceAmountHeader,
} from '../components/trialBalance/trialBalanceUi'
import { ficoTrialBalanceService } from '../services/ficoService'
import { downloadCsv } from '../utils/ficoReportCsv'
import type { FicoTrialBalanceResponse, FicoTrialBalanceRow } from '../types'

const ROUTE = '/modules/fico/account-balances'

const AccountBalancesPage = () => {
    const router = useRouter()
    const {
        companies,
        companyId,
        setCompanyId,
        selectedRow,
        loading: companyLoading,
    } = useFicoCompanies()
    const currency = selectedRow?.settings?.baseCurrency ?? 'PHP'

    const [items, setItems] = useState<FicoTrialBalanceRow[]>([])
    const [meta, setMeta] = useState<Pick<
        FicoTrialBalanceResponse,
        'totals' | 'totalAccounts'
    > | null>(null)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [draftFrom, setDraftFrom] = useState('')
    const [draftTo, setDraftTo] = useState('')
    const [includeZero, setIncludeZero] = useState(false)
    const [draftIncludeZero, setDraftIncludeZero] = useState(false)
    const [busy, setBusy] = useState(false)

    const load = useCallback(() => {
        if (!companyId) return
        setBusy(true)
        ficoTrialBalanceService
            .get({
                companyId,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                includeZeroBalances: includeZero,
                pageSize: 500,
            })
            .then((data) => {
                setItems(data.items)
                setMeta({
                    totals: data.totals,
                    totalAccounts: data.totalAccounts,
                })
            })
            .catch((error) =>
                notifyError(error, 'Unable to load account balances.'),
            )
            .finally(() => setBusy(false))
    }, [companyId, dateFrom, dateTo, includeZero])

    useEffect(() => {
        load()
    }, [load])

    const runReport = () => {
        setDateFrom(draftFrom)
        setDateTo(draftTo)
        setIncludeZero(draftIncludeZero)
    }

    const filterChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
        if (dateFrom) {
            chips.push({
                key: 'from',
                label: `From ${dateFrom}`,
                onRemove: () => setDateFrom(''),
            })
        }
        if (dateTo) {
            chips.push({
                key: 'to',
                label: `To ${dateTo}`,
                onRemove: () => setDateTo(''),
            })
        }
        if (includeZero) {
            chips.push({
                key: 'zero',
                label: 'Include zero balances',
                onRemove: () => {
                    setIncludeZero(false)
                    setDraftIncludeZero(false)
                },
            })
        }
        return chips
    }, [dateFrom, dateTo, includeZero])

    const openGl = (glAccountId: string) => {
        router.push(`/modules/fico/general-ledger?glAccountId=${glAccountId}`)
    }

    const columns = useMemo<ColumnDef<FicoTrialBalanceRow>[]>(
        () => [
            {
                header: 'G/L account',
                accessorKey: 'accountCode',
                size: 220,
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="account"
                        code={row.original.accountCode}
                        name={row.original.accountName}
                        onClick={() => openGl(row.original.glAccountId)}
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'accountType',
                cell: ({ row }) => (
                    <FicoAccountTypeTag type={row.original.accountType} />
                ),
            },
            {
                header: 'Normal',
                accessorKey: 'normalBalance',
                cell: ({ row }) => (
                    <FicoBalanceCell
                        normalBalance={row.original.normalBalance}
                        accountType={row.original.accountType}
                    />
                ),
            },
            {
                header: () => trialBalanceAmountHeader('Debit', 'Opening'),
                id: 'openingDebit',
                ...TRIAL_BALANCE_AMOUNT_COL,
                cell: ({ row }) => (
                    <TrialBalanceAmountCell
                        currency={currency}
                        amount={row.original.openingDebit}
                        muted
                    />
                ),
            },
            {
                header: () => trialBalanceAmountHeader('Credit', 'Opening'),
                id: 'openingCredit',
                ...TRIAL_BALANCE_AMOUNT_COL,
                cell: ({ row }) => (
                    <TrialBalanceAmountCell
                        currency={currency}
                        amount={row.original.openingCredit}
                        muted
                    />
                ),
            },
            {
                header: () => trialBalanceAmountHeader('Debit', 'Period'),
                id: 'periodDebit',
                ...TRIAL_BALANCE_AMOUNT_COL,
                cell: ({ row }) => (
                    <TrialBalanceAmountCell
                        currency={currency}
                        amount={row.original.periodDebit ?? row.original.debit}
                    />
                ),
            },
            {
                header: () => trialBalanceAmountHeader('Credit', 'Period'),
                id: 'periodCredit',
                ...TRIAL_BALANCE_AMOUNT_COL,
                cell: ({ row }) => (
                    <TrialBalanceAmountCell
                        currency={currency}
                        amount={row.original.periodCredit ?? row.original.credit}
                    />
                ),
            },
            {
                header: () => trialBalanceAmountHeader('Debit', 'Closing'),
                id: 'closingDebit',
                ...TRIAL_BALANCE_AMOUNT_COL,
                cell: ({ row }) => (
                    <TrialBalanceAmountCell
                        currency={currency}
                        amount={row.original.closingDebit}
                        emphasis
                    />
                ),
            },
            {
                header: () => trialBalanceAmountHeader('Credit', 'Closing'),
                id: 'closingCredit',
                ...TRIAL_BALANCE_AMOUNT_COL,
                cell: ({ row }) => (
                    <TrialBalanceAmountCell
                        currency={currency}
                        amount={row.original.closingCredit}
                        emphasis
                    />
                ),
            },
            {
                header: 'Lines',
                accessorKey: 'lineCount',
                size: 72,
                cell: ({ row }) => (
                    <FicoCountCell value={row.original.lineCount} label="posted" />
                ),
            },
        ],
        [currency],
    )

    const exportCsv = () => {
        const header = columns.map((c) =>
            typeof c.header === 'string' ? c.header : 'Amount',
        )
        const rows = items.map((row) => [
            row.accountCode,
            row.accountName,
            row.accountType,
            row.normalBalance,
            row.openingDebit ?? '0',
            row.openingCredit ?? '0',
            row.periodDebit ?? row.debit,
            row.periodCredit ?? row.credit,
            row.closingDebit ?? '0',
            row.closingCredit ?? '0',
            String(row.lineCount),
        ])
        downloadCsv(`account-balances-${companyId}.csv`, [header, ...rows])
    }

    const totals = meta?.totals ?? {
        debit: '0',
        credit: '0',
        lineCount: 0,
    }

    return (
        <PageContainer>
            <PageHeader
                title="Account Balances"
                description="Company-wide G/L balances by account — opening, period movement, and closing columns aggregated from posted journals."
                breadcrumbs={buildErpBreadcrumbs(ROUTE)}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <FicoCompanySelect
                            companies={companies}
                            value={companyId}
                            onChange={setCompanyId}
                            loading={companyLoading}
                        />
                        <Button
                            variant="plain"
                            disabled={!items.length}
                            onClick={exportCsv}
                        >
                            Export CSV
                        </Button>
                    </div>
                }
            />

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
                chips={filterChips}
                onClear={() => {
                    setDraftFrom('')
                    setDraftTo('')
                    setDateFrom('')
                    setDateTo('')
                    setDraftIncludeZero(false)
                    setIncludeZero(false)
                }}
                actions={
                    <>
                        <label className="mr-2 flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                            <input
                                type="checkbox"
                                className="rounded border-gray-300"
                                checked={draftIncludeZero}
                                onChange={(e) =>
                                    setDraftIncludeZero(e.target.checked)
                                }
                            />
                            Zero balances
                        </label>
                        <Button size="sm" variant="solid" loading={busy} onClick={runReport}>
                            Run report
                        </Button>
                    </>
                }
            />

            <AdaptiveCard className="mb-4">
                <TrialBalanceSummaryPanel
                    currency={currency}
                    totals={totals}
                    totalAccounts={meta?.totalAccounts ?? 0}
                    lineCount={totals.lineCount}
                    loading={busy && !items.length}
                />
            </AdaptiveCard>

            <AdaptiveCard bodyClass="p-0 sm:p-0">
                <FicoResponsiveTable
                    columns={columns}
                    data={items}
                    loading={busy}
                    hidePagination
                    tableMinWidthClass="min-w-[1180px]"
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AccountBalancesPage