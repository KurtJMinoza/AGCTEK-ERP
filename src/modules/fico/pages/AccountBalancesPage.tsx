'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PageContainer from '@/components/shared/PageContainer'
import PageHeader from '@/components/shared/PageHeader'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { buildErpBreadcrumbs } from '@/utils/erp-navigation'
import {
    FicoCompanySelect,
    notifyError,
    useFicoCompanies,
} from '../components/FicoCompanySelect'
import { ficoTrialBalanceService } from '../services/ficoService'
import { downloadCsv } from '../utils/ficoReportCsv'
import type { FicoTrialBalanceRow } from '../types'

const ROUTE = '/modules/fico/account-balances'

const AccountBalancesPage = () => {
    const { companies, companyId, setCompanyId, loading: companyLoading } =
        useFicoCompanies()
    const [items, setItems] = useState<FicoTrialBalanceRow[]>([])
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [includeZero, setIncludeZero] = useState(false)
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
            .then((data) => setItems(data.items))
            .catch((error) =>
                notifyError(error, 'Unable to load account balances.'),
            )
            .finally(() => setBusy(false))
    }, [companyId, dateFrom, dateTo, includeZero])

    useEffect(() => {
        load()
    }, [load])

    const columns = useMemo<ColumnDef<FicoTrialBalanceRow>[]>(
        () => [
            {
                header: 'Account',
                accessorKey: 'accountCode',
                cell: ({ row }) => (
                    <Link
                        className="text-primary hover:underline"
                        href={`/modules/fico/general-ledger?glAccountId=${row.original.glAccountId}`}
                    >
                        {row.original.accountCode}
                    </Link>
                ),
            },
            { header: 'Name', accessorKey: 'accountName' },
            { header: 'Type', accessorKey: 'accountType' },
            { header: 'Normal', accessorKey: 'normalBalance' },
            {
                header: 'Opening Dr',
                accessorKey: 'openingDebit',
                cell: ({ row }) => row.original.openingDebit ?? '0',
            },
            {
                header: 'Opening Cr',
                accessorKey: 'openingCredit',
                cell: ({ row }) => row.original.openingCredit ?? '0',
            },
            {
                header: 'Period Dr',
                accessorKey: 'periodDebit',
                cell: ({ row }) => row.original.periodDebit ?? row.original.debit,
            },
            {
                header: 'Period Cr',
                accessorKey: 'periodCredit',
                cell: ({ row }) => row.original.periodCredit ?? row.original.credit,
            },
            {
                header: 'Closing Dr',
                accessorKey: 'closingDebit',
                cell: ({ row }) => row.original.closingDebit ?? '0',
            },
            {
                header: 'Closing Cr',
                accessorKey: 'closingCredit',
                cell: ({ row }) => row.original.closingCredit ?? '0',
            },
        ],
        [],
    )

    const exportCsv = () => {
        const header = columns.map((c) => String(c.header))
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
        ])
        downloadCsv(`account-balances-${companyId}.csv`, [header, ...rows])
    }

    return (
        <PageContainer>
            <PageHeader
                title="Account Balances"
                description="Company-wide G/L balances aggregated on the server from committed journal lines."
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
            <AdaptiveCard className="mb-4">
                <div className="flex flex-wrap items-end gap-3">
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={includeZero}
                            onChange={(e) => setIncludeZero(e.target.checked)}
                        />
                        Include zero balances
                    </label>
                    <Button onClick={load}>Refresh</Button>
                </div>
            </AdaptiveCard>
            <AdaptiveCard>
                <DataTable columns={columns} data={items} loading={busy} hidePagination />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default AccountBalancesPage