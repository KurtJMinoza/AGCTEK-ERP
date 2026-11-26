'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import EllipsisButton from '@/components/shared/EllipsisButton'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Dropdown from '@/components/ui/Dropdown'
import Input from '@/components/ui/Input'
import Tabs from '@/components/ui/Tabs'
import {
    HiOutlineClipboardList,
    HiOutlineDocumentText,
    HiOutlineDownload,
    HiOutlineEye,
    HiOutlinePencil,
    HiOutlinePlus,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import FicoResponsiveTable, { type ColumnDef } from '../FicoResponsiveTable'
import {
    FicoCodeCell,
    FicoTwoLineCell,
    formatFicoDate,
    ficoStatusTone,
} from '../ficoTableUi'
import JournalFiltersPanel from './JournalFiltersPanel'
import {
    JOURNAL_TABS,
    JournalPostingOriginBadge,
    JournalPostingStatus,
    formatJournalDate,
    formatMoney,
} from './journalUi'
import {
    useJournalWorkbench,
    type JournalWorkbenchTab,
} from '../../hooks/useJournalWorkbench'
import { downloadCsv } from '../../utils/ficoReportCsv'
import type { FicoJournalEntryListItem, FicoJournalWorkbenchSummary } from '../../types'

const POSTING_STATUS_MAP: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
    DRAFT: 'default',
    POSTED: 'success',
    REVERSED: 'info',
    CANCELLED: 'warning',
    LEGACY: 'default',
}

function tabCount(tab: JournalWorkbenchTab, summary: FicoJournalWorkbenchSummary | null) {
    if (!summary) return undefined
    switch (tab) {
        case 'all':
            return summary.total
        case 'my-drafts':
            return summary.draft
        case 'posted':
            return summary.posted
        case 'reversed':
            return summary.reversed
        case 'automatic':
            return summary.automatic
        default:
            return undefined
    }
}

function humanizeType(value?: string) {
    if (!value) return '—'
    return value.replace(/_/g, ' ')
}

type Props = {
    companyId: string
}

export default function JournalEntriesWorkbench({ companyId }: Props) {
    const router = useRouter()
    const {
        tab,
        setTab,
        filters,
        setFilters,
        searchInput,
        setSearchInput,
        items,
        total,
        summary,
        loading,
        reload,
        page,
        setPage,
    } = useJournalWorkbench(companyId)

    const openDetail = (id: string) =>
        router.push(`/modules/fico/journal-entries/${id}`)

    const columns = useMemo<ColumnDef<FicoJournalEntryListItem>[]>(
        () => [
            {
                header: 'Document',
                accessorKey: 'documentNumber',
                cell: ({ row }) => (
                    <FicoCodeCell
                        icon="posting"
                        code={row.original.documentNumber ?? '—'}
                        name={row.original.description ?? humanizeType(row.original.documentType)}
                        onClick={() => openDetail(row.original.id)}
                    />
                ),
            },
            {
                header: 'Type',
                accessorKey: 'documentType',
                cell: ({ row }) => (
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {humanizeType(row.original.documentType)}
                    </span>
                ),
            },
            {
                header: 'Origin',
                id: 'origin',
                cell: ({ row }) => (
                    <JournalPostingOriginBadge origin={row.original.postingOrigin} />
                ),
            },
            {
                header: 'Source',
                id: 'source',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={row.original.sourceModule ?? 'Manual'}
                        secondary={
                            row.original.sourceDocumentNumber ??
                            row.original.sourceDocumentId ??
                            undefined
                        }
                        mono={Boolean(row.original.sourceDocumentNumber)}
                    />
                ),
            },
            {
                header: 'Partner',
                id: 'partner',
                cell: ({ row }) =>
                    row.original.supplier ? (
                        <FicoTwoLineCell
                            primary={row.original.supplier.supplierCode}
                            secondary={row.original.supplier.supplierName}
                            mono
                        />
                    ) : row.original.customer ? (
                        <FicoTwoLineCell
                            primary={row.original.customer.customerNumber}
                            secondary={row.original.customer.companyName}
                            mono
                        />
                    ) : (
                        <span className="text-sm text-gray-400">—</span>
                    ),
            },
            {
                header: 'Debit / Credit',
                id: 'drCr',
                meta: { className: '!text-right' },
                cell: ({ row }) => (
                    <span className="block text-right text-xs tabular-nums text-gray-600 dark:text-gray-300">
                        {row.original.totalDebit && row.original.totalCredit
                            ? `${formatMoney(row.original.currencyCode, row.original.totalDebit)} · ${formatMoney(row.original.currencyCode, row.original.totalCredit)}`
                            : '—'}
                    </span>
                ),
            },
            {
                header: 'Posting',
                id: 'posting',
                cell: ({ row }) => (
                    <FicoTwoLineCell
                        primary={formatJournalDate(row.original.postingDate)}
                        secondary={
                            row.original.fiscalPeriod
                                ? `FY${row.original.fiscalPeriod.fiscalYear} · P${row.original.fiscalPeriod.periodNumber}`
                                : row.original.fiscalYear
                                  ? `FY ${row.original.fiscalYear}`
                                  : undefined
                        }
                    />
                ),
            },
            {
                header: 'Doc. date',
                accessorKey: 'documentDate',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm tabular-nums">
                        {formatFicoDate(row.original.documentDate ?? undefined)}
                    </span>
                ),
            },
            {
                header: 'Amount',
                accessorKey: 'totalAmount',
                size: 132,
                minSize: 120,
                meta: { className: '!text-right' },
                cell: ({ row }) => (
                    <span className="block w-full text-right text-sm font-semibold tabular-nums tracking-tight">
                        {formatMoney(row.original.currencyCode, row.original.totalAmount)}
                    </span>
                ),
            },
            {
                header: 'Lines',
                id: 'lines',
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm">{row.original.lines?.length ?? 0}</span>
                ),
            },
            {
                header: 'Posting status',
                accessorKey: 'status',
                cell: ({ row }) => (
                    <JournalPostingStatus status={row.original.status} />
                ),
            },
            {
                header: 'Posted by',
                id: 'postedBy',
                cell: ({ row }) => {
                    if (row.original.status !== 'POSTED' && row.original.status !== 'REVERSED') {
                        return <span className="text-sm text-gray-400">—</span>
                    }
                    if (row.original.postedByName) {
                        return (
                            <FicoTwoLineCell
                                primary={row.original.postedByName}
                                secondary={
                                    row.original.postedByEmployeeCode ?? undefined
                                }
                            />
                        )
                    }
                    return (
                        <span className="text-sm text-gray-500">System</span>
                    )
                },
            },
            {
                header: '',
                id: 'actions',
                size: 52,
                cell: ({ row }) => (
                    <Dropdown renderTitle={<EllipsisButton />} placement="bottom-end">
                        <Dropdown.Item
                            eventKey="view"
                            onClick={() => openDetail(row.original.id)}
                        >
                            <HiOutlineEye className="text-base" />
                            <span>View journal</span>
                        </Dropdown.Item>
                        {row.original.status === 'DRAFT' ? (
                            <Dropdown.Item
                                eventKey="edit"
                                onClick={() =>
                                    router.push(
                                        `/modules/fico/journal-entries/${row.original.id}/edit`,
                                    )
                                }
                            >
                                <HiOutlinePencil className="text-base" />
                                <span>Edit draft</span>
                            </Dropdown.Item>
                        ) : null}
                    </Dropdown>
                ),
            },
        ],
        [router],
    )

    const mobile = useMemo(
        () => ({
            title: (row: FicoJournalEntryListItem) =>
                row.documentNumber ?? humanizeType(row.documentType),
            subtitle: (row: FicoJournalEntryListItem) => row.description ?? undefined,
            status: (row: FicoJournalEntryListItem) => ({
                text: row.status.replace(/_/g, ' '),
                tone: ficoStatusTone(row.status, POSTING_STATUS_MAP),
            }),
            onPress: (row: FicoJournalEntryListItem) => openDetail(row.id),
            fields: [
                {
                    label: 'Posting date',
                    value: (row: FicoJournalEntryListItem) =>
                        formatJournalDate(row.postingDate),
                },
                {
                    label: 'Amount',
                    value: (row: FicoJournalEntryListItem) =>
                        formatMoney(row.currencyCode, row.totalAmount),
                },
                {
                    label: 'Posted by',
                    value: (row: FicoJournalEntryListItem) =>
                        row.status === 'POSTED' || row.status === 'REVERSED'
                            ? row.postedByName ?? 'System'
                            : '—',
                },
            ],
        }),
        [],
    )

    const exportRows = () => {
        if (!companyId) return
        const header = [
            'Document',
            'Type',
            'Posting date',
            'Document date',
            'Status',
            'Posted by',
            'Employee code',
            'Currency',
            'Amount',
            'Lines',
            'Description',
            'Source module',
            'Source document',
        ]
        const data = items.map((row) => [
            row.documentNumber ?? '',
            row.documentType ?? '',
            row.postingDate,
            row.documentDate ?? '',
            row.status,
            row.postedByName ?? '',
            row.postedByEmployeeCode ?? '',
            row.currencyCode,
            row.totalAmount,
            String(row.lines?.length ?? 0),
            row.description ?? '',
            row.sourceModule ?? '',
            row.sourceDocumentId ?? '',
        ])
        downloadCsv(
            `journal-entries-${companyId}-${new Date().toISOString().slice(0, 10)}.csv`,
            [header, ...data],
        )
    }

    const filtersActive = Boolean(
        filters.search ||
            filters.status ||
            filters.dateFrom ||
            filters.dateTo ||
            filters.sourceModule,
    )

    return (
        <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatCard
                    label="Total"
                    value={summary?.total ?? '—'}
                    icon={<HiOutlineClipboardList />}
                    loading={loading && !summary}
                />
                <StatCard
                    label="Draft"
                    value={summary?.draft ?? '—'}
                    tone="default"
                    loading={loading && !summary}
                />
                <StatCard
                    label="Posted"
                    value={summary?.posted ?? '—'}
                    tone="success"
                    loading={loading && !summary}
                />
                <StatCard
                    label="Reversed"
                    value={summary?.reversed ?? '—'}
                    tone="info"
                    loading={loading && !summary}
                />
            </div>

            <AdaptiveCard className="mb-4">
                <Tabs
                    value={tab}
                    onChange={(val) => {
                        setTab(val as JournalWorkbenchTab)
                        setPage(1)
                    }}
                >
                    <Tabs.TabList className="flex flex-wrap gap-1 border-b border-gray-100 pb-3 dark:border-gray-800">
                        {JOURNAL_TABS.map((t) => {
                            const count = tabCount(t.id, summary)
                            return (
                                <Tabs.TabNav key={t.id} value={t.id}>
                                    <span className="flex items-center gap-1.5">
                                        {t.label}
                                        {count != null ? (
                                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                                                {count.toLocaleString()}
                                            </span>
                                        ) : null}
                                    </span>
                                </Tabs.TabNav>
                            )
                        })}
                    </Tabs.TabList>
                </Tabs>
            </AdaptiveCard>

            <AdaptiveCard>
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                            className="w-full sm:max-w-xs"
                            size="sm"
                            placeholder="Search document, reference, source…"
                            prefix={<HiOutlineSearch className="text-lg" />}
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                        />
                        <JournalFiltersPanel filters={filters} onApply={setFilters} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {filtersActive ? (
                            <Button
                                size="sm"
                                variant="plain"
                                onClick={() => {
                                    setFilters({
                                        page: 1,
                                        pageSize: filters.pageSize ?? 25,
                                        sortBy: filters.sortBy,
                                        sortDir: filters.sortDir,
                                    })
                                    setSearchInput('')
                                }}
                            >
                                Clear filters
                            </Button>
                        ) : null}
                        <Button
                            size="sm"
                            variant="plain"
                            icon={<HiOutlineRefresh />}
                            loading={loading}
                            onClick={reload}
                        >
                            Refresh
                        </Button>
                        <Button
                            size="sm"
                            icon={<HiOutlineDownload />}
                            disabled={!items.length}
                            onClick={exportRows}
                        >
                            Export
                        </Button>
                        <Link href="/modules/fico/journal-entries/create">
                            <Button
                                size="sm"
                                variant="solid"
                                icon={<HiOutlinePlus />}
                                disabled={!companyId}
                            >
                                New journal
                            </Button>
                        </Link>
                    </div>
                </div>

                <p className="mb-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <HiOutlineDocumentText />
                    {loading
                        ? 'Loading journals…'
                        : `${total.toLocaleString()} document${total === 1 ? '' : 's'} in this view`}
                </p>

                <FicoResponsiveTable
                    columns={columns}
                    data={items}
                    mobile={mobile}
                    loading={loading}
                    noData={!loading && items.length === 0}
                    compact
                    tableMinWidthClass="min-w-[1080px]"
                    pagingData={{
                        total,
                        pageIndex: page - 1,
                        pageSize: filters.pageSize ?? 25,
                    }}
                    onPaginationChange={(p) => setPage(p + 1)}
                    onSelectChange={(size) =>
                        setFilters((prev) => ({
                            ...prev,
                            pageSize: size,
                            page: 1,
                        }))
                    }
                    pageSizes={[10, 25, 50, 100]}
                />
            </AdaptiveCard>
        </>
    )
}