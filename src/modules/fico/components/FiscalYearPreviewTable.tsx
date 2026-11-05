'use client'

import DataTable, { type ColumnDef } from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import type { FicoFiscalYearPreview } from '../types'

type PreviewPeriod = FicoFiscalYearPreview['periods'][number]

const formatDate = (value: string) =>
    new Date(value).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    })

const columns: ColumnDef<PreviewPeriod>[] = [
    {
        header: 'Period',
        accessorKey: 'periodNumber',
        size: 70,
        cell: ({ row }) => (
            <span className="font-mono text-xs font-semibold">
                {String(row.original.periodNumber).padStart(2, '0')}
            </span>
        ),
    },
    { header: 'Name', accessorKey: 'name' },
    {
        header: 'Start',
        accessorKey: 'startDate',
        cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
        header: 'End',
        accessorKey: 'endDate',
        cell: ({ row }) => formatDate(row.original.endDate),
    },
    {
        header: 'Type',
        accessorKey: 'periodType',
        cell: ({ row }) =>
            row.original.periodType === 'SPECIAL' ? (
                <StatusBadge tone="warning">Year-end special</StatusBadge>
            ) : (
                <StatusBadge tone="default">Regular</StatusBadge>
            ),
    },
]

type Props = {
    preview: FicoFiscalYearPreview | null
    loading?: boolean
}

const FiscalYearPreviewTable = ({ preview, loading }: Props) => (
    <div className="space-y-3">
        {preview ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
                <span>
                    <span className="text-gray-400">FY {preview.fiscalYear}:</span>{' '}
                    {formatDate(preview.startDate)} – {formatDate(preview.endDate)}
                </span>
                <span>
                    <span className="text-gray-400">Period type:</span>{' '}
                    {preview.periodType.replace(/_/g, ' ').toLowerCase()}
                </span>
                <span>
                    <span className="text-gray-400">Year label:</span>{' '}
                    {preview.yearAssignment === 'YEAR_END' ? 'end year' : 'start year'}
                </span>
            </div>
        ) : null}
        <div className="max-h-96 overflow-y-auto">
            <DataTable
                columns={columns}
                data={preview?.periods ?? []}
                loading={loading}
                noData={!loading && !preview?.periods.length}
                compact
                hidePagination
                getRowId={(row) => String(row.periodNumber)}
            />
        </div>
    </div>
)

export default FiscalYearPreviewTable
