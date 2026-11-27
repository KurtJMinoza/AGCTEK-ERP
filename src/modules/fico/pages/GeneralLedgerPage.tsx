'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
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
    FICO_TABLE_COL_RIGHT,
    FicoControlFlags,
    FicoTwoLineCell,
    ficoStatusTone,
    formatFicoDate,
} from '../components/ficoTableUi'
import GeneralLedgerSummaryPanel from '../components/generalLedger/GeneralLedgerSummaryPanel'
import {
    GeneralLedgerAmountCell,
    humanizeLedgerDocType,
} from '../components/generalLedger/generalLedgerUi'
import { FicoLedgerPageTotals } from '../components/ficoReportSummary'
import {
    JournalPostingStatus,
    formatJournalDate,
    journalAmountColumnHeader,
    sumLineTotals,
} from '../components/journal/journalUi'
import {
    ficoGeneralLedgerService,
    ficoGlAccountService,
    ficoSettingsService,
} from '../services/ficoService'
import { downloadCsv } from '../utils/ficoReportCsv'
import type {
    FicoGlAccount,
    FicoGlAccountBalanceSummary,
    FicoGlLedgerLine,
} from '../types'
import { HiOutlineDownload, HiOutlineEye, HiOutlineRefresh } from 'react-icons/hi'

const ROUTE = '/modules/fico/general-ledger'
const PAGE_SIZE = 50

const POSTING_STATUS_MAP: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> =
    {
        DRAFT: 'default',
        POSTED: 'success',
        REVERSED: 'info',
        CANCELLED: 'warning',
    }

const GeneralLedgerPage = () => {
    const router = useRouter()
    const searchParams = useSearchParams()
    const presetAccountId = searchParams.get('glAccountId') ?? ''
    const {
        companies,
        companyId,
        setCompanyId,
        selectedRow,
        loading: companyLoading,
    } = useFicoCompanies()
    const currency = selectedRow?.settings?.baseCurrency ?? 'PHP'

    const [accounts, setAccounts] = useState<FicoGlAccount[]>([])
    const [accountId, setAccountId] = useState(presetAccountId)
    const [items, setItems] = useState<FicoGlLedgerLine[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [balanceSummary, setBalanceSummary] =
        useState<FicoGlAccountBalanceSummary | null>(null)
    const [busy, setBusy] = useState(false)
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [draftFrom, setDraftFrom] = useState('')
    const [draftTo, setDraftTo] = useState('')
    const [sourceModule, setSourceModule] = useState('')
    const [ledgerSortAsc, setLedgerSortAsc] = useState(false)

    useEffect(() => {
        if (presetAccountId) setAccountId(presetAccountId)
    }, [presetAccountId])

    useEffect(() => {
        if (!companyId) return
        ficoSettingsService.get(companyId).then((settings) => {
            const chartId = settings?.chartOfAccountsId
            if (!chartId) return
            ficoGlAccountService
                .list({ chartOfAccountsId: chartId, companyId, status: 'ACTIVE' })
                .then(setAccounts)
                .catch((error) =>
                    notifyError(error, 'Unable to load G/L accounts.'),
                )
        })
    }, [companyId])

    const load = useCallback(() => {
        if (!accountId || !companyId) return
        setBusy(true)
        Promise.all([
            ficoGeneralLedgerService.lineItems(accountId, {
                companyId,
                page,
                pageSize: PAGE_SIZE,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
                sortDir: ledgerSortAsc ? 'asc' : 'desc',
                sourceModule: sourceModule || undefined,
                includeRunningBalance: ledgerSortAsc,
            }),
            ficoGeneralLedgerService.accountBalances(accountId, {
                companyId,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
            }),
        ])
            .then(([lines, balances]) => {
                setItems(lines.items)
                setTotal(lines.total)
                setBalanceSummary(balances)
            })
            .catch((error) =>
                notifyError(error, 'Unable to load ledger lines.'),
            )
            .finally(() => setBusy(false))
    }, [accountId, companyId, page, dateFrom, dateTo, ledgerSortAsc, sourceModule])

    useEffect(() => {
        load()
    }, [load])

    const accountOptions = useMemo(
        () =>
            accounts.map((a) => ({
                value: a.id,
                label: `${a.accountCode} — ${a.accountName}`,
            })),
        [accounts],
    )

    const selectedAccount = accounts.find((a) => a.id === accountId)

    const pageTotals = useMemo(
        () =>
            sumLineTotals(
                items.map((line) => ({
                    debit: line.debitAmount,
                    credit: line.creditAmount,
                })),
            ),
        [items],
    )

    const openJournal = (id: string) => {
        router.push(`/modules/fico/journal-entries/${id}`)
    }

    const columns = useMemo<ColumnDef<FicoGlLedgerLine>[]>(
        () => [
            {
                header: 'Ln',
                accessorKey: 'lineNumber',
                size: 52,
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-gray-500">
                        {row.original.lineNumber}
                    </span>
                ),
            },
            {
                header: 'Posting',
                id: 'posting',
                size: 118,
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={formatJournalDate(row.original.journalEntry.postingDate)}
                        secondary={
                            row.original.journalEntry.documentDate
                                ? `Doc ${formatFicoDate(row.original.journalEntry.documentDate)}`
                                : undefined
                        }
                    />
                ),
            },
            {
                header: 'Document',
                id: 'document',
                size: 168,
                cell: ({ row }) => (
                    <button
                        type="button"
                        className="text-left"
                        onClick={() => openJournal(row.original.journalEntry.id)}
                    >
                        <span className="font-mono text-xs font-semibold text-primary hover:underline">
                            {row.original.journalEntry.documentNumber ?? '—'}
                        </span>
                        <p className="truncate text-[11px] text-gray-500">
                            {humanizeLedgerDocType(row.original.journalEntry.documentType)}
                        </p>
                    </button>
                ),
            },
            {
                header: 'Status',
                id: 'status',
                size: 108,
                cell: ({ row }) => (
                    <JournalPostingStatus
                        status={row.original.journalEntry.status}
                    />
                ),
            },
            {
                header: 'Line text',
                accessorKey: 'description',
                size: 200,
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.description ?? '—'}
                        secondary={
                            row.original.journalEntry.sourceModule
                                ? `${row.original.journalEntry.sourceModule}${
                                      row.original.journalEntry.sourceDocumentId
                                          ? ` · ${row.original.journalEntry.sourceDocumentId}`
                                          : ''
                                  }`
                                : undefined
                        }
                    />
                ),
            },
            {
                header: journalAmountColumnHeader.debit,
                id: 'debit',
                meta: FICO_TABLE_COL_RIGHT,
                size: 120,
                cell: ({ row }) => (
                    <GeneralLedgerAmountCell
                        currency={row.original.currency}
                        amount={row.original.debitAmount}
                    />
                ),
            },
            {
                header: journalAmountColumnHeader.credit,
                id: 'credit',
                meta: FICO_TABLE_COL_RIGHT,
                size: 120,
                cell: ({ row }) => (
                    <GeneralLedgerAmountCell
                        currency={row.original.currency}
                        amount={row.original.creditAmount}
                    />
                ),
            },
            ...(ledgerSortAsc
                ? ([
                      {
                          header: 'Running bal.',
                          id: 'running',
                          meta: FICO_TABLE_COL_RIGHT,
                          size: 120,
                          cell: ({ row }: { row: { original: FicoGlLedgerLine } }) => (
                              <span className="tabular-nums text-sm font-medium">
                                  {row.original.runningBalance ?? '—'}
                              </span>
                          ),
                      },
                  ] as ColumnDef<FicoGlLedgerLine>[])
                : []),
            {
                header: 'Flags',
                id: 'flags',
                size: 120,
                cell: ({ row }) => {
                    const je = row.original.journalEntry
                    return (
                        <FicoControlFlags
                            flags={[
                                je.sourceModule ? je.sourceModule : false,
                                je.reversalOfId ? 'Reversal' : false,
                            ]}
                        />
                    )
                },
            },
            {
                header: '',
                id: 'view',
                size: 64,
                cell: ({ row }) => (
                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineEye />}
                        onClick={() => openJournal(row.original.journalEntry.id)}
                    />
                ),
            },
        ],
        [ledgerSortAsc],
    )

    const mobile = useMemo(
        () => ({
            title: (row: FicoGlLedgerLine) =>
                row.journalEntry.documentNumber ??
                humanizeLedgerDocType(row.journalEntry.documentType),
            subtitle: (row: FicoGlLedgerLine) =>
                row.description ?? formatJournalDate(row.journalEntry.postingDate),
            status: (row: FicoGlLedgerLine) => ({
                text: row.journalEntry.status.replace(/_/g, ' '),
                tone: ficoStatusTone(row.journalEntry.status, POSTING_STATUS_MAP),
            }),
            onPress: (row: FicoGlLedgerLine) => openJournal(row.journalEntry.id),
            fields: [
                {
                    label: 'Posting',
                    value: (row: FicoGlLedgerLine) =>
                        formatJournalDate(row.journalEntry.postingDate),
                },
                {
                    label: 'Debit',
                    value: (row: FicoGlLedgerLine) => row.debitAmount,
                    align: 'right' as const,
                },
                {
                    label: 'Credit',
                    value: (row: FicoGlLedgerLine) => row.creditAmount,
                    align: 'right' as const,
                },
            ],
        }),
        [router],
    )

    const applyFilters = () => {
        setDateFrom(draftFrom)
        setDateTo(draftTo)
        setPage(1)
    }

    const filterChips = useMemo(() => {
        const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
        if (dateFrom) {
            chips.push({
                key: 'from',
                label: `From ${dateFrom}`,
                onRemove: () => {
                    setDraftFrom('')
                    setDateFrom('')
                    setPage(1)
                },
            })
        }
        if (dateTo) {
            chips.push({
                key: 'to',
                label: `To ${dateTo}`,
                onRemove: () => {
                    setDraftTo('')
                    setDateTo('')
                    setPage(1)
                },
            })
        }
        return chips
    }, [dateFrom, dateTo])

    const exportCsv = () => {
        if (!items.length || !accountId) return
        const header = [
            'Line',
            'Posting date',
            'Document',
            'Type',
            'Status',
            'Description',
            'Debit',
            'Credit',
            'Currency',
        ]
        const rows = items.map((row) => [
            String(row.lineNumber),
            row.journalEntry.postingDate,
            row.journalEntry.documentNumber ?? '',
            row.journalEntry.documentType,
            row.journalEntry.status,
            row.description ?? '',
            row.debitAmount,
            row.creditAmount,
            row.currency,
        ])
        downloadCsv(`gl-ledger-${selectedAccount?.accountCode ?? accountId}.csv`, [
            ['Company', companyId],
            ['Account', selectedAccount?.accountCode ?? ''],
            ['From', dateFrom],
            ['To', dateTo],
            [],
            header,
            ...rows,
        ])
    }

    return (
        <PageContainer>
            <PageHeader
                title="General Ledger"
                description="Read-only account ledger on committed journal lines — opening, movement, and document drill-down with posting period filters."
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
                            icon={<HiOutlineRefresh />}
                            disabled={!accountId}
                            loading={busy}
                            onClick={load}
                        >
                            Refresh
                        </Button>
                        <Button
                            variant="plain"
                            icon={<HiOutlineDownload />}
                            disabled={!items.length}
                            onClick={exportCsv}
                        >
                            Export page
                        </Button>
                    </div>
                }
            />

            <FilterBar
                className="mb-4"
                fields={[
                    {
                        key: 'account',
                        label: 'G/L account',
                        kind: 'select',
                        value: accountId,
                        options: accountOptions,
                        placeholder: 'Select account',
                        onChange: (value) => {
                            setAccountId(value)
                            setPage(1)
                        },
                        className: 'min-w-[12rem] flex-[2]',
                    },
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
                    {
                        key: 'source',
                        label: 'Source module',
                        kind: 'select',
                        value: sourceModule,
                        options: [
                            { value: '', label: 'All modules' },
                            { value: 'MM', label: 'MM' },
                            { value: 'SD', label: 'SD' },
                            { value: 'AP', label: 'AP' },
                            { value: 'AR', label: 'AR' },
                        ],
                        onChange: (value) => {
                            setSourceModule(value)
                            setPage(1)
                        },
                    },
                    {
                        key: 'sort',
                        label: 'Line order',
                        kind: 'select',
                        value: ledgerSortAsc ? 'asc' : 'desc',
                        options: [
                            { value: 'desc', label: 'Newest first' },
                            { value: 'asc', label: 'Oldest first (running balance)' },
                        ],
                        onChange: (value) => {
                            setLedgerSortAsc(value === 'asc')
                            setPage(1)
                        },
                    },
                ]}
                chips={filterChips}
                onClear={() => {
                    setDraftFrom('')
                    setDraftTo('')
                    setDateFrom('')
                    setDateTo('')
                    setPage(1)
                }}
                actions={
                    <>
                        <Button
                            size="sm"
                            variant="solid"
                            disabled={!accountId}
                            onClick={applyFilters}
                        >
                            Apply
                        </Button>
                    </>
                }
            />

            <AdaptiveCard className="mb-4">
                <GeneralLedgerSummaryPanel
                    currency={currency}
                    account={selectedAccount}
                    summaryAccount={balanceSummary?.account}
                    totals={balanceSummary?.totals ?? null}
                    totalLines={total}
                    loading={busy && !items.length}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                />
            </AdaptiveCard>

            <AdaptiveCard>
                {items.length > 0 ? (
                    <div className="mb-3 border-b border-gray-100 pb-3 dark:border-gray-800">
                        <FicoLedgerPageTotals
                            currency={items[0]?.currency ?? currency}
                            debit={pageTotals.debit}
                            credit={pageTotals.credit}
                            lineCount={items.length}
                        />
                        <p className="mt-1.5 text-[11px] text-gray-500">
                            Page subtotals for {items.length} of {total} lines.
                            Summary above is all committed activity for this account.
                        </p>
                    </div>
                ) : null}
                <FicoResponsiveTable
                    columns={columns}
                    data={items}
                    loading={busy}
                    tableMinWidthClass="min-w-[1040px]"
                    mobile={mobile}
                    pagingData={{
                        total,
                        pageIndex: page - 1,
                        pageSize: PAGE_SIZE,
                    }}
                    onPaginationChange={(p) => setPage(p + 1)}
                />
            </AdaptiveCard>
        </PageContainer>
    )
}

export default GeneralLedgerPage