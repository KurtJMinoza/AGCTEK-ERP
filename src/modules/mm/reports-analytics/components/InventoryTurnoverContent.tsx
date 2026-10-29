'use client'

import { useEffect, useMemo, useState } from 'react'
import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import Pagination from '@/components/ui/Pagination'
import { HiOutlineCube } from 'react-icons/hi'

export type TurnoverRow = {
    materialId?: string
    materialCode?: string
    materialName?: string
    issueQty: number
    averageOnHand: number
    turnover: number
}

export type TurnoverReportPayload = {
    rows?: TurnoverRow[]
    period?: { from?: string | Date; to?: string | Date }
}

const PAGE_SIZE = 15

function rowEnterClass(index: number) {
    const delay = Math.min(index, 14) * 40
    return `animate-mm-row-in motion-reduce:animate-none opacity-0 [animation-delay:${delay}ms]`
}

function formatQty(n: number) {
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatTurnover(n: number) {
    return Number(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    })
}

type Props = {
    data: TurnoverReportPayload | null
    loading: boolean
}

export default function InventoryTurnoverContent({ data, loading }: Props) {
    const [page, setPage] = useState(1)
    const allRows = data?.rows ?? []

    useEffect(() => {
        setPage(1)
    }, [data?.period?.from, data?.period?.to, allRows.length])

    const totalPages = Math.max(1, Math.ceil(allRows.length / PAGE_SIZE))
    const safePage = Math.min(page, totalPages)

    const rows = useMemo(() => {
        const start = (safePage - 1) * PAGE_SIZE
        return allRows.slice(start, start + PAGE_SIZE)
    }, [allRows, safePage])

    const columns = useMemo<ColumnDef<TurnoverRow>[]>(
        () => [
            {
                id: 'rank',
                header: '#',
                size: 48,
                cell: ({ row }) => (
                    <span className="tabular-nums text-xs font-semibold text-gray-500">
                        {(safePage - 1) * PAGE_SIZE + row.index + 1}
                    </span>
                ),
            },
            {
                accessorKey: 'materialCode',
                header: 'Code',
                cell: ({ row }) => (
                    <span className="font-mono text-xs font-semibold text-primary">
                        {row.original.materialCode ?? '—'}
                    </span>
                ),
            },
            {
                accessorKey: 'materialName',
                header: 'Name',
                cell: ({ row }) => (
                    <div className="flex min-w-0 items-center gap-2">
                        <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-deep sm:flex dark:bg-primary/15">
                            <HiOutlineCube className="text-sm" />
                        </span>
                        <span className="truncate text-sm text-gray-900 dark:text-gray-100">
                            {row.original.materialName ?? '—'}
                        </span>
                    </div>
                ),
            },
            {
                accessorKey: 'issueQty',
                header: 'Issue qty',
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm font-medium">
                        {formatQty(Number(row.original.issueQty))}
                    </span>
                ),
            },
            {
                accessorKey: 'averageOnHand',
                header: 'Avg on-hand',
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm text-gray-600 dark:text-gray-400">
                        {formatQty(Number(row.original.averageOnHand))}
                    </span>
                ),
            },
            {
                accessorKey: 'turnover',
                header: 'Turnover',
                cell: ({ row }) => (
                    <span className="tabular-nums text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatTurnover(Number(row.original.turnover))}
                    </span>
                ),
            },
        ],
        [safePage],
    )

    return (
        <div className="space-y-4">
            <div className="-mx-1 overflow-x-auto sm:mx-0">
                <DataTable
                    loading={loading}
                    columns={columns}
                    data={rows}
                    getRowId={(row, i) => row.materialId ?? `row-${i}`}
                    rowClassName={(_, index) => rowEnterClass(index)}
                    hidePagination
                    fit={false}
                />
            </div>

            {!loading && allRows.length === 0 && (
                <p className="py-6 text-center text-sm text-gray-500">
                    No turnover data for the selected filters.
                </p>
            )}

            {allRows.length > PAGE_SIZE && (
                <div className="flex flex-col items-center justify-between gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:flex-row">
                    <p className="text-sm text-gray-500">
                        {(safePage - 1) * PAGE_SIZE + 1}–
                        {Math.min(safePage * PAGE_SIZE, allRows.length)} of{' '}
                        {allRows.length.toLocaleString()}
                    </p>
                    <Pagination
                        currentPage={safePage}
                        total={allRows.length}
                        pageSize={PAGE_SIZE}
                        onChange={setPage}
                    />
                </div>
            )}
        </div>
    )
}
