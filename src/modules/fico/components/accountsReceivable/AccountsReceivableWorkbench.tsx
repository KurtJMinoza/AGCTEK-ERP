'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import AdaptiveCard from '@/components/shared/AdaptiveCard'
import StatCard from '@/components/shared/StatCard'
import Button from '@/components/ui/Button'
import Checkbox from '@/components/ui/Checkbox'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { FormItem } from '@/components/ui/Form'
import {
    HiOutlineClipboardList,
    HiOutlineExclamation,
    HiOutlineRefresh,
    HiOutlineSearch,
} from 'react-icons/hi'
import FicoResponsiveTable, { type ColumnDef } from '../FicoResponsiveTable'
import {
    FICO_TABLE_COL_RIGHT,
    FicoTwoLineCell,
    ficoStatusTone,
} from '../ficoTableUi'
import { notifyError } from '../FicoCompanySelect'
import { ficoAccountsReceivableService } from '../../services/ficoService'
import type {
    FicoArAgingBucket,
    FicoArAgingResponse,
    FicoArOpenItem,
} from '../../types'
import {
    AGING_BUCKET_LABEL,
    AR_AGING_BUCKET_ORDER,
    ArAgingBucketBadge,
    ArOpenItemStatus,
    arBucketAmount,
    formatArDate,
    formatArMoney,
} from './arUi'

const STATUS_OPTIONS = [
    { value: '', label: 'Open & partial' },
    { value: 'OPEN', label: 'Open' },
    { value: 'PARTIALLY_CLEARED', label: 'Partially cleared' },
    { value: 'CLEARED', label: 'Cleared' },
    { value: 'REVERSED', label: 'Reversed' },
]

const STAT_TONE: Record<FicoArAgingBucket, 'success' | 'info' | 'warning' | 'danger' | 'default'> = {
    CURRENT: 'success',
    D1_30: 'info',
    D31_60: 'warning',
    D61_90: 'warning',
    D90_PLUS: 'danger',
}

type Props = {
    companyId: string
}

export default function AccountsReceivableWorkbench({ companyId }: Props) {
    const router = useRouter()
    const [items, setItems] = useState<FicoArOpenItem[]>([])
    const [aging, setAging] = useState<FicoArAgingResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [searchInput, setSearchInput] = useState('')
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('')
    const [overdueOnly, setOverdueOnly] = useState(false)

    useEffect(() => {
        const timer = window.setTimeout(() => setSearch(searchInput.trim()), 350)
        return () => window.clearTimeout(timer)
    }, [searchInput])

    const reload = useCallback(() => {
        if (!companyId) return
        setLoading(true)
        Promise.all([
            ficoAccountsReceivableService.listOpenItems({
                companyId,
                search: search || undefined,
                status: status || undefined,
                overdueOnly: overdueOnly || undefined,
            }),
            ficoAccountsReceivableService.getAging(companyId),
        ])
            .then(([openItems, agingRes]) => {
                setItems(openItems)
                setAging(agingRes)
            })
            .catch((error) => notifyError(error, 'Unable to load AR open items.'))
            .finally(() => setLoading(false))
    }, [companyId, search, status, overdueOnly])

    useEffect(() => {
        reload()
    }, [reload])

    const openDetail = (documentId: string) =>
        router.push(`/modules/fico/accounts-receivable/${documentId}`)

    const columns = useMemo<ColumnDef<FicoArOpenItem>[]>(
        () => [
            {
                header: 'Customer',
                id: 'customer',
                cell: ({ row }) =>
                    row.original.customer ? (
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
                header: 'SD invoice',
                id: 'invoice',
                cell: ({ row }) => {
                    const inv = row.original.document?.sourceSalesInvoice
                    if (!inv) {
                        return (
                            <span className="text-sm text-gray-500">
                                {row.original.document?.referenceNumber ?? '—'}
                            </span>
                        )
                    }
                    return (
                        <button
                            type="button"
                            className="text-left text-sm font-medium text-primary hover:underline"
                            onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/modules/sd/billing/${inv.id}`)
                            }}
                        >
                            {inv.invoiceNumber}
                        </button>
                    )
                },
            },
            {
                header: 'FICO doc',
                id: 'ficoDoc',
                cell: ({ row }) => {
                    const je = row.original.document?.journalEntry
                    const label =
                        je?.documentNumber ??
                        row.original.document?.referenceNumber ??
                        '—'
                    return (
                        <button
                            type="button"
                            className="text-left text-sm font-semibold text-gray-900 hover:text-primary dark:text-gray-100"
                            onClick={() => openDetail(row.original.documentId)}
                        >
                            {label}
                        </button>
                    )
                },
            },
            {
                header: 'Open amount',
                id: 'openAmount',
                size: 140,
                meta: FICO_TABLE_COL_RIGHT,
                cell: ({ row }) => (
                    <span className="block w-full text-right text-sm font-semibold tabular-nums">
                        {formatArMoney(
                            row.original.currencyCode,
                            row.original.openAmount,
                        )}
                    </span>
                ),
            },
            {
                header: 'Due date',
                id: 'dueDate',
                cell: ({ row }) => (
                    <span className="whitespace-nowrap text-sm tabular-nums">
                        {formatArDate(row.original.dueDate)}
                    </span>
                ),
            },
            {
                header: 'Status',
                accessorKey: 'status',
                cell: ({ row }) => <ArOpenItemStatus status={row.original.status} />,
            },
            {
                header: 'Aging',
                id: 'aging',
                cell: ({ row }) => (
                    <div className="flex flex-col gap-0.5">
                        <ArAgingBucketBadge bucket={row.original.agingBucket} />
                        {row.original.daysPastDue != null &&
                        row.original.daysPastDue > 0 ? (
                            <span className="text-[11px] text-gray-500">
                                {row.original.daysPastDue}d past due
                            </span>
                        ) : null}
                    </div>
                ),
            },
        ],
        [router],
    )

    const mobile = useMemo(
        () => ({
            title: (row: FicoArOpenItem) =>
                row.document?.sourceSalesInvoice?.invoiceNumber ??
                row.document?.referenceNumber ??
                row.id,
            subtitle: (row: FicoArOpenItem) =>
                row.customer
                    ? `${row.customer.customerNumber} · ${row.customer.companyName}`
                    : undefined,
            status: (row: FicoArOpenItem) => ({
                text: row.status.replace(/_/g, ' '),
                tone: ficoStatusTone(row.status, {
                    OPEN: 'warning',
                    PARTIALLY_CLEARED: 'info',
                    CLEARED: 'success',
                    REVERSED: 'default',
                }),
            }),
            onPress: (row: FicoArOpenItem) => openDetail(row.documentId),
            fields: [
                {
                    label: 'Open amount',
                    value: (row: FicoArOpenItem) =>
                        formatArMoney(row.currencyCode, row.openAmount),
                },
                {
                    label: 'Due',
                    value: (row: FicoArOpenItem) => formatArDate(row.dueDate),
                },
                {
                    label: 'Aging',
                    value: (row: FicoArOpenItem) =>
                        row.agingBucket
                            ? AGING_BUCKET_LABEL[row.agingBucket]
                            : '—',
                },
            ],
        }),
        [router],
    )

    return (
        <>
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
                {AR_AGING_BUCKET_ORDER.map((bucket) => {
                    const currency = items[0]?.currencyCode ?? 'PHP'
                    return (
                        <StatCard
                            key={bucket}
                            label={AGING_BUCKET_LABEL[bucket]}
                            value={
                                aging
                                    ? formatArMoney(
                                          currency,
                                          arBucketAmount(
                                              aging.buckets as Record<
                                                  string,
                                                  string | { toString(): string }
                                              >,
                                              bucket,
                                          ),
                                      )
                                    : '—'
                            }
                            tone={STAT_TONE[bucket]}
                            loading={loading && !aging}
                            icon={
                                bucket === 'D90_PLUS' ? (
                                    <HiOutlineExclamation />
                                ) : (
                                    <HiOutlineClipboardList />
                                )
                            }
                        />
                    )
                })}
            </div>

            <AdaptiveCard>
                <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                        <FormItem label="Search" className="mb-0 w-full sm:max-w-xs">
                            <Input
                                size="sm"
                                placeholder="Customer, invoice #…"
                                prefix={<HiOutlineSearch className="text-lg" />}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                        </FormItem>
                        <FormItem label="Status" className="mb-0 w-full sm:w-48">
                            <Select
                                size="sm"
                                options={STATUS_OPTIONS}
                                value={
                                    STATUS_OPTIONS.find((o) => o.value === status) ??
                                    STATUS_OPTIONS[0]
                                }
                                onChange={(opt) =>
                                    setStatus((opt as { value: string })?.value ?? '')
                                }
                            />
                        </FormItem>
                        <Checkbox
                            className="mb-1"
                            checked={overdueOnly}
                            onChange={(checked) => setOverdueOnly(Boolean(checked))}
                        >
                            Overdue only
                        </Checkbox>
                    </div>
                    <Button
                        size="sm"
                        variant="plain"
                        icon={<HiOutlineRefresh />}
                        loading={loading}
                        onClick={reload}
                    >
                        Refresh
                    </Button>
                </div>

                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    {loading
                        ? 'Loading open items…'
                        : `${items.length.toLocaleString()} open item${items.length === 1 ? '' : 's'}`}
                </p>

                <FicoResponsiveTable
                    columns={columns}
                    data={items}
                    mobile={mobile}
                    loading={loading}
                    noData={!loading && items.length === 0}
                    compact
                    tableMinWidthClass="min-w-[960px]"
                    pagingData={{
                        total: items.length,
                        pageIndex: 0,
                        pageSize: Math.max(items.length, 1),
                    }}
                    hidePagination
                />
            </AdaptiveCard>
        </>
    )
}
