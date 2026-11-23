'use client'

import type { CellContext, ColumnDef } from '@/components/shared/DataTable'
import type { MonthlyCollectionMonth, MonthlyCollectionRow } from '../services/monthlyCollectionService'
import {
    McArReferenceCell,
    McBucketAmountCell,
    McCollectionDateCell,
    McCustomerCell,
    McParticularCell,
    McTotalCell,
    primaryCollectionBucket,
    type CollectionBucketKey,
} from './MonthlyCollectionTableCells'

const RIGHT = { className: '!text-right' } as const

const bucketCell =
    (key: CollectionBucketKey) =>
    ({ row }: CellContext<MonthlyCollectionRow, unknown>) => {
        const primary = primaryCollectionBucket(row.original)
        return (
            <McBucketAmountCell
                amount={row.original[key]}
                bucket={key}
                highlight={primary === key}
            />
        )
    }

export function buildMonthlyCollectionDetailColumns(
    month: MonthlyCollectionMonth,
): ColumnDef<MonthlyCollectionRow>[] {
    const monthTotal = month.summary.total

    return [
        {
            id: 'document',
            header: 'Collection line',
            columns: [
                {
                    header: 'Date',
                    accessorKey: 'collectionDate',
                    size: 148,
                    minSize: 132,
                    cell: ({ row }) => (
                        <McCollectionDateCell
                            value={row.original.collectionDate}
                        />
                    ),
                },
                {
                    header: 'AR reference',
                    accessorKey: 'arNumber',
                    size: 150,
                    minSize: 130,
                    cell: ({ row }) => (
                        <McArReferenceCell row={row.original} />
                    ),
                },
                {
                    header: 'Customer',
                    accessorKey: 'customerName',
                    size: 200,
                    minSize: 160,
                    cell: ({ row }) => (
                        <McCustomerCell name={row.original.customerName} />
                    ),
                },
                {
                    header: 'Particular',
                    accessorKey: 'particular',
                    size: 220,
                    minSize: 180,
                    cell: ({ row }) => (
                        <McParticularCell value={row.original.particular} />
                    ),
                },
            ],
        },
        {
            id: 'tenders',
            header: () => (
                <span className="block text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                    Payment split
                </span>
            ),
            meta: { align: 'right' },
            columns: [
                {
                    header: 'Cash',
                    accessorKey: 'cash',
                    size: 118,
                    minSize: 100,
                    meta: RIGHT,
                    cell: bucketCell('cash'),
                },
                {
                    header: 'GCash',
                    accessorKey: 'gcash',
                    size: 118,
                    minSize: 100,
                    meta: RIGHT,
                    cell: bucketCell('gcash'),
                },
                {
                    header: 'Bank',
                    accessorKey: 'bankTransfer',
                    size: 118,
                    minSize: 100,
                    meta: RIGHT,
                    cell: bucketCell('bankTransfer'),
                },
                {
                    header: 'Cheque',
                    accessorKey: 'cheque',
                    size: 118,
                    minSize: 100,
                    meta: RIGHT,
                    cell: bucketCell('cheque'),
                },
                {
                    header: 'Others',
                    accessorKey: 'others',
                    size: 118,
                    minSize: 100,
                    meta: RIGHT,
                    cell: bucketCell('others'),
                },
            ],
        },
        {
            header: 'Line total',
            accessorKey: 'total',
            size: 140,
            minSize: 120,
            meta: RIGHT,
            cell: ({ row }) => (
                <McTotalCell row={row.original} monthTotal={monthTotal} />
            ),
        },
    ]
}