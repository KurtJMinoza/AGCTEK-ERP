'use client'

import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Alert from '@/components/ui/Alert'
import DataTable from '@/components/shared/DataTable'
import StatusBadge from '@/components/shared/StatusBadge'
import type { LoyaltySummary, LoyaltyTransaction } from '../types'
import { formatDate, formatEnumLabel } from '../utils/format'

type LoyaltyPanelProps = {
    loyalty: LoyaltySummary | null
    loading?: boolean
    error?: string | null
}

export default function LoyaltyPanel({ loyalty, loading, error }: LoyaltyPanelProps) {
    const columns = useMemo<ColumnDef<LoyaltyTransaction>[]>(
        () => [
            { header: 'Date', cell: ({ row }) => formatDate(row.original.createdAt) },
            {
                header: 'Type',
                cell: ({ row }) => <StatusBadge>{formatEnumLabel(row.original.type)}</StatusBadge>,
            },
            {
                header: 'Points',
                cell: ({ row }) => (
                    <span
                        className={
                            row.original.points < 0
                                ? 'tabular-nums text-red-600'
                                : 'tabular-nums text-emerald-600'
                        }
                    >
                        {row.original.points > 0 ? '+' : ''}
                        {row.original.points}
                    </span>
                ),
            },
            {
                header: 'Reference',
                cell: ({ row }) =>
                    row.original.referenceType
                        ? `${row.original.referenceType} ${row.original.referenceId ?? ''}`.trim()
                        : '—',
            },
            { header: 'Note', cell: ({ row }) => row.original.note || '—' },
        ],
        [],
    )

    if (error) {
        return (
            <Alert showIcon type="danger">
                {error}
            </Alert>
        )
    }

    if (!loading && loyalty && !loyalty.accountId) {
        return (
            <p className="text-sm text-gray-500">
                No loyalty account yet. Point accrual from sales is not enabled.
            </p>
        )
    }

    return (
        <DataTable
            columns={columns}
            data={loyalty?.transactions ?? []}
            loading={loading}
            noData={!loading && (loyalty?.transactions.length ?? 0) === 0}
            hidePagination
        />
    )
}
